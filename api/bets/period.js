/**
 * 获取当前期号信息API
 */

const dbConnect = require('../../lib/db');
const Draw = require('../../models/Draw');
const Bet = require('../../models/Bet');
const { extractUserFromRequest } = require('../../lib/auth');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');

/**
 * 计算期号时间信息
 */
function calculatePeriodInfo(interval, period) {
    const periodStartMinutes = period * interval;
    const periodEndMinutes = (period + 1) * interval;
    
    const startHour = Math.floor(periodStartMinutes / 60);
    const startMinute = periodStartMinutes % 60;
    const endHour = Math.floor(periodEndMinutes / 60);
    const endMinute = periodEndMinutes % 60;
    
    return {
        startTime: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`,
        endTime: `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
    };
}

/**
 * 获取总期数
 */
function getTotalPeriods(interval) {
    return interval === 5 ? 288 : (interval === 10 ? 144 : 96);
}

module.exports = async (req, res) => {
    // 设置CORS头
    setCorsHeaders(req, res);

    // 处理OPTIONS预检请求
    if (handlePreflightRequest(req, res)) {
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: '方法不允许' });
    }

    try {
        const { interval = 5 } = req.query;
        const intervalNum = parseInt(interval);
        
        if (![5, 10, 15].includes(intervalNum)) {
            return res.status(400).json({ error: 'interval参数必须是5、10或15' });
        }

        // 验证用户身份（可选）
        const userData = extractUserFromRequest(req);

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const currentMinutes = hours * 60 + minutes;
        
        // 当前时期
        const currentPeriod = Math.floor(currentMinutes / intervalNum);
        const totalPeriods = getTotalPeriods(intervalNum);
        
        // 距离开奖的秒数
        const nextDrawMinutes = (currentPeriod + 1) * intervalNum;
        const secondsUntilDraw = (nextDrawMinutes - currentMinutes) * 60 - now.getSeconds();

        await dbConnect();

        // 构建返回数据
        const periods = {};

        // 当前时期信息
        const currentPeriodInfo = calculatePeriodInfo(intervalNum, currentPeriod);
        periods.current = {
            period: currentPeriod + 1,
            date: dateStr,
            interval: intervalNum,
            ...currentPeriodInfo,
            canBet: secondsUntilDraw > 60, // 开奖前1分钟截止投注
            secondsUntilDraw
        };

        // 下一期信息
        if (currentPeriod + 1 < totalPeriods) {
            const nextPeriodInfo = calculatePeriodInfo(intervalNum, currentPeriod + 1);
            periods.next = {
                period: currentPeriod + 2,
                date: dateStr,
                interval: intervalNum,
                ...nextPeriodInfo,
                canBet: true
            };
        } else {
            // 今日已结束，下一期是明天的第一期
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().slice(0, 10);
            const firstPeriodInfo = calculatePeriodInfo(intervalNum, 0);
            periods.next = {
                period: 1,
                date: tomorrowStr,
                interval: intervalNum,
                ...firstPeriodInfo,
                canBet: true
            };
        }

        // 获取最近5期的开奖结果
        const recentDraws = await Draw.find({
            date: dateStr,
            interval: intervalNum,
            status: { $in: ['drawn', 'settled'] }
        })
        .sort({ period: -1 })
        .limit(5);

        periods.recent = recentDraws.map(draw => ({
            period: draw.period + 1,
            result: draw.result,
            championNumber: parseInt(draw.result[0]),
            ...calculatePeriodInfo(intervalNum, draw.period),
            status: draw.status
        }));

        // 如果用户已登录，获取用户当前期的投注情况
        let userBet = null;
        if (userData) {
            const bet = await Bet.findOne({
                userId: userData.id,
                date: dateStr,
                interval: intervalNum,
                period: currentPeriod,
                status: { $ne: 'cancelled' }
            });

            if (bet) {
                userBet = {
                    id: bet._id,
                    championNumbers: bet.championNumbers,
                    amount: bet.amount,
                    odds: bet.odds,
                    status: bet.status
                };
            }
        }

        res.json({
            now: now.toISOString(),
            date: dateStr,
            interval: intervalNum,
            totalPeriods,
            periods,
            userBet
        });
    } catch (error) {
        console.error('获取期号信息错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
