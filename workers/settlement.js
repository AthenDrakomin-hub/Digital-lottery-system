/**
 * 开奖结算Worker
 * 从消息队列消费开奖结算任务，执行投注结算
 */

const dbConnect = require('../lib/db');
const Bet = require('../models/Bet');
const User = require('../models/User');
const Draw = require('../models/Draw');
const { queue, QUEUE_NAMES, CONSUMER_GROUPS } = require('../lib/queue');
const { drawLock } = require('../lib/lock');
const cache = require('../lib/cache');

// Worker配置
const WORKER_CONFIG = {
    consumerName: `settlement-worker-${process.pid || Date.now()}`,
    batchSize: 10,           // 每次处理的消息数量
    pollInterval: 5000,      // 轮询间隔（毫秒）
    maxRetries: 3,           // 最大重试次数
    isRunning: false
};

/**
 * 开奖结果处理类
 */
class DrawSettlementProcessor {
    /**
     * 判断投注是否中奖
     * @param {object} bet - 投注记录
     * @param {string} result - 开奖结果（10位数字）
     * @returns {object} { isWin, winAmount }
     */
    checkWin(bet, result) {
        const { betType, numbers, amount, odds } = bet;
        
        switch (betType) {
            case 'direct':
                // 直选：投注号码与开奖结果完全匹配
                return this.checkDirectWin(numbers, result, amount, odds);
            
            case 'group':
                // 组选：投注号码与开奖结果数字相同，顺序不限
                return this.checkGroupWin(numbers, result, amount, odds);
            
            case 'bigSmall':
                // 大小单双
                return this.checkBigSmallWin(numbers, result, amount, odds);
            
            case 'dragonTiger':
                // 龙虎
                return this.checkDragonTigerWin(numbers, result, amount, odds);
            
            default:
                return { isWin: false, winAmount: 0 };
        }
    }

    /**
     * 直选玩法
     */
    checkDirectWin(numbers, result, amount, odds) {
        if (numbers === result) {
            return { isWin: true, winAmount: Math.floor(amount * odds * 10000) }; // 假设赔率10000倍
        }
        return { isWin: false, winAmount: 0 };
    }

    /**
     * 组选玩法
     */
    checkGroupWin(numbers, result, amount, odds) {
        // 将投注号码和开奖结果排序后比较
        const sortedNumbers = numbers.split('').sort().join('');
        const sortedResult = result.split('').sort().join('');
        
        if (sortedNumbers === sortedResult) {
            return { isWin: true, winAmount: Math.floor(amount * odds * 1000) }; // 假设赔率1000倍
        }
        return { isWin: false, winAmount: 0 };
    }

    /**
     * 大小单双玩法
     */
    checkBigSmallWin(numbers, result, amount, odds) {
        // 取开奖结果的最后一位作为判断依据
        const lastDigit = parseInt(result[result.length - 1]);
        const isBig = lastDigit >= 5;      // 大：5-9
        const isSmall = lastDigit < 5;     // 小：0-4
        const isOdd = lastDigit % 2 === 1; // 单：奇数
        const isEven = lastDigit % 2 === 0; // 双：偶数

        let match = false;
        switch (numbers) {
            case 'big':
                match = isBig;
                break;
            case 'small':
                match = isSmall;
                break;
            case 'odd':
                match = isOdd;
                break;
            case 'even':
                match = isEven;
                break;
            case 'bigOdd':
                match = isBig && isOdd;
                break;
            case 'bigEven':
                match = isBig && isEven;
                break;
            case 'smallOdd':
                match = isSmall && isOdd;
                break;
            case 'smallEven':
                match = isSmall && isEven;
                break;
        }

        if (match) {
            return { isWin: true, winAmount: Math.floor(amount * odds * 2) }; // 假设赔率2倍
        }
        return { isWin: false, winAmount: 0 };
    }

    /**
     * 龙虎玩法
     */
    checkDragonTigerWin(numbers, result, amount, odds) {
        // 假设前5位是龙，后5位是虎
        const dragonSum = result.slice(0, 5).split('').reduce((a, b) => a + parseInt(b), 0);
        const tigerSum = result.slice(5).split('').reduce((a, b) => a + parseInt(b), 0);

        let match = false;
        switch (numbers) {
            case 'dragon':
                match = dragonSum > tigerSum;
                break;
            case 'tiger':
                match = tigerSum > dragonSum;
                break;
            case 'tie':
                match = dragonSum === tigerSum;
                break;
        }

        if (match) {
            return { isWin: true, winAmount: Math.floor(amount * odds * 2) }; // 假设赔率2倍
        }
        return { isWin: false, winAmount: 0 };
    }

