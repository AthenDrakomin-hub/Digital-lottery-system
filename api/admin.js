/**
 * 管理员模块 API - 合并文件
 * 路由设计：
 *   GET    /api/admin?action=init      - 检查初始化状态
 *   POST   /api/admin?action=init      - 执行初始化
 *   GET    /api/admin?action=verify    - 验证管理员权限
 *   GET    /api/admin?action=archive   - 获取数据库统计信息
 *   POST   /api/admin?action=archive   - 执行归档清理
 *   GET    /api/admin?action=stats     - 获取运营统计数据
 *   GET    /api/admin?action=config    - 获取系统配置
 *   POST   /api/admin?action=config    - 更新单个配置项
 *   PUT    /api/admin?action=config    - 批量更新配置
 */

// 加载环境变量（必须在最前面）
require('dotenv').config();

const dbConnect = require('../lib/db');
const User = require('../models/User');
const Draw = require('../models/Draw');
const Bet = require('../models/Bet');
const Transaction = require('../models/Transaction');
const Config = require('../models/Config');
const bcrypt = require('bcryptjs');
const { extractUserFromRequest } = require('../lib/auth');
const { setCorsHeaders, handlePreflightRequest, clearCorsCache } = require('../lib/cors');
const { createLogger } = require('../lib/logger');

const logger = createLogger('admin');

// 预设管理员账户
const ADMIN_ACCOUNTS = [
    { username: 'admin001', password: 'admin123' },
    { username: 'admin002', password: 'admin123' },
    { username: 'admin003', password: 'admin123' }
];

/**
 * 验证管理员权限
 */
async function verifyAdmin(req) {
    try {
        const userData = extractUserFromRequest(req);
        if (!userData) return null;

        const user = await User.findById(userData.id);
        if (!user || user.role !== 'admin' || !user.isActive) return null;

        return user;
    } catch (error) {
        console.error('管理员验证错误:', error);
        return null;
    }
}

/**
 * 检查初始化状态
 */
async function handleInitStatus(req, res) {
    const adminCount = await User.countDocuments({ role: 'admin' });
    
    return res.json({
        initialized: adminCount >= ADMIN_ACCOUNTS.length,
        adminCount,
        requiredCount: ADMIN_ACCOUNTS.length,
        accounts: ADMIN_ACCOUNTS.map(a => a.username)
    });
}

/**
 * 执行初始化
 */
async function handleInitCreate(req, res) {
    // 验证初始化密钥
    const { secret } = req.body;
    
    if (secret !== process.env.JWT_SECRET) {
        return res.status(403).json({ 
            error: '初始化密钥错误',
            hint: '请使用JWT_SECRET作为初始化密钥'
        });
    }

    const results = [];

    for (const account of ADMIN_ACCOUNTS) {
        try {
            const existing = await User.findOne({ username: account.username });

            if (existing) {
                if (existing.role !== 'admin') {
                    existing.role = 'admin';
                    await existing.save();
                    results.push({ username: account.username, status: 'updated', message: '已升级为管理员' });
                } else {
                    results.push({ username: account.username, status: 'exists', message: '管理员已存在' });
                }
            } else {
                const hashedPassword = await bcrypt.hash(account.password, 10);
                await User.create({
                    username: account.username,
                    password: hashedPassword,
                    role: 'admin',
                    balance: 0,
                    isActive: true
                });
                results.push({ username: account.username, status: 'created', message: '创建成功' });
            }
        } catch (error) {
            results.push({ username: account.username, status: 'error', message: error.message });
        }
    }

    return res.json({
        success: true,
        message: '管理员账户初始化完成',
        results,
        accounts: ADMIN_ACCOUNTS.map(a => ({
            username: a.username,
            password: a.password,
            note: '请在首次登录后立即修改密码'
        }))
    });
}

/**
 * 验证管理员权限（返回JSON）
 */
async function handleVerify(req, res) {
    const admin = await verifyAdmin(req);
    
    if (!admin) {
        return res.status(401).json({ 
            verified: false, 
            error: '无管理员权限' 
        });
    }
    
    return res.json({
        verified: true,
        admin: {
            id: admin._id,
            username: admin.username,
            role: admin.role
        }
    });
}

