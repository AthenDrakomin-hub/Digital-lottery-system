/**
 * 自动开奖结算API
 * 供外部定时服务（如 cron-job.org）每分钟调用
 * 
 * 功能：
 * 1. 找出当前时间对应的各周期（5/10/15分钟）待开奖期次
 * 2. 若该期未开奖，则获取预设结果（或随机生成）并存入 Draw
 * 3. 结算该期所有投注
 * 
 * 调用方式：GET /api/cron/check-draws?secret=YOUR_CRON_SECRET
 */

const dbConnect = require('../../lib/db');
const Draw = require('../../models/Draw');
const Bet = require('../../models/Bet');
const User = require('../../models/User');

// 配置常量
const CONFIG = {
    // 支持的周期（分钟）
    INTERVALS: [5, 10, 15],
    // 每批处理的投注数量
    BATCH_SIZE: 500,
    // 函数超时时间（毫秒）- Vercel免费版10秒
    FUNCTION_TIMEOUT: 9000,
    // 结果长度
    RESULT_LENGTH: 10
};

/**
 * 生成随机10位数字字符串
 * @returns {string}
 */
function generateRandomResult() {
    let result = '';
    for (let i = 0; i < CONFIG.RESULT_LENGTH; i++) {
        result += Math.floor(Math.random() * 10);
    }
    return result;
}

/**
 * 获取当前时间的期号信息
 * @param {number} interval - 周期（分钟）
 * @returns {object} { date, period, endTime }
 */
