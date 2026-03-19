/**
 * 管理员创建用户API
 */
const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const adminVerify = require('../admin/verify');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');

module.exports = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: '方法不允许' });
    }

    try {
        const admin = await adminVerify(req);
        if (!admin) {
            return res.status(401).json({ error: '需要管理员权限' });
        }

        const { username, password, role = 'user', balance = 0, isActive = true } = req.body;

        // 参数验证
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }

        if (username.length < 3 || username.length > 50) {
            return res.status(400).json({ error: '用户名长度应在3-50个字符之间' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: '密码长度至少6个字符' });
        }

        if (!['user', 'admin'].includes(role)) {
            return res.status(400).json({ error: '角色只能是user或admin' });
        }

        if (balance < 0) {
            return res.status(400).json({ error: '初始余额不能为负数' });
        }

        await dbConnect();

        // 检查用户名是否已存在
        const existing = await User.findOne({ username });
        if (existing) {
            return res.status(400).json({ error: '用户名已存在' });
        }

        // 创建用户
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            username,
            password: hashedPassword,
            role,
            balance: parseFloat(balance),
            isActive
        });

        res.status(201).json({
            message: '用户创建成功',
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                balance: user.balance,
                isActive: user.isActive,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        console.error('创建用户错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
