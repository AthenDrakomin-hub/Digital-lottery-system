/**
 * 数据统计接口
 * GET /api/admin/stats
 * 提供运营数据统计
 */

const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const Draw = require('../../models/Draw');
const Bet = require('../../models/Bet');
const Transaction = require('../../models/Transaction');
const adminVerify = require('../admin/verify');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');
const { createLogger } = require('../../lib/logger');

const logger = createLogger('admin');

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

module.exports = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    // 只允许 GET 方法
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '方法不允许' });
    }

    try {
        // 验证管理员权限
        const admin = await adminVerify(req);
        if (!admin) {
            return res.status(401).json({ error: '需要管理员权限' });
        }

        await dbConnect();

        const { range = 'today', date } = req.query;
        
        // 指定日期或范围
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
            userCount,
            activeUserCount,
            adminCount,
            totalBalance,
            
            totalBets,
            totalBetAmount,
            wonBets,
            lostBets,
            totalWinAmount,
            
            totalDraws,
            settledDraws,
            pendingDraws,
            
            totalTransactions,
            depositAmount,
            withdrawAmount,
            pendingTransactions,
            completedTransactions
        ] = await Promise.all([
            // 用户统计
            User.countDocuments({ deletedAt: null }),
            User.countDocuments({ deletedAt: null, isActive: true }),
            User.countDocuments({ deletedAt: null, role: 'admin' }),
            User.aggregate([
                { $match: { deletedAt: null } },
                { $group: { _id: null, total: { $sum: '$balance' } } }
            ]),
            
            // 投注统计（指定日期）
            Bet.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
            Bet.aggregate([
                { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Bet.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, status: 'won' }),
            Bet.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, status: 'lost' }),
            Bet.aggregate([
                { $match: { createdAt: { $gte: startDate, $lte: endDate }, status: 'won' } },
                { $group: { _id: null, total: { $sum: '$winAmount' } } }
            ]),
            
            // 开奖统计
            Draw.countDocuments({ date: dateStr }),
            Draw.countDocuments({ date: dateStr, status: 'settled' }),
            Draw.countDocuments({ date: dateStr, status: 'pending' }),
            
            // 交易统计
            Transaction.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
            Transaction.aggregate([
                { $match: { createdAt: { $gte: startDate, $lte: endDate }, type: 'deposit', status: { $in: ['approved', 'completed'] } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Transaction.aggregate([
                { $match: { createdAt: { $gte: startDate, $lte: endDate }, type: 'withdraw', status: { $in: ['approved', 'completed'] } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            Transaction.countDocuments({ status: 'pending' }),
            Transaction.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, status: { $in: ['approved', 'completed'] } })
        ]);

        // 计算盈亏
        const totalBetAmountValue = totalBetAmount[0]?.total || 0;
        const totalWinAmountValue = totalWinAmount[0]?.total || 0;
        const depositAmountValue = depositAmount[0]?.total || 0;
        const withdrawAmountValue = withdrawAmount[0]?.total || 0;
        const totalBalanceValue = totalBalance[0]?.total || 0;
        
        // 平台盈亏 = 投注金额 - 派奖金额
        const platformProfit = totalBetAmountValue - totalWinAmountValue;

        // 按周期统计
        const intervalStats = await Bet.aggregate([
            { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
            { 
                $group: { 
                    _id: '$interval',
                    bets: { $sum: 1 },
                    amount: { $sum: '$amount' },
                    wonCount: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
                    wonAmount: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, '$winAmount', 0] } }
                } 
            },
            { $sort: { _id: 1 } }
        ]);

        // 记录统计查询日志
        logger.info('数据统计查询', {
            range,
            date: dateStr,
            operator: admin.username,
            operatorId: admin._id
        });

        res.json({
            dateRange: {
                start: startDate.toISOString(),
                end: endDate.toISOString(),
                range
            },
            users: {
                total: userCount,
                active: activeUserCount,
                admins: adminCount,
                totalBalance: totalBalanceValue
            },
            bets: {
                total: totalBets,
                amount: totalBetAmountValue,
                won: wonBets,
                lost: lostBets,
                winAmount: totalWinAmountValue,
                platformProfit,
                winRate: totalBets > 0 ? ((wonBets / totalBets) * 100).toFixed(2) + '%' : '0%'
            },
            draws: {
                total: totalDraws,
                settled: settledDraws,
                pending: pendingDraws
            },
            transactions: {
                total: totalTransactions,
                depositAmount: depositAmountValue,
                withdrawAmount: withdrawAmountValue,
                pending: pendingTransactions,
                completed: completedTransactions,
                netInflow: depositAmountValue - withdrawAmountValue
            },
            intervalStats: intervalStats.map(s => ({
                interval: s._id,
                bets: s.bets,
                amount: s.amount,
                wonCount: s.wonCount,
                wonAmount: s.wonAmount,
                profit: s.amount - s.wonAmount
            }))
        });

    } catch (error) {
        console.error('获取统计数据错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
