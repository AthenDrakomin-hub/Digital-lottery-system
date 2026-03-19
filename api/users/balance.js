const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const adminVerify = require('../admin/verify');

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
        // 验证管理员权限
        const admin = await adminVerify(req);
        if (!admin) {
            return res.status(401).json({ error: '需要管理员权限' });
        }

        const { userId, amount, note } = req.body;

        // 验证参数
        if (!userId) {
            return res.status(400).json({ error: '缺少用户ID' });
        }

        if (!amount || isNaN(amount) || parseFloat(amount) === 0) {
            return res.status(400).json({ error: '金额必须为非零数字' });
        }

        const amountNum = parseFloat(amount);

        await dbConnect();

        // 查找用户
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 计算新余额
        const newBalance = user.balance + amountNum;
        if (newBalance < 0) {
            return res.status(400).json({ error: '余额不足，无法扣款' });
        }

        // 更新用户余额
        user.balance = newBalance;
        await user.save();

        // 创建交易记录
        const transaction = await Transaction.create({
            userId: user._id,
            type: 'adjust',
            amount: Math.abs(amountNum),
            status: 'approved',
            note: note || (amountNum > 0 ? '管理员充值' : '管理员扣款'),
            processedAt: new Date(),
            processedBy: admin._id
        });

        res.json({
            message: '余额调整成功',
            user: {
                id: user._id,
                username: user.username,
                balance: user.balance
            },
            transaction: {
                id: transaction._id,
                amount: amountNum,
                note: transaction.note
            }
        });
    } catch (error) {
        console.error('调整余额错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