/**
 * 获取数据库统计信息
 */
async function handleArchiveStats(req, res) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthAgoStr = monthAgo.toISOString();
    
    // 用户统计
    const [
        totalUsers,
        activeUsers,
        newUsersToday,
        newUsersWeek,
        newUsersMonth,
        adminCount
    ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        User.countDocuments({ createdAt: { $gte: new Date(today) } }),
        User.countDocuments({ createdAt: { $gte: weekAgo } }),
        User.countDocuments({ createdAt: { $gte: monthAgo } }),
        User.countDocuments({ role: 'admin' })
    ]);
    
    // 开奖统计
    const [
        totalDraws,
        todayDraws,
        pendingDraws,
        settledDraws,
        drawsByInterval
    ] = await Promise.all([
        Draw.countDocuments(),
        Draw.countDocuments({ date: today }),
        Draw.countDocuments({ status: 'pending' }),
        Draw.countDocuments({ status: 'settled' }),
        Draw.aggregate([
            { $group: { _id: '$interval', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ])
    ]);
    
    // 投注统计
    const [
        totalBets,
        todayBets,
        pendingBets,
        wonBets,
        lostBets,
        totalBetAmount,
        todayBetAmount
    ] = await Promise.all([
        Bet.countDocuments(),
        Bet.countDocuments({ createdAt: { $gte: new Date(today) } }),
        Bet.countDocuments({ status: 'pending' }),
        Bet.countDocuments({ status: 'won' }),
        Bet.countDocuments({ status: 'lost' }),
        Bet.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
        Bet.aggregate([{ $match: { createdAt: { $gte: new Date(today) } } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
    ]);
    
    // 交易统计
    const [
        totalTransactions,
        todayTransactions,
        pendingTransactions,
        depositStats,
        withdrawStats
    ] = await Promise.all([
        Transaction.countDocuments(),
        Transaction.countDocuments({ createdAt: { $gte: new Date(today) } }),
        Transaction.countDocuments({ status: 'pending' }),
        Transaction.aggregate([
            { $match: { type: 'deposit', status: { $in: ['approved', 'completed'] } } },
            { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } }
        ]),
        Transaction.aggregate([
            { $match: { type: 'withdraw', status: { $in: ['approved', 'completed'] } } },
            { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } }
        ])
    ]);
    
    // 开奖记录日期范围
    const drawDateRange = await Draw.aggregate([
        { $group: { _id: null, minDate: { $min: '$date' }, maxDate: { $max: '$date' } } }
    ]);
    
    // 计算可归档数据（90天前）
    const archiveDays = 90;
    const cutoffDate = new Date(now.getTime() - archiveDays * 24 * 60 * 60 * 1000);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);
    
    const [archivableDraws, archivableBets, archivableTransactions] = await Promise.all([
        Draw.countDocuments({ date: { $lt: cutoffDateStr } }),
        Bet.countDocuments({ createdAt: { $lt: cutoffDate }, status: { $ne: 'pending' } }),
        Transaction.countDocuments({ createdAt: { $lt: cutoffDate }, status: { $in: ['completed', 'rejected', 'cancelled'] } })
    ]);
    
    // 计算存储估算（基于记录数和平均大小）
    const avgDocSize = {
        user: 500,      // bytes
        draw: 800,
        bet: 600,
        transaction: 700
    };
    
    const estimatedStorage = {
        users: Math.round(totalUsers * avgDocSize.user / 1024),
        draws: Math.round(totalDraws * avgDocSize.draw / 1024),
        bets: Math.round(totalBets * avgDocSize.bet / 1024),
        transactions: Math.round(totalTransactions * avgDocSize.transaction / 1024),
        total: Math.round((totalUsers * avgDocSize.user + totalDraws * avgDocSize.draw + totalBets * avgDocSize.bet + totalTransactions * avgDocSize.transaction) / 1024)
    };
    
    res.json({
        timestamp: now.toISOString(),
        users: {
            total: totalUsers,
            active: activeUsers,
            inactive: totalUsers - activeUsers,
            admins: adminCount,
            newToday: newUsersToday,
            newWeek: newUsersWeek,
            newMonth: newUsersMonth
        },
        draws: {
            total: totalDraws,
            today: todayDraws,
            pending: pendingDraws,
            settled: settledDraws,
            dateRange: drawDateRange[0] || { minDate: null, maxDate: null },
            byInterval: drawsByInterval.reduce((acc, d) => { acc[d._id] = d.count; return acc; }, {})
        },
        bets: {
            total: totalBets,
            today: todayBets,
            pending: pendingBets,
            won: wonBets,
            lost: lostBets,
            totalAmount: totalBetAmount[0]?.total || 0,
            todayAmount: todayBetAmount[0]?.total || 0
        },
        transactions: {
            total: totalTransactions,
            today: todayTransactions,
            pending: pendingTransactions,
            deposits: {
                count: depositStats[0]?.count || 0,
                amount: depositStats[0]?.total || 0
            },
            withdraws: {
                count: withdrawStats[0]?.count || 0,
                amount: withdrawStats[0]?.total || 0
            }
        },
        archive: {
            cutoffDate: cutoffDateStr,
            archiveDays: archiveDays,
            archivable: {
                draws: archivableDraws,
                bets: archivableBets,
                transactions: archivableTransactions,
                total: archivableDraws + archivableBets + archivableTransactions
            }
        },
        storage: estimatedStorage
    });
}

/**
 * 执行归档清理
 */
async function handleArchiveClean(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }
    
    const { secret, archiveDays = 90, dryRun = false, models = ['Draw', 'Bet', 'Transaction'] } = req.body;
    
    if (secret !== process.env.JWT_SECRET) {
        return res.status(403).json({ error: '密钥错误，请使用JWT_SECRET' });
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - archiveDays);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);
    
    const results = {
        cutoffDate: cutoffDateStr,
        archiveDays,
        dryRun,
        executedAt: new Date().toISOString(),
        executedBy: admin.username,
        details: {}
    };
    
    // 归档开奖记录
    if (models.includes('Draw')) {
        const count = await Draw.countDocuments({ date: { $lt: cutoffDateStr } });
        results.details.draws = { found: count };
        
        if (!dryRun && count > 0) {
            const deleteResult = await Draw.deleteMany({ date: { $lt: cutoffDateStr } });
            results.details.draws.deleted = deleteResult.deletedCount;
        } else {
            results.details.draws.deleted = 0;
            results.details.draws.skipped = dryRun ? 'dry-run' : 'no-data';
        }
    }
    
    // 归档投注记录（排除待开奖的）
    if (models.includes('Bet')) {
        const count = await Bet.countDocuments({ 
            createdAt: { $lt: cutoffDate },
            status: { $ne: 'pending' }
        });
        results.details.bets = { found: count };
        
        if (!dryRun && count > 0) {
            const deleteResult = await Bet.deleteMany({ 
                createdAt: { $lt: cutoffDate },
                status: { $ne: 'pending' }
            });
            results.details.bets.deleted = deleteResult.deletedCount;
        } else {
            results.details.bets.deleted = 0;
            results.details.bets.skipped = dryRun ? 'dry-run' : 'no-data';
        }
    }
    
    // 归档交易记录（只归档已完成的）
    if (models.includes('Transaction')) {
        const count = await Transaction.countDocuments({ 
            createdAt: { $lt: cutoffDate },
            status: { $in: ['completed', 'rejected', 'cancelled'] }
        });
        results.details.transactions = { found: count };
        
        if (!dryRun && count > 0) {
            const deleteResult = await Transaction.deleteMany({ 
                createdAt: { $lt: cutoffDate },
                status: { $in: ['completed', 'rejected', 'cancelled'] }
            });
            results.details.transactions.deleted = deleteResult.deletedCount;
        } else {
            results.details.transactions.deleted = 0;
            results.details.transactions.skipped = dryRun ? 'dry-run' : 'no-data';
        }
    }
    
    // 计算总计
    results.total = {
        found: Object.values(results.details).reduce((sum, d) => sum + (d.found || 0), 0),
        deleted: Object.values(results.details).reduce((sum, d) => sum + (d.deleted || 0), 0)
    };
    
    results.message = dryRun 
        ? `试运行完成，找到 ${results.total.found} 条可归档记录` 
        : `归档完成，已删除 ${results.total.deleted} 条记录`;
    
    logger.info('数据归档执行', results);
    res.json({ success: true, ...results });
}

