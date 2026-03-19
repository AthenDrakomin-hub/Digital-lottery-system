/**
 * 投注记录查询API
 */

const dbConnect = require('../../lib/db');
const Bet = require('../../models/Bet');
const Draw = require('../../models/Draw');
const { extractUserFromRequest } = require('../../lib/auth');
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
        date: bet.date,
        interval: bet.interval,
        period: bet.period + 1,
        periodTime: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`,
        betType: bet.betType,
        championNumbers: bet.championNumbers,
        numbers: bet.numbers,
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
        // 验证用户身份
        const userData = extractUserFromRequest(req);
        if (!userData) {
            return res.status(401).json({ error: '未授权，请先登录' });
        }

        const { 
            page = 1, 
            limit = 20, 
            status, 
            date, 
            interval,
            period 
        } = req.query;

        await dbConnect();

        // 构建查询条件
        const query = { userId: userData.id };

        if (status && ['pending', 'won', 'lost'].includes(status)) {
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

        // 分页查询
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const bets = await Bet.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Bet.countDocuments(query);

        // 统计信息
        const stats = await Bet.aggregate([
            { $match: { userId: require('mongoose').Types.ObjectId(userData.id) } },
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
                    }
                }
            }
        ]);

        const userStats = stats[0] || {
            totalBets: 0,
            totalAmount: 0,
            totalWin: 0,
            pendingBets: 0,
            wonBets: 0
        };

        res.json({
            bets: bets.map(formatBet),
            stats: {
                totalBets: userStats.totalBets,
                totalAmount: userStats.totalAmount,
                totalWin: userStats.totalWin,
                pendingBets: userStats.pendingBets,
                wonBets: userStats.wonBets,
                profit: userStats.totalWin - userStats.totalAmount
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
