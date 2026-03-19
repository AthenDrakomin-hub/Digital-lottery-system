/**
 * 交易审核接口
 * POST /api/transactions/:id/approve - 批准交易
 * POST /api/transactions/:id/reject - 拒绝交易
 */

const dbConnect = require('../../../lib/db');
const User = require('../../../models/User');
const Transaction = require('../../../models/Transaction');
const adminVerify = require('../../admin/verify');
const { setCorsHeaders, handlePreflightRequest } = require('../../../lib/cors');
const cache = require('../../../lib/cache');
const { createLogger } = require('../../../lib/logger');

const logger = createLogger('transactions');

/**
 * 批准交易
 */
async function approveTransaction(req, res) {
    const { id } = req.query;
    const { note, payoutInfo } = req.body;

    try {
        // 验证管理员权限
        const admin = await adminVerify(req);
        if (!admin) {
            return res.status(401).json({ error: '需要管理员权限' });
        }

        await dbConnect();

        const transaction = await Transaction.findById(id);
        if (!transaction) {
            return res.status(404).json({ error: '交易记录不存在' });
        }

        if (transaction.status !== 'pending') {
            return res.status(400).json({ error: `该交易已被${transaction.status === 'approved' ? '批准' : '处理'}` });
        }

        const user = await User.findById(transaction.userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 处理充值：直接入账
        if (transaction.type === 'deposit') {
            user.balance += transaction.amount;
            transaction.status = 'completed';
            transaction.completedAt = new Date();
        }
        // 处理提现：扣除余额，等待打款
        else if (transaction.type === 'withdraw') {
            if (user.balance < transaction.amount) {
                return res.status(400).json({ error: '用户余额不足' });
            }
            user.balance -= transaction.amount;
            transaction.status = 'approved'; // 已批准，等待打款
            
            // 如果提供了打款信息
            if (payoutInfo) {
                transaction.payoutInfo = payoutInfo;
            }
        }

        await user.save();
        
        // 更新交易记录
        transaction.processedAt = new Date();
        transaction.processedBy = admin._id;
        if (note) {
            transaction.note = (transaction.note || '') + ` | 审核备注: ${note}`;
        }
        await transaction.save();

        // 更新用户余额缓存
        await cache.setUserBalance(user._id.toString(), user.balance);

        // 记录操作日志
        logger.info('交易已批准', {
            transactionId: id,
            type: transaction.type,
            amount: transaction.amount,
            userId: user._id,
            username: user.username,
            newBalance: user.balance,
            operator: admin.username,
            operatorId: admin._id,
            note
        });

        res.json({
            success: true,
            message: transaction.type === 'deposit' ? '充值已入账' : '提现已批准，等待打款',
            transaction: {
                id: transaction._id,
                type: transaction.type,
                amount: transaction.amount,
                status: transaction.status,
                processedAt: transaction.processedAt
            },
            user: {
                id: user._id,
                username: user.username,
                balance: user.balance
            }
        });
    } catch (error) {
        console.error('批准交易错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
}

/**
 * 拒绝交易
 */
async function rejectTransaction(req, res) {
    const { id } = req.query;
    const { reason } = req.body;

    try {
        // 验证管理员权限
        const admin = await adminVerify(req);
        if (!admin) {
            return res.status(401).json({ error: '需要管理员权限' });
        }

        if (!reason) {
            return res.status(400).json({ error: '请提供拒绝原因' });
        }

        await dbConnect();

        const transaction = await Transaction.findById(id);
        if (!transaction) {
            return res.status(404).json({ error: '交易记录不存在' });
        }

        if (transaction.status !== 'pending') {
            return res.status(400).json({ error: '该交易已被处理' });
        }

        // 更新交易状态
        transaction.status = 'rejected';
        transaction.processedAt = new Date();
        transaction.processedBy = admin._id;
        transaction.note = (transaction.note || '') + ` | 拒绝原因: ${reason}`;
        await transaction.save();

        // 记录操作日志
        logger.warn('交易已拒绝', {
            transactionId: id,
            type: transaction.type,
            amount: transaction.amount,
            userId: transaction.userId,
            reason,
            operator: admin.username,
            operatorId: admin._id
        });

        res.json({
            success: true,
            message: '交易已拒绝',
            transaction: {
                id: transaction._id,
                type: transaction.type,
                amount: transaction.amount,
                status: transaction.status,
                reason
            }
        });
    } catch (error) {
        console.error('拒绝交易错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
}

/**
 * 主处理函数
 */
module.exports = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    const { action } = req.query;

    if (req.method === 'POST') {
        if (action === 'approve') {
            return approveTransaction(req, res);
        } else if (action === 'reject') {
            return rejectTransaction(req, res);
        } else {
            return res.status(400).json({ error: '无效的操作类型，请使用 approve 或 reject' });
        }
    } else {
        return res.status(405).json({ error: '方法不允许' });
    }
};
