/**
 * 投注API
 * 支持冠军玩法投注
 */

const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const Bet = require('../../models/Bet');
const Draw = require('../../models/Draw');
const { extractUserFromRequest } = require('../../lib/auth');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');
const cache = require('../../lib/cache');

// 投注配置
const BET_CONFIG = {
    PRICE_PER_NUMBER: 2,
    WIN_AMOUNT: 19.5,
    MAX_NUMBERS: 5,
    MIN_NUMBERS: 1
};

/**
 * 检查是否可以投注（在开奖前）
 */
function canBet(interval, period) {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentMinutes = hours * 60 + minutes;
    
    // 计算当前期号
    const currentPeriod = Math.floor(currentMinutes / interval);
    
    // 计算当前期的结束时间（分钟数）
    const periodEndMinutes = (period + 1) * interval;
    
    // 必须在开奖前投注（提前1分钟截止）
    return currentMinutes < periodEndMinutes - 1;
}

/**
 * 获取下一期信息
 */
function getNextPeriod(interval) {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentMinutes = hours * 60 + minutes;
    
    const currentPeriod = Math.floor(currentMinutes / interval);
    const nextPeriod = currentPeriod + 1;
    
    const totalPeriods = interval === 5 ? 288 : (interval === 10 ? 144 : 96);
    
    if (nextPeriod >= totalPeriods) {
        return null; // 今天已结束
    }
    
    const periodStartMinutes = nextPeriod * interval;
    const startHour = Math.floor(periodStartMinutes / 60);
    const startMinute = periodStartMinutes % 60;
    
    return {
        period: nextPeriod,
        startTime: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`
    };
}

module.exports = async (req, res) => {
    // 设置CORS头
    setCorsHeaders(req, res);

    // 处理OPTIONS预检请求
    if (handlePreflightRequest(req, res)) {
        return;
    }

    // GET: 获取投注配置和下一期信息
    if (req.method === 'GET') {
        try {
            const { interval = 5 } = req.query;
            const intervalNum = parseInt(interval);
            
            if (![5, 10, 15].includes(intervalNum)) {
                return res.status(400).json({ error: 'interval参数必须是5、10或15' });
            }

            // 获取赔率表
            const oddsTable = Bet.getOddsTable();
            
            // 获取下一期信息
            const nextPeriod = getNextPeriod(intervalNum);
            
            // 当前日期
            const dateStr = new Date().toISOString().slice(0, 10);

            res.json({
                config: {
                    pricePerNumber: BET_CONFIG.PRICE_PER_NUMBER,
                    winAmount: BET_CONFIG.WIN_AMOUNT,
                    minNumbers: BET_CONFIG.MIN_NUMBERS,
                    maxNumbers: BET_CONFIG.MAX_NUMBERS,
                    availableNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
                },
                oddsTable,
                nextPeriod,
                date: dateStr,
                interval: intervalNum
            });
        } catch (error) {
            console.error('获取投注配置错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    }
    // POST: 提交投注
    else if (req.method === 'POST') {
        try {
            // 验证用户身份
            const userData = extractUserFromRequest(req);
            if (!userData) {
                return res.status(401).json({ error: '未授权，请先登录' });
            }

            const { date, interval, period, championNumbers } = req.body;

            // 验证参数
            if (!date || !interval || period === undefined || !championNumbers) {
                return res.status(400).json({ error: '缺少必要参数' });
            }

            const intervalNum = parseInt(interval);
            if (![5, 10, 15].includes(intervalNum)) {
                return res.status(400).json({ error: 'interval参数必须是5、10或15' });
            }

            // 验证投注数字
            const validation = Bet.validateChampionBet(championNumbers);
            if (!validation.valid) {
                return res.status(400).json({ error: validation.error });
            }

            await dbConnect();

            // 查找用户
            const user = await User.findById(userData.id);
            if (!user || !user.isActive) {
                return res.status(404).json({ error: '用户不存在或已被禁用' });
            }

            // 检查余额
            if (user.balance < validation.amount) {
                return res.status(400).json({ error: `余额不足，当前余额: ¥${user.balance.toFixed(2)}，需要: ¥${validation.amount.toFixed(2)}` });
            }

            // 检查是否在开奖前
            if (!canBet(intervalNum, period)) {
                return res.status(400).json({ error: '本期投注已截止，请投注下一期' });
            }

            // 检查该用户是否已对该期投注过（可选：限制每期只能投注一次）
            const existingBet = await Bet.findOne({
                userId: user._id,
                date,
                interval: intervalNum,
                period,
                betType: 'champion',
                status: { $ne: 'cancelled' }
            });

            if (existingBet) {
                return res.status(400).json({ error: '本期已投注，不能重复投注' });
            }

            // 扣除余额
            user.balance -= validation.amount;
            await user.save();

            // 更新用户余额缓存
            await cache.setUserBalance(user._id.toString(), user.balance);

            // 创建投注记录
            const bet = await Bet.create({
                userId: user._id,
                date,
                interval: intervalNum,
                period,
                betType: 'champion',
                championNumbers: championNumbers.sort((a, b) => a - b),
                numbers: championNumbers.sort((a, b) => a - b).join(''),
                amount: validation.amount,
                odds: validation.odds,
                selectedCount: validation.selectedCount,
                status: 'pending'
            });

            // 计算期号显示信息
            const periodStartMinutes = period * intervalNum;
            const startHour = Math.floor(periodStartMinutes / 60);
            const startMinute = periodStartMinutes % 60;

            res.status(201).json({
                message: '投注成功',
                bet: {
                    id: bet._id,
                    date: bet.date,
                    interval: bet.interval,
                    period: bet.period + 1, // 1-based
                    periodTime: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`,
                    championNumbers: bet.championNumbers,
                    amount: bet.amount,
                    odds: bet.odds,
                    status: bet.status,
                    createdAt: bet.createdAt
                },
                user: {
                    balance: user.balance
                }
            });
        } catch (error) {
            console.error('投注错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    } else {
        res.status(405).json({ error: '方法不允许' });
    }
};
