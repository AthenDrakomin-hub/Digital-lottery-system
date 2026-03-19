const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const { extractUserFromRequest } = require('../../lib/auth');
const adminVerify = require('../admin/verify');

module.exports = async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // 处理OPTIONS预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET: 获取交易记录
    if (req.method === 'GET') {
        try {
            const userData = extractUserFromRequest(req);
            if (!userData) {
                return res.status(401).json({ error: '未授权，请先登录' });
            }

            const { page = 1, limit = 20, type, status, userId } = req.query;

            await dbConnect();

            // 构建查询条件
            let query = {};
            
            // 如果不是管理员，只能查看自己的交易记录
            const user = await User.findById(userData.id);
            if (user.role !== 'admin') {
                query.userId = userData.id;
            } else {
                // 管理员可以查看指定用户的交易记录
                if (userId) {
                    query.userId = userId;
                }
            }

            if (type) {
                query.type = type;
            }
            if (status) {
                query.status = status;
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const transactions = await Transaction.find(query)
                .populate('userId', 'username')
                .populate('processedBy', 'username')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit));

            const total = await Transaction.countDocuments(query);

            res.json({
                transactions,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('获取交易记录错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    }
    // PATCH: 审核交易
    else if (req.method === 'PATCH') {
        try {
            // 验证管理员权限
            const admin = await adminVerify(req);
            if (!admin) {
                return res.status(401).json({ error: '需要管理员权限' });
            }

            const { transactionId, status, note } = req.body;

            // 验证参数
            if (!transactionId) {
                return res.status(400).json({ error: '缺少交易ID' });
            }

            if (!status || !['approved', 'rejected'].includes(status)) {
                return res.status(400).json({ error: '状态必须是approved或rejected' });
            }

            await dbConnect();

            // 查找交易记录
            const transaction = await Transaction.findById(transactionId);
            if (!transaction) {
                return res.status(404).json({ error: '交易记录不存在' });
            }

            // 检查交易状态
            if (transaction.status !== 'pending') {
                return res.status(400).json({ error: '该交易已被处理' });
            }

            // 查找用户
            const user = await User.findById(transaction.userId);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }

            // 如果批准，更新用户余额
            if (status === 'approved') {
                if (transaction.type === 'deposit') {
                    user.balance += transaction.amount;
                } else if (transaction.type === 'withdraw') {
                    if (user.balance < transaction.amount) {
                        return res.status(400).json({ error: '用户余额不足，无法批准提现' });
                    }
                    user.balance -= transaction.amount;
                }
                await user.save();
            }

            // 更新交易状态
            transaction.status = status;
            transaction.processedAt = new Date();
            transaction.processedBy = admin._id;
            if (note) {
                transaction.note = transaction.note + ' | 审核备注: ' + note;
            }
            await transaction.save();

            res.json({
                message: status === 'approved' ? '交易已批准' : '交易已拒绝',
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
            console.error('审核交易错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    } else {
        res.status(405).json({ error: '方法不允许' });
    }
};