/**
 * 获取日期范围
 */
function getDateRange(range) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (range) {
        case 'today':
            return { start: today, end: now };
        case 'yesterday': {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            return { start: yesterday, end: today };
        }
        case 'week': {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return { start: weekAgo, end: now };
        }
        case 'month': {
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return { start: monthAgo, end: now };
        }
        default:
            return { start: today, end: now };
    }
}

/**
 * 获取运营统计数据
 */
async function handleStats(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    const { range = 'today', date } = req.query;
    
    let startDate, endDate;
    if (date) {
        startDate = new Date(date + 'T00:00:00.000Z');
        endDate = new Date(date + 'T23:59:59.999Z');
    } else {
        const dateRange = getDateRange(range);
        startDate = dateRange.start;
        endDate = dateRange.end;
    }

    const dateStr = date || startDate.toISOString().slice(0, 10);

    // 并行获取统计数据
    const [
        userCount, activeUserCount, adminCount, totalBalance,
        totalBets, totalBetAmount, wonBets, lostBets, totalWinAmount,
        totalDraws, settledDraws, pendingDraws,
        totalTransactions, depositAmount, withdrawAmount, pendingTransactions, completedTransactions
    ] = await Promise.all([
        User.countDocuments({ deletedAt: null }),
        User.countDocuments({ deletedAt: null, isActive: true }),
        User.countDocuments({ deletedAt: null, role: 'admin' }),
        User.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: null, total: { $sum: '$balance' } } }]),
        
        Bet.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
        Bet.aggregate([{ $match: { createdAt: { $gte: startDate, $lte: endDate } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Bet.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, status: 'won' }),
        Bet.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, status: 'lost' }),
        Bet.aggregate([{ $match: { createdAt: { $gte: startDate, $lte: endDate }, status: 'won' } }, { $group: { _id: null, total: { $sum: '$winAmount' } } }]),
        
        Draw.countDocuments({ date: dateStr }),
        Draw.countDocuments({ date: dateStr, status: 'settled' }),
        Draw.countDocuments({ date: dateStr, status: 'pending' }),
        
        Transaction.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
        Transaction.aggregate([{ $match: { createdAt: { $gte: startDate, $lte: endDate }, type: 'deposit', status: { $in: ['approved', 'completed'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Transaction.aggregate([{ $match: { createdAt: { $gte: startDate, $lte: endDate }, type: 'withdraw', status: { $in: ['approved', 'completed'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Transaction.countDocuments({ status: 'pending' }),
        Transaction.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, status: { $in: ['approved', 'completed'] } })
    ]);

    const totalBetAmountValue = totalBetAmount[0]?.total || 0;
    const totalWinAmountValue = totalWinAmount[0]?.total || 0;
    const depositAmountValue = depositAmount[0]?.total || 0;
    const withdrawAmountValue = withdrawAmount[0]?.total || 0;
    const totalBalanceValue = totalBalance[0]?.total || 0;
    const platformProfit = totalBetAmountValue - totalWinAmountValue;

    const intervalStats = await Bet.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: '$interval', bets: { $sum: 1 }, amount: { $sum: '$amount' }, wonCount: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } }, wonAmount: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, '$winAmount', 0] } } } },
        { $sort: { _id: 1 } }
    ]);

    logger.info('数据统计查询', { range, date: dateStr, operator: admin.username });

    res.json({
        dateRange: { start: startDate.toISOString(), end: endDate.toISOString(), range },
        users: { total: userCount, active: activeUserCount, admins: adminCount, totalBalance: totalBalanceValue },
        bets: { total: totalBets, amount: totalBetAmountValue, won: wonBets, lost: lostBets, winAmount: totalWinAmountValue, platformProfit, winRate: totalBets > 0 ? ((wonBets / totalBets) * 100).toFixed(2) + '%' : '0%' },
        draws: { total: totalDraws, settled: settledDraws, pending: pendingDraws },
        transactions: { total: totalTransactions, depositAmount: depositAmountValue, withdrawAmount: withdrawAmountValue, pending: pendingTransactions, completed: completedTransactions, netInflow: depositAmountValue - withdrawAmountValue },
        intervalStats: intervalStats.map(s => ({ interval: s._id, bets: s.bets, amount: s.amount, wonCount: s.wonCount, wonAmount: s.wonAmount, profit: s.amount - s.wonAmount }))
    });
}

