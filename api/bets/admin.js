/**
 * 管理员投注管理API
 * 查看所有用户的投注记录
 */
const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const Bet = require('../../models/Bet');
const adminVerify = require('../admin/verify');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');

/**
 * 格式化投注记录
 */
function formatBet(bet) {
    const periodStartMinutes = bet.period * bet.interval;
    const startHour = Math.floor(periodStartMinutes / 60);
    const startMinute = periodStartMinutes % 60;

    return {
        id: bet._id,
        userId: bet.userId,
        username: bet.userId?.username || '-',
        date: bet.date,
        interval: bet.interval,
        period: bet.period + 1,
        periodTime: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`,
        betType: bet.betType,
        championNumbers: bet.championNumbers,
        amount: bet.amount,
        odds: bet.odds,
        selectedCount: bet.selectedCount,
        status: bet.status,
        winAmount: bet.winAmount,
        result: bet.result,
        championNumber: bet.championNumber,
        createdAt: bet.createdAt,
        settledAt: bet.settledAt
    };
}

module.exports = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: '方法不允许' });
    }

    try {
        const admin = await adminVerify(req);
        if (!admin) {
            return res.status(401).json({ error: '需要管理员权限' });
        }

        const { 
            page = 1, 
            limit = 20, 
            status, 
            date, 
            interval,
            period,
            userId,
            startDate,
            endDate
        } = req.query;

        await dbConnect();

        // 构建查询条件
        const query = {};

        if (status && ['pending', 'won', 'lost', 'cancelled'].includes(status)) {
            query.status = status;
        }

        if (date) {
            query.date = date;
        }

        if (interval) {
            query.interval = parseInt(interval);
        }

        if (period !== undefined) {
            query.period = parseInt(period);
        }

        if (userId) {
            query.userId = userId;
        }

        // 日期范围查询
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                query.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                query.createdAt.$lte = new Date(endDate + 'T23:59:59');
            }
        }

        // 分页查询
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const bets = await Bet.find(query)
            .populate('userId', 'username')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Bet.countDocuments(query);

        // 统计信息
        const stats = await Bet.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalBets: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    totalWin: { $sum: '$winAmount' },
                    pendingBets: { 
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } 
                    },
                    wonBets: { 
                        $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } 
                    },
                    lostBets: { 
                        $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } 
                    }
                }
            }
        ]);

        const betStats = stats[0] || {
            totalBets: 0,
            totalAmount: 0,
            totalWin: 0,
            pendingBets: 0,
            wonBets: 0,
            lostBets: 0
        };

        res.json({
            bets: bets.map(formatBet),
            stats: {
                totalBets: betStats.totalBets,
                totalAmount: betStats.totalAmount,
                totalWin: betStats.totalWin,
                totalProfit: betStats.totalAmount - betStats.totalWin,
                pendingBets: betStats.pendingBets,
                wonBets: betStats.wonBets,
                lostBets: betStats.lostBets
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('获取投注记录错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
