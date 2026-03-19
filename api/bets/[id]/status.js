/**
 * 投注状态修改接口
 * PATCH /api/bets/:id/status
 * 管理员手动修改投注状态（用于处理争议）
 */

const dbConnect = require('../../../lib/db');
const User = require('../../../models/User');
const Bet = require('../../../models/Bet');
const adminVerify = require('../../admin/verify');
const { setCorsHeaders, handlePreflightRequest } = require('../../../lib/cors');
const cache = require('../../../lib/cache');
const { createLogger } = require('../../../lib/logger');

const logger = createLogger('bets');

module.exports = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    // 只允许 PATCH 方法
    if (req.method !== 'PATCH') {
        return res.status(405).json({ error: '方法不允许' });
    }

    const { id } = req.query;
    const { status, winAmount, reason } = req.body;

    try {
        // 验证管理员权限
        const admin = await adminVerify(req);
        if (!admin) {
            return res.status(401).json({ error: '需要管理员权限' });
        }

        // 验证参数
        if (!status) {
            return res.status(400).json({ error: '请提供新的状态' });
        }

        const validStatuses = ['pending', 'won', 'lost', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: `无效的状态，允许的值: ${validStatuses.join(', ')}` });
        }

        if (!reason) {
            return res.status(400).json({ error: '请提供修改原因（用于审计）' });
        }

        await dbConnect();

        const bet = await Bet.findById(id);
        if (!bet) {
            return res.status(404).json({ error: '投注记录不存在' });
        }

        const oldStatus = bet.status;
        const oldWinAmount = bet.winAmount;

        // 获取用户
        const user = await User.findById(bet.userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 处理余额变更
        let balanceChange = 0;

        // 从非取消状态变为取消：退还金额
        if (oldStatus !== 'cancelled' && status === 'cancelled') {
            balanceChange = bet.amount;
        }
        // 从取消状态变为其他：扣回金额
        else if (oldStatus === 'cancelled' && status !== 'cancelled') {
            balanceChange = -bet.amount;
        }

        // 从未中奖变为中奖：发放奖金
        if (oldStatus !== 'won' && status === 'won') {
            const finalWinAmount = winAmount || bet.winAmount || 0;
            balanceChange += finalWinAmount;
            bet.winAmount = finalWinAmount;
        }
        // 从中奖变为未中奖：扣回奖金
        else if (oldStatus === 'won' && status !== 'won') {
            balanceChange -= bet.winAmount || 0;
        }

        // 检查余额是否足够（需要扣款时）
        if (balanceChange < 0 && user.balance < Math.abs(balanceChange)) {
            return res.status(400).json({ 
                error: `用户余额不足，当前余额: ¥${user.balance.toFixed(2)}，需要: ¥${Math.abs(balanceChange).toFixed(2)}` 
            });
        }

        // 更新投注状态
        bet.status = status;
        bet.settledAt = status !== 'pending' ? new Date() : null;
        if (status === 'cancelled') {
            bet.cancelledAt = new Date();
            bet.cancelledBy = admin._id;
        }

        // 保存投注记录
        await bet.save();

        // 更新用户余额
        if (balanceChange !== 0) {
            user.balance += balanceChange;
            await user.save();
            await cache.setUserBalance(user._id.toString(), user.balance);
        }

        // 记录操作日志（重要！用于审计）
        logger.warn('投注状态已手动修改', {
            betId: id,
            userId: user._id,
            username: user.username,
            oldStatus,
            newStatus: status,
            oldWinAmount,
            newWinAmount: bet.winAmount,
            balanceChange,
            reason,
            operator: admin.username,
            operatorId: admin._id,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: '投注状态已更新',
            bet: {
                id: bet._id,
                status: bet.status,
                winAmount: bet.winAmount,
                settledAt: bet.settledAt
            },
            user: {
                id: user._id,
                username: user.username,
                balance: user.balance,
                balanceChange
            },
            audit: {
                reason,
                operator: admin.username,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('修改投注状态错误:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: '无效的投注ID' });
        }
        res.status(500).json({ error: '服务器错误' });
    }
};
