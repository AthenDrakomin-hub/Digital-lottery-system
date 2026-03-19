const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const { extractUserFromRequest } = require('../../lib/auth');

module.exports = async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // 处理OPTIONS预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: '方法不允许' });
    }

    try {
        // 验证用户身份
        const userData = extractUserFromRequest(req);
        if (!userData) {
            return res.status(401).json({ error: '未授权，请先登录' });
        }

        const { type, amount, note } = req.body;

        // 验证参数
        if (!type || !['deposit', 'withdraw'].includes(type)) {
            return res.status(400).json({ error: '交易类型必须是deposit或withdraw' });
        }

        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: '金额必须为正数' });
        }

        const amountNum = parseFloat(amount);

        await dbConnect();

        // 查找用户
        const user = await User.findById(userData.id);
        if (!user || !user.isActive) {
            return res.status(404).json({ error: '用户不存在或已被禁用' });
        }

        // 如果是提现，检查余额
        if (type === 'withdraw' && user.balance < amountNum) {
            return res.status(400).json({ error: '余额不足' });
        }

        // 创建交易记录
        const transaction = await Transaction.create({
            userId: user._id,
            type,
            amount: amountNum,
            status: 'pending',
            note: note || (type === 'deposit' ? '充值申请' : '提现申请')
        });

        res.status(201).json({
            message: type === 'deposit' ? '充值申请已提交，等待审核' : '提现申请已提交，等待审核',
            transaction: {
                id: transaction._id,
                type: transaction.type,
                amount: transaction.amount,
                status: transaction.status,
                createdAt: transaction.createdAt
            }
        });
    } catch (error) {
        console.error('提交交易申请错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
