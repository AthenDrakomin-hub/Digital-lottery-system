const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../../lib/auth');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');

module.exports = async (req, res) => {
    // 设置CORS头
    setCorsHeaders(req, res);

    // 处理OPTIONS预检请求
    if (handlePreflightRequest(req, res)) {
        return;
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

        await dbConnect();

        // 查找用户
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        // 检查用户是否被禁用
        if (!user.isActive) {
            return res.status(403).json({ error: '账户已被禁用' });
        }

        // 验证密码
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        // 生成Token
        const token = generateToken({
            id: user._id,
            username: user.username,
            role: user.role
        });

        res.json({
            message: '登录成功',
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                balance: user.balance
            }
        });
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
