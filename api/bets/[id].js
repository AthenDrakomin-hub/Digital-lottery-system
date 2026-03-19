/**
 * 投注详情API - 查询和取消
 */
const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const Bet = require('../../models/Bet');
const { extractUserFromRequest } = require('../../lib/auth');
const adminVerify = require('../admin/verify');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');
const cache = require('../../lib/cache');

module.exports = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: '缺少投注ID' });
    }

    // GET: 获取投注详情
    if (req.method === 'GET') {
        try {
            const userData = extractUserFromRequest(req);
            if (!userData) {
                return res.status(401).json({ error: '未授权，请先登录' });
            }

            await dbConnect();

            const bet = await Bet.findById(id);
            if (!bet) {
                return res.status(404).json({ error: '投注记录不存在' });
            }

            // 非管理员只能查看自己的投注
            const user = await User.findById(userData.id);
            if (user.role !== 'admin' && bet.userId.toString() !== userData.id) {
                return res.status(403).json({ error: '无权查看此投注记录' });
            }

            // 格式化返回
            const periodStartMinutes = bet.period * bet.interval;
            const startHour = Math.floor(periodStartMinutes / 60);
            const startMinute = periodStartMinutes % 60;

            res.json({
                bet: {
                    id: bet._id,
                    userId: bet.userId,
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
                }
            });
        } catch (error) {
            console.error('获取投注详情错误:', error);
            if (error.name === 'CastError') {
                return res.status(400).json({ error: '无效的投注ID' });
            }
            res.status(500).json({ error: '服务器错误' });
        }
    }
    // DELETE: 取消投注
    else if (req.method === 'DELETE') {
        try {
            const userData = extractUserFromRequest(req);
            if (!userData) {
                return res.status(401).json({ error: '未授权，请先登录' });
            }

            await dbConnect();

            const bet = await Bet.findById(id);
            if (!bet) {
                return res.status(404).json({ error: '投注记录不存在' });
            }

            // 只能取消待开奖的投注
            if (bet.status !== 'pending') {
                return res.status(400).json({ error: '只能取消待开奖的投注' });
            }

            // 非管理员只能取消自己的投注
            const user = await User.findById(userData.id);
            if (user.role !== 'admin' && bet.userId.toString() !== userData.id) {
                return res.status(403).json({ error: '无权取消此投注' });
            }

            // 检查是否已过投注截止时间（开奖前1分钟不能取消）
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes();
            const currentMinutes = hours * 60 + minutes;
            const periodEndMinutes = (bet.period + 1) * bet.interval;

            if (currentMinutes >= periodEndMinutes - 1) {
                return res.status(400).json({ error: '本期已截止，无法取消投注' });
            }

            // 退还金额
            const refundUser = await User.findById(bet.userId);
            refundUser.balance += bet.amount;
            await refundUser.save();

            // 更新缓存
            await cache.setUserBalance(refundUser._id.toString(), refundUser.balance);

            // 取消投注
            bet.status = 'cancelled';
            bet.cancelledAt = new Date();
            bet.cancelledBy = userData.id;
            bet.refundAmount = bet.amount;
            await bet.save();

            res.json({
                message: '投注已取消，金额已退还',
                bet: {
                    id: bet._id,
                    status: bet.status,
                    refundAmount: bet.amount
                },
                user: {
                    balance: refundUser.balance
                }
            });
        } catch (error) {
            console.error('取消投注错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    } else {
        res.status(405).json({ error: '方法不允许' });
    }
};