function getCurrentPeriod(interval) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const date = `${year}-${month}-${day}`;
    
    // 计算当前是一天中的第几分钟
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    
    // 计算当前期号（刚刚结束的期号）
    // 例如：5分钟周期，当前10:03，则第2期(10:00-10:05)还未结束，第1期(09:55-10:00)已结束
    // 我们需要开奖的是"刚刚结束"的那一期
    const currentPeriod = Math.floor(minutesSinceMidnight / interval);
    
    // 该期的结束时间
    const periodEndMinutes = (currentPeriod + 1) * interval;
    const endHour = Math.floor(periodEndMinutes / 60);
    const endMinute = periodEndMinutes % 60;
    
    return {
        date,
        period: currentPeriod,
        endTime: `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
    };
}

/**
 * 开奖单期
 * @param {string} date - 日期 YYYY-MM-DD
 * @param {number} interval - 周期
 * @param {number} period - 期号
 * @param {object} session - MongoDB session（可选）
 * @returns {object} { success, draw, isNew, error }
 */
async function drawPeriod(date, interval, period, session = null) {
    try {
        // 查找是否已有该期的开奖记录
        let draw = await Draw.findOne({ date, interval, period }).session(session);
        
        if (draw && draw.status === 'settled') {
            // 已结算，跳过
            return { success: true, draw, isNew: false, alreadySettled: true };
        }
        
        if (!draw) {
            // 没有预设结果，生成随机结果
            const result = generateRandomResult();
            
            draw = await Draw.create([{
                date,
                interval,
                period,
                result,
                status: 'drawn'
            }], { session });
            
            draw = draw[0];
        } else if (draw.status === 'pending') {
            // 有预设结果但未开奖
            draw.status = 'drawn';
            await draw.save({ session });
        }
        
        return { success: true, draw, isNew: !draw };
    } catch (error) {
        console.error(`开奖失败 [${date} ${interval}分钟 第${period + 1}期]:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * 结算单期投注（分批处理）
 * @param {object} draw - 开奖记录
 * @param {object} session - MongoDB session
 * @returns {object} { success, stats }
 */
async function settleBets(draw, session = null) {
    const startTime = Date.now();
    const stats = {
        totalBets: 0,
        wonBets: 0,
        lostBets: 0,
        totalWinAmount: 0,
        errors: []
    };
    
    try {
        // 获取冠军数字（开奖结果第一位）
        const championNumber = parseInt(draw.result[0]);
        
        // 分批处理投注
        let skip = 0;
        let hasMore = true;
        
        while (hasMore) {
            // 检查是否超时
            if (Date.now() - startTime > CONFIG.FUNCTION_TIMEOUT) {
                stats.errors.push('函数即将超时，部分投注未结算');
                break;
            }
            
            // 获取一批待结算投注
            const bets = await Bet.find({
                date: draw.date,
                interval: draw.interval,
                period: draw.period,
                status: 'pending'
            })
            .skip(skip)
            .limit(CONFIG.BATCH_SIZE)
            .session(session);
            
            if (bets.length === 0) {
                hasMore = false;
                break;
            }
            
            // 处理这批投注
            for (const bet of bets) {
                try {
                    let isWin = false;
                    let winAmount = 0;
                    
                    // 根据玩法类型结算
                    if (bet.betType === 'champion' && bet.championNumbers) {
                        // 冠军玩法：检查冠军数字是否在投注数字中
                        isWin = bet.championNumbers.includes(championNumber);
                        winAmount = isWin ? 19.5 : 0; // 固定中奖金额
                    } else {
                        // 其他玩法（待扩展）
                        // TODO: 实现其他玩法的结算逻辑
                        stats.errors.push(`未实现的玩法类型: ${bet.betType}`);
                        continue;
                    }
                    
                    // 更新投注状态
                    bet.status = isWin ? 'won' : 'lost';
                    bet.winAmount = winAmount;
                    bet.result = draw.result;
                    bet.championNumber = championNumber;
                    bet.settledAt = new Date();
                    
                    await bet.save({ session });
                    
                    // 如果中奖，更新用户余额
                    if (isWin && winAmount > 0) {
                        await User.findByIdAndUpdate(
                            bet.userId,
                            { $inc: { balance: winAmount } },
                            { session }
                        );
                    }
                    
                    // 更新统计
                    stats.totalBets++;
                    if (isWin) {
                        stats.wonBets++;
                        stats.totalWinAmount += winAmount;
                    } else {
                        stats.lostBets++;
                    }
                    
                } catch (betError) {
                    stats.errors.push(`投注结算失败 [${bet._id}]: ${betError.message}`);
                }
            }
            
            // 如果返回数量小于批次大小，说明没有更多了
            if (bets.length < CONFIG.BATCH_SIZE) {
                hasMore = false;
            } else {
                skip += CONFIG.BATCH_SIZE;
            }
        }
        
        // 更新开奖记录状态
        draw.status = 'settled';
        draw.settledAt = new Date();
        draw.settlementStats = {
            totalBets: stats.totalBets,
            wonBets: stats.wonBets,
            lostBets: stats.lostBets,
            totalWinAmount: stats.totalWinAmount
        };
        await draw.save({ session });
        
        return { success: true, stats };
        
    } catch (error) {
        console.error('结算失败:', error);
        stats.errors.push(error.message);
        return { success: false, stats };
    }
}

/**
 * 主处理函数
 */
module.exports = async (req, res) => {
    const startTime = Date.now();
    
    // 验证请求方法
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: '方法不允许' });
    }
    
    // 验证密钥
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = req.query.secret || req.headers['x-cron-secret'];
    
    if (cronSecret && providedSecret !== cronSecret) {
        return res.status(401).json({ error: '未授权访问' });
    }
    
    // 如果没有设置密钥，给出警告（开发环境）
    if (!cronSecret) {
        console.warn('⚠️ CRON_SECRET 未设置，建议在生产环境中配置');
    }
    
    try {
        // 连接数据库
        await dbConnect();
        
        const results = [];
        const errors = [];
        
        // 处理每个周期
        for (const interval of CONFIG.INTERVALS) {
            try {
                // 获取当前期号
                const periodInfo = getCurrentPeriod(interval);
                
                // 开奖
                const drawResult = await drawPeriod(
                    periodInfo.date,
                    interval,
                    periodInfo.period
                );
                
                if (!drawResult.success) {
                    errors.push({
                        interval,
                        period: periodInfo.period,
                        error: drawResult.error
                    });
                    continue;
                }
                
                // 如果已结算，跳过
                if (drawResult.alreadySettled) {
                    results.push({
                        interval,
                        period: periodInfo.period,
                        status: 'already_settled',
                        message: '该期已结算'
                    });
                    continue;
                }
                
                // 结算投注
                const settleResult = await settleBets(drawResult.draw);
                
                results.push({
                    interval,
                    period: periodInfo.period,
                    periodNumber: periodInfo.period + 1,
                    endTime: periodInfo.endTime,
                    draw: {
                        result: drawResult.draw.result,
                        championNumber: parseInt(drawResult.draw.result[0])
                    },
                    settlement: settleResult.stats
                });
                
                if (!settleResult.success) {
                    errors.push({
                        interval,
                        period: periodInfo.period,
                        errors: settleResult.stats.errors
                    });
                }
                
            } catch (periodError) {
                errors.push({
                    interval,
                    error: periodError.message
                });
            }
        }
        
        // 返回结果
        const response = {
            success: errors.length === 0,
            timestamp: new Date().toISOString(),
            processingTime: Date.now() - startTime,
            results,
            summary: {
                totalPeriods: results.length,
                totalBets: results.reduce((sum, r) => sum + (r.settlement?.totalBets || 0), 0),
                totalWins: results.reduce((sum, r) => sum + (r.settlement?.wonBets || 0), 0),
                totalWinAmount: results.reduce((sum, r) => sum + (r.settlement?.totalWinAmount || 0), 0)
            }
        };
        
        if (errors.length > 0) {
            response.errors = errors;
        }
        
        return res.status(200).json(response);
        
    } catch (error) {
        console.error('开奖结算API错误:', error);
        return res.status(500).json({
            success: false,
            error: '服务器内部错误',
            message: error.message,
            processingTime: Date.now() - startTime
        });
    }
};
