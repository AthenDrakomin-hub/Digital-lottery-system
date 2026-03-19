const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const { extractUserFromRequest } = require('../../lib/auth');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');

module.exports = async (req, res) => {
    // 设置CORS头
    setCorsHeaders(req, res);

    // 处理OPTIONS预检请求
    if (handlePreflightRequest(req, res)) {
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: '方法不允许' });
    }

    try {
        // 验证Token
        const userData = extractUserFromRequest(req);
        if (!userData) {
            return res.status(401).json({ error: '未授权，请先登录' });
        }

        await dbConnect();

        // 查找用户
        const user = await User.findById(userData.id).select('-password');
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 检查用户是否被禁用
        if (!user.isActive) {
            return res.status(403).json({ error: '账户已被禁用' });
        }

        res.json({
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
        console.error('获取用户信息错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
