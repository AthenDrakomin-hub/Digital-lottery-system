/**
 * 交易详情API - 查询和取消
 */
const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const { extractUserFromRequest } = require('../../lib/auth');
const adminVerify = require('../admin/verify');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');

module.exports = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: '缺少交易ID' });
    }

    // GET: 获取交易详情
    if (req.method === 'GET') {
        try {
            const userData = extractUserFromRequest(req);
            if (!userData) {
                return res.status(401).json({ error: '未授权，请先登录' });
            }

            await dbConnect();

            const transaction = await Transaction.findById(id)
                .populate('userId', 'username')
                .populate('processedBy', 'username');

            if (!transaction) {
                return res.status(404).json({ error: '交易记录不存在' });
            }

            // 非管理员只能查看自己的交易
            const user = await User.findById(userData.id);
            if (user.role !== 'admin' && transaction.userId._id.toString() !== userData.id) {
                return res.status(403).json({ error: '无权查看此交易记录' });
            }

            res.json({ transaction });
        } catch (error) {
            console.error('获取交易详情错误:', error);
            if (error.name === 'CastError') {
                return res.status(400).json({ error: '无效的交易ID' });
            }
            res.status(500).json({ error: '服务器错误' });
        }
    }
    // DELETE: 取消交易
    else if (req.method === 'DELETE') {
        try {
            const userData = extractUserFromRequest(req);
            if (!userData) {
                return res.status(401).json({ error: '未授权，请先登录' });
            }

            await dbConnect();

            const transaction = await Transaction.findById(id);
            if (!transaction) {
                return res.status(404).json({ error: '交易记录不存在' });
            }

            // 只能取消待审核的交易
            if (transaction.status !== 'pending') {
                return res.status(400).json({ error: '只能取消待审核的交易' });
            }

            // 非管理员只能取消自己的交易
            const user = await User.findById(userData.id);
            if (user.role !== 'admin' && transaction.userId.toString() !== userData.id) {
                return res.status(403).json({ error: '无权取消此交易' });
            }

            // 取消交易
            transaction.status = 'cancelled';
            transaction.cancelledAt = new Date();
            transaction.cancelledBy = userData.id;
            await transaction.save();

            res.json({
                message: '交易已取消',
                transaction: {
                    id: transaction._id,
                    type: transaction.type,
                    amount: transaction.amount,
                    status: transaction.status
                }
            });
        } catch (error) {
            console.error('取消交易错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    } else {
        res.status(405).json({ error: '方法不允许' });
    }
};