    /**
     * 处理单个开奖结算
     * @param {object} message - 消息内容
     */
    async processSettlement(message) {
        const { date, interval, period, result } = message;
        
        console.log(`[SettlementWorker] 开始处理结算: ${date} ${interval}分钟 第${period + 1}期`);
        
        // 使用分布式锁确保幂等性
        const lockResult = await drawLock.withDrawLock(date, interval, period, async () => {
            await dbConnect();
            
            // 再次检查是否已经结算（双重保险）
            const draw = await Draw.findOne({ date, interval, period });
            if (!draw) {
                throw new Error('开奖记录不存在');
            }
            
            if (draw.status === 'settled') {
                console.log(`[SettlementWorker] 期号已结算，跳过: ${date} ${interval}分钟 第${period + 1}期`);
                return { skipped: true, reason: 'already_settled' };
            }

            // 获取该期所有待结算的投注
            const pendingBets = await Bet.find({
                date,
                interval,
                period,
                status: 'pending'
            });

            console.log(`[SettlementWorker] 找到 ${pendingBets.length} 条待结算投注`);

            // 统计信息
            let totalWinAmount = 0;
            let wonCount = 0;
            let lostCount = 0;

            // 处理每笔投注
            for (const bet of pendingBets) {
                const { isWin, winAmount } = this.checkWin(bet, result);
                
                // 更新投注状态
                bet.status = isWin ? 'won' : 'lost';
                bet.winAmount = winAmount;
                bet.result = result;
                bet.settledAt = new Date();
                await bet.save();

                if (isWin) {
                    // 更新用户余额
                    await User.findByIdAndUpdate(bet.userId, { $inc: { balance: winAmount } });
                    // 更新用户余额缓存
                    const user = await User.findById(bet.userId);
                    await cache.setUserBalance(bet.userId.toString(), user.balance);
                    
                    totalWinAmount += winAmount;
                    wonCount++;
                } else {
                    lostCount++;
                }
            }

            // 更新开奖状态
            draw.status = 'settled';
            draw.settledAt = new Date();
            draw.settlementStats = {
                totalBets: pendingBets.length,
                wonBets: wonCount,
                lostBets: lostCount,
                totalWinAmount
            };
            await draw.save();

            return {
                success: true,
                totalBets: pendingBets.length,
                wonBets: wonCount,
                lostBets: lostCount,
                totalWinAmount
            };
        });

        return lockResult;
    }
}

/**
 * Worker主循环
 */
async function startWorker() {
    if (WORKER_CONFIG.isRunning) {
        console.log('[SettlementWorker] Worker已在运行中');
        return;
    }

    WORKER_CONFIG.isRunning = true;
    const processor = new DrawSettlementProcessor();

    console.log(`[SettlementWorker] Worker启动: ${WORKER_CONFIG.consumerName}`);

    // 初始化队列
    await queue.init();

    // 主循环
    while (WORKER_CONFIG.isRunning) {
        try {
            // 消费消息
            const messages = await queue.consume(
                QUEUE_NAMES.DRAW_SETTLEMENT,
                CONSUMER_GROUPS.SETTLEMENT_WORKER,
                WORKER_CONFIG.consumerName,
                WORKER_CONFIG.batchSize,
                WORKER_CONFIG.pollInterval
            );

            if (messages.length === 0) {
                // 没有消息，检查待处理消息
                const pendingMessages = await queue.getPending(
                    QUEUE_NAMES.DRAW_SETTLEMENT,
                    CONSUMER_GROUPS.SETTLEMENT_WORKER
                );
                
                for (const msg of pendingMessages) {
                    console.log(`[SettlementWorker] 处理待重试消息: ${msg._id}`);
                    await processor.processSettlement(msg);
                    await queue.ack(QUEUE_NAMES.DRAW_SETTLEMENT, CONSUMER_GROUPS.SETTLEMENT_WORKER, msg._id);
                }
                continue;
            }

            // 处理消息
            for (const message of messages) {
                try {
                    console.log(`[SettlementWorker] 处理消息: ${message._id}`);
                    const result = await processor.processSettlement(message);
                    console.log(`[SettlementWorker] 处理结果:`, result);
                    
                    // 确认消息
                    await queue.ack(QUEUE_NAMES.DRAW_SETTLEMENT, CONSUMER_GROUPS.SETTLEMENT_WORKER, message._id);
                } catch (error) {
                    console.error(`[SettlementWorker] 处理消息失败: ${message._id}`, error);
                    // 不确认消息，等待重试
                }
            }
        } catch (error) {
            console.error('[SettlementWorker] Worker错误:', error);
            // 错误后等待一段时间再继续
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

/**
 * 停止Worker
 */
function stopWorker() {
    console.log('[SettlementWorker] 正在停止Worker...');
    WORKER_CONFIG.isRunning = false;
}

/**
 * 单次执行结算（用于API触发）
 */
async function executeSettlement(date, interval, period, result) {
    const processor = new DrawSettlementProcessor();
    return await processor.processSettlement({
        date,
        interval,
        period,
        result
    });
}

module.exports = {
    startWorker,
    stopWorker,
    executeSettlement,
    DrawSettlementProcessor,
    WORKER_CONFIG
};
