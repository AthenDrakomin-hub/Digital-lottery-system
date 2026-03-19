/**
 * 补偿Worker
 * 从消息队列消费补偿任务，处理遗漏的开奖和结算
 */

const dbConnect = require('../lib/db');
const Draw = require('../models/Draw');
const Bet = require('../models/Bet');
const { queue, QUEUE_NAMES, CONSUMER_GROUPS } = require('../lib/queue');
const { drawLock } = require('../lib/lock');
const { executeSettlement } = require('./settlement');

// Worker配置
const WORKER_CONFIG = {
    consumerName: `compensation-worker-${process.pid || Date.now()}`,
    batchSize: 5,
    pollInterval: 10000,    // 补偿任务轮询间隔较长
    isRunning: false
};

/**
 * 生成随机开奖结果
 */
function generateRandomResult() {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = digits.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits.join('');
}

/**
 * 处理补偿任务
 */
async function processCompensation(message) {
    const { type, date, interval, period, reason } = message;
    
    console.log(`[CompensationWorker] 处理补偿任务: ${type} ${date} ${interval}分钟 第${period + 1}期 原因: ${reason}`);
    
    await dbConnect();

    if (type === 'missed_draw') {
        // 补开遗漏的期号
        const lockResult = await drawLock.acquire(date, interval, period, 30000);
        
        if (!lockResult.success) {
            console.log(`[CompensationWorker] 跳过已处理的期号: ${date} ${interval}分钟 第${period + 1}期`);
            return { skipped: true, reason: 'already_processed' };
        }

        try {
            // 再次检查是否已开奖
            const existing = await Draw.findOne({
                date,
                interval,
                period,
                status: { $in: ['drawn', 'settled'] }
            });

            if (existing) {
                console.log(`[CompensationWorker] 期号已开奖: ${date} ${interval}分钟 第${period + 1}期`);
                return { skipped: true, reason: 'already_drawn' };
            }

            // 查找预设结果
            const preset = await Draw.findOne({ date, interval, period });
            const result = preset && preset.result && /^\d{10}$/.test(preset.result)
                ? preset.result
                : generateRandomResult();

            // 更新开奖记录
            await Draw.findOneAndUpdate(
                { date, interval, period },
                { result, status: 'drawn', updatedAt: new Date() },
                { upsert: true }
            );

            // 执行结算
            const settlementResult = await executeSettlement(date, interval, period, result);

            return {
                success: true,
                type: 'missed_draw',
                date,
                interval,
                period: period + 1,
                result,
                settlement: settlementResult
            };
        } finally {
            if (lockResult.value) {
                await drawLock.release(date, interval, period, lockResult.value);
            }
        }
    } else if (type === 'missed_settlement') {
        // 补结算遗漏的期号
        const draw = await Draw.findOne({ date, interval, period });
        
        if (!draw) {
            console.log(`[CompensationWorker] 开奖记录不存在: ${date} ${interval}分钟 第${period + 1}期`);
            return { success: false, reason: 'draw_not_found' };
        }

        if (draw.status === 'settled') {
            console.log(`[CompensationWorker] 期号已结算: ${date} ${interval}分钟 第${period + 1}期`);
            return { skipped: true, reason: 'already_settled' };
        }

        // 执行结算
        const settlementResult = await executeSettlement(date, interval, period, draw.result);

        return {
            success: true,
            type: 'missed_settlement',
            date,
            interval,
            period: period + 1,
            settlement: settlementResult
        };
    }

    return { success: false, reason: 'unknown_type' };
}

/**
 * 定期扫描遗漏的期号
 */
