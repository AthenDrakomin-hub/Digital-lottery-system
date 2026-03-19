/**
 * 系统模块 API - 合并文件
 * 路由设计（通过 type 参数一级分发）：
 * 
 * 开奖管理 (type=draws):
 *   GET    /api/system?type=draws                    - 获取开奖列表
 *   POST   /api/system?type=draws                    - 批量保存开奖预设
 *   GET    /api/system?type=draws&action=daily       - 获取每日开奖
 *   GET    /api/system?type=draws&id=xxx             - 获取开奖详情
 *   PUT    /api/system?type=draws&id=xxx             - 更新开奖结果
 *   DELETE /api/system?type=draws&id=xxx             - 删除开奖记录
 * 
 * 投注管理 (type=bets):
 *   GET    /api/system?type=bets                     - 获取投注配置
 *   POST   /api/system?type=bets                     - 提交投注
 *   GET    /api/system?type=bets&action=period       - 获取期号信息
 *   GET    /api/system?type=bets&action=history      - 获取投注历史
 *   GET    /api/system?type=bets&action=admin        - 获取所有投注（管理员）
 *   GET    /api/system?type=bets&id=xxx              - 获取投注详情
 *   DELETE /api/system?type=bets&id=xxx              - 取消投注
 *   PATCH  /api/system?type=bets&id=xxx&action=status - 修改投注状态
 * 
 * 定时任务 (type=cron):
 *   GET    /api/system?type=cron&action=check-draws  - 自动开奖结算
 *   GET    /api/system?type=cron&action=compensation - 补偿机制
 * 
 * 支付回调 (type=payment):
 *   POST   /api/system?type=payment&action=alipay    - 支付宝回调
 *   POST   /api/system?type=payment&action=wechat    - 微信回调
 *   POST   /api/system?type=payment&action=payout    - 代付处理
 *   POST   /api/system?type=payment&action=callback  - 代付回调
 */

const dbConnect = require('../lib/db');
const User = require('../models/User');
const Draw = require('../models/Draw');
const Bet = require('../models/Bet');
const Transaction = require('../models/Transaction');
const bcrypt = require('bcryptjs');
const { extractUserFromRequest } = require('../lib/auth');
const { setCorsHeaders, handlePreflightRequest } = require('../lib/cors');
const cache = require('../lib/cache');
const { createLogger } = require('../lib/logger');

const logger = createLogger('system');

// ===== 配置常量 =====
const CONFIG = {
    INTERVALS: [5, 10, 15],
    BATCH_SIZE: 500,
    FUNCTION_TIMEOUT: 9000,
    RESULT_LENGTH: 10,
    BET: {
        PRICE_PER_NUMBER: 2,
        WIN_AMOUNT: 19.5,
        MAX_NUMBERS: 5,
        MIN_NUMBERS: 1
    }
};

// ===== 辅助函数 =====

/**
 * 验证管理员权限
 */
async function verifyAdmin(req) {
    const userData = extractUserFromRequest(req);
    if (!userData) return null;
    const user = await User.findById(userData.id);
    return user && user.role === 'admin' && user.isActive ? user : null;
}

/**
 * 生成随机结果
 */
function generateRandomResult() {
    let result = '';
    for (let i = 0; i < CONFIG.RESULT_LENGTH; i++) {
        result += Math.floor(Math.random() * 10);
    }
    return result;
}

/**
 * 获取当前期号信息
 */
function getCurrentPeriod(interval) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    const currentPeriod = Math.floor(minutesSinceMidnight / interval);
    return { date, period: currentPeriod };
}

/**
 * 计算期号时间
 */
function calculatePeriodTime(interval, period) {
    const startMinutes = period * interval;
    return {
        startTime: `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`
    };
}

/**
 * 获取总期数
 */
function getTotalPeriods(interval) {
    return interval === 5 ? 288 : (interval === 10 ? 144 : 96);
}

// ===== 开奖管理处理函数 =====

