const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理OPTIONS预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: '方法不允许' });
    }

    try {
        const { username, password } = req.body;

        // 验证输入
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }

        if (username.length < 3 || username.length > 50) {
            return res.status(400).json({ error: '用户名长度应在3-50个字符之间' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: '密码长度至少6个字符' });
        }

        await dbConnect();

        // 检查用户名是否已存在
        const existing = await User.findOne({ username });
        if (existing) {
            return res.status(409).json({ error: '用户名已存在' });
        }

        // 加密密码
        const hashedPassword = await bcrypt.hash(password, 10);

        // 创建用户
        const user = await User.create({
            username,
            password: hashedPassword,
            role: 'user',
            balance: 0,
            isActive: true
        });

        res.status(201).json({
            message: '注册成功',
            user: {
                id: user._id,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('注册错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