async function scanMissedPeriods() {
    await dbConnect();

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();

    console.log(`[CompensationWorker] 扫描遗漏期号: ${dateStr}`);

    for (const interval of [5, 10, 15]) {
        const currentPeriod = Math.floor(minutesSinceMidnight / interval);
        
        // 查询该日期该周期所有已开奖的期号
        const drawnPeriods = await Draw.find({
            date: dateStr,
            interval,
            status: { $in: ['drawn', 'settled'] }
        }).distinct('period');

        const drawnSet = new Set(drawnPeriods);

        // 检查是否有遗漏（只检查最近10期，避免处理太久远的遗漏）
        const lookbackPeriods = Math.min(10, currentPeriod);
        
        for (let period = Math.max(0, currentPeriod - lookbackPeriods); period < currentPeriod; period++) {
            if (!drawnSet.has(period)) {
                console.log(`[CompensationWorker] 发现遗漏期号: ${dateStr} ${interval}分钟 第${period + 1}期`);
                
                // 发布补偿任务
                await queue.publishCompensation({
                    type: 'missed_draw',
                    date: dateStr,
                    interval,
                    period,
                    reason: 'auto_scan'
                });
            }
        }

        // 检查已开奖但未结算的期号
        const drawnNotSettled = await Draw.find({
            date: dateStr,
            interval,
            status: 'drawn'
        });

        for (const draw of drawnNotSettled) {
            // 检查是否有待结算的投注
            const pendingBets = await Bet.countDocuments({
                date: draw.date,
                interval: draw.interval,
                period: draw.period,
                status: 'pending'
            });

            if (pendingBets > 0) {
                console.log(`[CompensationWorker] 发现遗漏结算: ${dateStr} ${interval}分钟 第${draw.period + 1}期`);
                
                await queue.publishCompensation({
                    type: 'missed_settlement',
                    date: draw.date,
                    interval: draw.interval,
                    period: draw.period,
                    reason: 'auto_scan'
                });
            }
        }
    }
}

/**
 * Worker主循环
 */
async function startWorker() {
    if (WORKER_CONFIG.isRunning) {
        console.log('[CompensationWorker] Worker已在运行中');
        return;
    }

    WORKER_CONFIG.isRunning = true;

    console.log(`[CompensationWorker] Worker启动: ${WORKER_CONFIG.consumerName}`);

    // 初始化队列
    await queue.init();

    // 定期扫描遗漏期号（每5分钟）
    let lastScanTime = 0;
    const scanInterval = 5 * 60 * 1000; // 5分钟

    // 主循环
    while (WORKER_CONFIG.isRunning) {
        try {
            const now = Date.now();
            
            // 定期扫描遗漏期号
            if (now - lastScanTime > scanInterval) {
                await scanMissedPeriods();
                lastScanTime = now;
            }

            // 消费消息
            const messages = await queue.consume(
                QUEUE_NAMES.COMPENSATION,
                CONSUMER_GROUPS.COMPENSATION_WORKER,
                WORKER_CONFIG.consumerName,
                WORKER_CONFIG.batchSize,
                WORKER_CONFIG.pollInterval
            );

            if (messages.length === 0) {
                // 没有消息，检查待处理消息
                const pendingMessages = await queue.getPending(
                    QUEUE_NAMES.COMPENSATION,
                    CONSUMER_GROUPS.COMPENSATION_WORKER
                );
                
                for (const msg of pendingMessages) {
                    console.log(`[CompensationWorker] 处理待重试消息: ${msg._id}`);
                    await processCompensation(msg);
                    await queue.ack(QUEUE_NAMES.COMPENSATION, CONSUMER_GROUPS.COMPENSATION_WORKER, msg._id);
                }
                continue;
            }

            // 处理消息
            for (const message of messages) {
                try {
                    console.log(`[CompensationWorker] 处理消息: ${message._id}`);
                    const result = await processCompensation(message);
                    console.log(`[CompensationWorker] 处理结果:`, result);
                    
                    // 确认消息
                    await queue.ack(QUEUE_NAMES.COMPENSATION, CONSUMER_GROUPS.COMPENSATION_WORKER, message._id);
                } catch (error) {
                    console.error(`[CompensationWorker] 处理消息失败: ${message._id}`, error);
                    // 不确认消息，等待重试
                }
            }
        } catch (error) {
            console.error('[CompensationWorker] Worker错误:', error);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

/**
 * 停止Worker
 */
function stopWorker() {
    console.log('[CompensationWorker] 正在停止Worker...');
    WORKER_CONFIG.isRunning = false;
}

module.exports = {
    startWorker,
    stopWorker,
    processCompensation,
    scanMissedPeriods,
    WORKER_CONFIG
};