async function handleDrawsList(req, res) {
    const { date, interval, page = 1, limit = 50 } = req.query;
    
    let query = {};
    if (date) query.date = date;
    if (interval) query.interval = parseInt(interval);

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const draws = await Draw.find(query)
        .sort({ date: -1, interval: 1, period: 1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await Draw.countDocuments(query);

    res.json({ draws, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
}

async function handleDrawsCreate(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) return res.status(401).json({ error: '需要管理员权限' });

    const { date, interval, periods } = req.body;
    if (!date || !interval || !periods) return res.status(400).json({ error: '缺少必要参数' });

    const intervalNum = parseInt(interval);
    if (!CONFIG.INTERVALS.includes(intervalNum)) return res.status(400).json({ error: 'interval参数必须是5、10或15' });

    const ops = periods.map(p => ({
        updateOne: {
            filter: { date, interval: intervalNum, period: p.period },
            update: { result: p.result, updatedAt: new Date() },
            upsert: true
        }
    }));

    if (ops.length > 0) await Draw.bulkWrite(ops);
    await cache.deleteDailyDraws(date, intervalNum);

    res.json({ success: true, message: `成功保存${periods.length}期开奖预设` });
}

async function handleDrawsDaily(req, res) {
    const { date, interval, nocache } = req.query;
    if (!date || !interval) return res.status(400).json({ error: '缺少date或interval参数' });

    const intervalNum = parseInt(interval);
    if (!CONFIG.INTERVALS.includes(intervalNum)) return res.status(400).json({ error: 'interval参数必须是5、10或15' });

    const totalPeriods = getTotalPeriods(intervalNum);

    if (nocache !== '1') {
        const cached = await cache.getDailyDraws(date, intervalNum);
        if (cached) return res.json({ date, interval: intervalNum, totalPeriods, draws: cached, cached: true });
    }

    const draws = await Draw.find({ date, interval: intervalNum }).sort('period');
    const fullDay = Array.from({ length: totalPeriods }, (_, i) => {
        const existing = draws.find(d => d.period === i);
        return existing ? existing.result : null;
    });

    await cache.setDailyDraws(date, intervalNum, fullDay);
    res.json({ date, interval: intervalNum, totalPeriods, draws: fullDay, cached: false });
}

async function handleDrawsDetail(req, res) {
    const { id } = req.query;
    const draw = await Draw.findById(id);
    if (!draw) return res.status(404).json({ error: '开奖记录不存在' });
    res.json({ draw });
}

async function handleDrawsUpdate(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) return res.status(401).json({ error: '需要管理员权限' });

    const { id } = req.query;
    const { result } = req.body;
    
    const draw = await Draw.findById(id);
    if (!draw) return res.status(404).json({ error: '开奖记录不存在' });

    if (result) draw.result = result;
    draw.updatedAt = new Date();
    await draw.save();

    res.json({ success: true, draw });
}

async function handleDrawsDelete(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) return res.status(401).json({ error: '需要管理员权限' });

    const { id } = req.query;
    await Draw.findByIdAndDelete(id);
    res.json({ success: true, message: '开奖记录已删除' });
}

// ===== 投注管理处理函数 =====

async function handleBetsConfig(req, res) {
    const { interval = 5 } = req.query;
    const intervalNum = parseInt(interval);
    
    if (!CONFIG.INTERVALS.includes(intervalNum)) return res.status(400).json({ error: 'interval参数必须是5、10或15' });

    const oddsTable = Bet.getOddsTable();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const currentPeriod = Math.floor(currentMinutes / intervalNum);
    const nextPeriod = currentPeriod + 1;
    const periodStartMinutes = nextPeriod * intervalNum;

    res.json({
        config: {
            pricePerNumber: CONFIG.BET.PRICE_PER_NUMBER,
            winAmount: CONFIG.BET.WIN_AMOUNT,
            minNumbers: CONFIG.BET.MIN_NUMBERS,
            maxNumbers: CONFIG.BET.MAX_NUMBERS,
            availableNumbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        },
        oddsTable,
        nextPeriod: {
            period: nextPeriod,
            startTime: `${String(Math.floor(periodStartMinutes / 60)).padStart(2, '0')}:${String(periodStartMinutes % 60).padStart(2, '0')}`
        },
        date: now.toISOString().slice(0, 10),
        interval: intervalNum
    });
}

async function handleBetsPlace(req, res) {
    const userData = extractUserFromRequest(req);
    if (!userData) return res.status(401).json({ error: '未授权，请先登录' });

    const { date, interval, period, championNumbers } = req.body;
    if (!date || !interval || period === undefined || !championNumbers) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    const intervalNum = parseInt(interval);
    const validation = Bet.validateChampionBet(championNumbers);
    if (!validation.valid) return res.status(400).json({ error: validation.error });

    const user = await User.findById(userData.id);
    if (!user || !user.isActive) return res.status(404).json({ error: '用户不存在或已被禁用' });
    if (user.balance < validation.amount) return res.status(400).json({ error: `余额不足` });

    // 检查是否已投注
    const existingBet = await Bet.findOne({
        userId: user._id, date, interval: intervalNum, period, betType: 'champion', status: { $ne: 'cancelled' }
    });
    if (existingBet) return res.status(400).json({ error: '本期已投注，不能重复投注' });

    user.balance -= validation.amount;
    await user.save();
    await cache.setUserBalance(user._id.toString(), user.balance);

    const bet = await Bet.create({
        userId: user._id, date, interval: intervalNum, period, betType: 'champion',
        championNumbers: championNumbers.sort((a, b) => a - b),
        numbers: championNumbers.sort((a, b) => a - b).join(''),
        amount: validation.amount, odds: validation.odds, selectedCount: validation.selectedCount, status: 'pending'
    });

    res.status(201).json({
        message: '投注成功',
        bet: { id: bet._id, date, interval: intervalNum, period: period + 1, championNumbers: bet.championNumbers, amount: bet.amount, odds: bet.odds, status: bet.status },
        user: { balance: user.balance }
    });
}

async function handleBetsPeriod(req, res) {
    const { interval = 5 } = req.query;
    const intervalNum = parseInt(interval);
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const currentPeriod = Math.floor(currentMinutes / intervalNum);
    const totalPeriods = getTotalPeriods(intervalNum);
    const secondsUntilDraw = ((currentPeriod + 1) * intervalNum - currentMinutes) * 60 - now.getSeconds();

    const userData = extractUserFromRequest(req);
    let userBet = null;
    if (userData) {
        const bet = await Bet.findOne({ userId: userData.id, date: dateStr, interval: intervalNum, period: currentPeriod, status: { $ne: 'cancelled' } });
        if (bet) userBet = { id: bet._id, championNumbers: bet.championNumbers, amount: bet.amount, status: bet.status };
    }

    res.json({
        now: now.toISOString(), date: dateStr, interval: intervalNum, totalPeriods,
        currentPeriod: { period: currentPeriod + 1, canBet: secondsUntilDraw > 60, secondsUntilDraw },
        userBet
    });
}

async function handleBetsHistory(req, res) {
    const userData = extractUserFromRequest(req);
    if (!userData) return res.status(401).json({ error: '未授权，请先登录' });

    const { page = 1, limit = 20, status } = req.query;
    let query = { userId: userData.id };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const bets = await Bet.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await Bet.countDocuments(query);

    res.json({ bets, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
}

async function handleBetsAdmin(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) return res.status(401).json({ error: '需要管理员权限' });

    const { page = 1, limit = 20, status, date, userId } = req.query;
    let query = {};
    if (status) query.status = status;
    if (date) query.date = date;
    if (userId) query.userId = userId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const bets = await Bet.find(query).populate('userId', 'username').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await Bet.countDocuments(query);

    res.json({ bets, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
}

async function handleBetsDetail(req, res) {
    const { id } = req.query;
    const userData = extractUserFromRequest(req);
    if (!userData) return res.status(401).json({ error: '未授权，请先登录' });

    const bet = await Bet.findById(id);
    if (!bet) return res.status(404).json({ error: '投注记录不存在' });

    const currentUser = await User.findById(userData.id);
    if (currentUser.role !== 'admin' && bet.userId.toString() !== userData.id) {
        return res.status(403).json({ error: '无权查看此投注记录' });
    }

    res.json({ bet });
}

async function handleBetsCancel(req, res) {
    const { id } = req.query;
    const userData = extractUserFromRequest(req);
    if (!userData) return res.status(401).json({ error: '未授权，请先登录' });

    const bet = await Bet.findById(id);
    if (!bet) return res.status(404).json({ error: '投注记录不存在' });
    if (bet.status !== 'pending') return res.status(400).json({ error: '只能取消待开奖的投注' });

    const currentUser = await User.findById(userData.id);
    if (currentUser.role !== 'admin' && bet.userId.toString() !== userData.id) {
        return res.status(403).json({ error: '无权取消此投注' });
    }

    const user = await User.findById(bet.userId);
    user.balance += bet.amount;
    await user.save();
    await cache.setUserBalance(user._id.toString(), user.balance);

    bet.status = 'cancelled';
    bet.cancelledAt = new Date();
    await bet.save();

    res.json({ message: '投注已取消', bet: { id: bet._id, status: bet.status }, user: { balance: user.balance } });
}

async function handleBetsStatus(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) return res.status(401).json({ error: '需要管理员权限' });

    const { id } = req.query;
    const { status, winAmount, reason } = req.body;

    const bet = await Bet.findById(id);
    if (!bet) return res.status(404).json({ error: '投注记录不存在' });

    const oldStatus = bet.status;
    bet.status = status;
    if (winAmount) bet.winAmount = winAmount;
    if (reason) bet.adminNote = reason;
    await bet.save();

    if (status === 'won' && oldStatus !== 'won' && winAmount > 0) {
        const user = await User.findById(bet.userId);
        user.balance += winAmount;
        await user.save();
        await cache.setUserBalance(user._id.toString(), user.balance);
    }

    logger.info('投注状态修改', { betId: id, oldStatus, newStatus: status, operator: admin.username });
    res.json({ success: true, bet });
}

// ===== 定时任务处理函数 =====

async function handleCronCheckDraws(req, res) {
    const startTime = Date.now();
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = req.query.secret || req.headers['x-cron-secret'];
    
    if (cronSecret && providedSecret !== cronSecret) return res.status(401).json({ error: '未授权访问' });

    const results = [];
    
    for (const interval of CONFIG.INTERVALS) {
        const periodInfo = getCurrentPeriod(interval);
        
        let draw = await Draw.findOne({ date: periodInfo.date, interval, period: periodInfo.period });
        
        if (!draw) {
            draw = await Draw.create({
                date: periodInfo.date, interval, period: periodInfo.period,
                result: generateRandomResult(), status: 'drawn'
            });
        } else if (draw.status === 'pending') {
            draw.status = 'drawn';
            await draw.save();
        } else if (draw.status === 'settled') {
            results.push({ interval, period: periodInfo.period, status: 'already_settled' });
            continue;
        }

        // 结算投注
        const championNumber = parseInt(draw.result[0]);
        const bets = await Bet.find({ date: draw.date, interval: draw.interval, period: draw.period, status: 'pending' });
        
        let wonBets = 0, totalWinAmount = 0;
        for (const bet of bets) {
            const isWin = bet.championNumbers?.includes(championNumber);
            bet.status = isWin ? 'won' : 'lost';
            bet.winAmount = isWin ? CONFIG.BET.WIN_AMOUNT : 0;
            bet.result = draw.result;
            bet.championNumber = championNumber;
            bet.settledAt = new Date();
            await bet.save();
            
            if (isWin) {
                wonBets++;
                totalWinAmount += CONFIG.BET.WIN_AMOUNT;
                await User.findByIdAndUpdate(bet.userId, { $inc: { balance: CONFIG.BET.WIN_AMOUNT } });
            }
        }

        draw.status = 'settled';
        draw.settledAt = new Date();
        await draw.save();

        results.push({
            interval, period: periodInfo.period,
            result: draw.result, championNumber,
            settlement: { totalBets: bets.length, wonBets, totalWinAmount }
        });
    }

    res.json({
        success: true, timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime, results
    });
}

async function handleCronCompensation(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) return res.status(401).json({ error: '需要管理员权限' });

    const { date, interval, period } = req.body;
    
    const draws = await Draw.find({ date, interval, status: 'pending' });
    const bets = await Bet.find({ 
        date, interval, 
        ...(period !== undefined ? { period } : {}), 
        status: 'pending' 
    });

    res.json({
        success: true,
        message: '补偿检查完成',
        pendingDraws: draws.length,
        pendingBets: bets.length,
        details: { draws: draws.map(d => ({ period: d.period, status: d.status })), bets: bets.length }
    });
}

// ===== 支付回调处理函数 =====

async function handlePaymentAlipay(req, res) {
    logger.info('支付宝回调', { body: req.body });
    // TODO: 实现支付宝回调验签和处理
    res.send('success');
}

async function handlePaymentWechat(req, res) {
    logger.info('微信回调', { body: req.body });
    // TODO: 实现微信回调验签和处理
    res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');
}

async function handlePaymentPayout(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) return res.status(401).json({ error: '需要管理员权限' });

    const { transactionId } = req.body;
    // TODO: 实现代付逻辑
    res.json({ success: true, message: '代付请求已提交', transactionId });
}

async function handlePaymentCallback(req, res) {
    logger.info('代付回调', { body: req.body });
    // TODO: 实现代付回调处理
    res.send('success');
}

// ===== 主入口 - 路由分发 =====

module.exports = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    const { type, action, id } = req.query;

    try {
        await dbConnect();

        switch (type) {
            case 'draws':
                if (id) {
                    switch (req.method) {
                        case 'GET': return await handleDrawsDetail(req, res);
                        case 'PUT': return await handleDrawsUpdate(req, res);
                        case 'DELETE': return await handleDrawsDelete(req, res);
                    }
                }
                if (action === 'daily' && req.method === 'GET') return await handleDrawsDaily(req, res);
                if (req.method === 'GET') return await handleDrawsList(req, res);
                if (req.method === 'POST') return await handleDrawsCreate(req, res);
                break;

            case 'bets':
                if (id && action === 'status' && req.method === 'PATCH') return await handleBetsStatus(req, res);
                if (id) {
                    switch (req.method) {
                        case 'GET': return await handleBetsDetail(req, res);
                        case 'DELETE': return await handleBetsCancel(req, res);
                    }
                }
                if (action === 'period' && req.method === 'GET') return await handleBetsPeriod(req, res);
                if (action === 'history' && req.method === 'GET') return await handleBetsHistory(req, res);
                if (action === 'admin' && req.method === 'GET') return await handleBetsAdmin(req, res);
                if (req.method === 'GET') return await handleBetsConfig(req, res);
                if (req.method === 'POST') return await handleBetsPlace(req, res);
                break;

            case 'cron':
                if (action === 'check-draws') return await handleCronCheckDraws(req, res);
                if (action === 'compensation') return await handleCronCompensation(req, res);
                break;

            case 'payment':
                if (action === 'alipay') return await handlePaymentAlipay(req, res);
                if (action === 'wechat') return await handlePaymentWechat(req, res);
                if (action === 'payout') return await handlePaymentPayout(req, res);
                if (action === 'callback') return await handlePaymentCallback(req, res);
                break;

            default:
                return res.status(400).json({
                    error: '无效的type参数',
                    availableTypes: ['draws', 'bets', 'cron', 'payment']
                });
        }

        return res.status(405).json({ error: '方法不允许' });

    } catch (error) {
        console.error('系统模块错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