/**
 * 获取系统配置
 */
async function handleConfigGet(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) return res.status(401).json({ error: '需要管理员权限' });

    const configs = await Config.getAll();
    res.json({ success: true, configs });
}

/**
 * 更新系统配置
 */
async function handleConfigUpdate(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) return res.status(401).json({ error: '需要管理员权限' });

    const { key, value } = req.body;
    
    if (!key) {
        return res.status(400).json({ error: '缺少配置键名' });
    }

    // 验证配置键是否有效
    const validKeys = Object.keys(Config.DEFAULT_CONFIG);
    if (!validKeys.includes(key)) {
        return res.status(400).json({ 
            error: '无效的配置键名',
            validKeys 
        });
    }

    await Config.set(key, value, admin._id);
    
    // 如果是CORS配置更新，清除缓存
    if (key.startsWith('cors.')) {
        clearCorsCache();
        logger.info('CORS配置已更新，缓存已清除', { key, operator: admin.username });
    }
    
    logger.info('配置已更新', { key, value, operator: admin.username });
    res.json({ success: true, message: '配置已保存' });
}

/**
 * 批量更新系统配置
 */
async function handleConfigBatchUpdate(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) return res.status(401).json({ error: '需要管理员权限' });

    const { configs } = req.body;
    
    if (!configs || typeof configs !== 'object') {
        return res.status(400).json({ error: '缺少配置数据' });
    }

    const results = [];
    for (const [key, value] of Object.entries(configs)) {
        if (Config.DEFAULT_CONFIG[key]) {
            await Config.set(key, value, admin._id);
            results.push({ key, success: true });
        } else {
            results.push({ key, success: false, error: '无效的配置键名' });
        }
    }

    logger.info('批量配置已更新', { count: results.filter(r => r.success).length, operator: admin.username });
    res.json({ success: true, results });
}

/**
 * 主入口 - 路由分发
 */
const handleAdmin = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    const { action } = req.query;

    try {
        await dbConnect();

        switch (action) {
            case 'init':
                if (req.method === 'GET') {
                    return await handleInitStatus(req, res);
                } else if (req.method === 'POST') {
                    return await handleInitCreate(req, res);
                }
                return res.status(405).json({ error: '方法不允许' });

            case 'verify':
                if (req.method !== 'GET') {
                    return res.status(405).json({ error: '方法不允许' });
                }
                return await handleVerify(req, res);

            case 'archive':
                if (req.method === 'GET') {
                    return await handleArchiveStats(req, res);
                } else if (req.method === 'POST') {
                    return await handleArchiveClean(req, res);
                }
                return res.status(405).json({ error: '方法不允许' });

            case 'stats':
                if (req.method !== 'GET') {
                    return res.status(405).json({ error: '方法不允许' });
                }
                return await handleStats(req, res);

            case 'config':
                if (req.method === 'GET') {
                    return await handleConfigGet(req, res);
                } else if (req.method === 'POST') {
                    return await handleConfigUpdate(req, res);
                } else if (req.method === 'PUT') {
                    return await handleConfigBatchUpdate(req, res);
                }
                return res.status(405).json({ error: '方法不允许' });

            default:
                return res.status(400).json({ 
                    error: '无效的action参数',
                    availableActions: ['init', 'verify', 'archive', 'stats', 'config']
                });
        }
    } catch (error) {
        console.error('管理员模块错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};

module.exports = { handleAdmin, handler: handleAdmin, verifyAdmin };
