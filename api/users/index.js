const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const adminVerify = require('../admin/verify');

module.exports = async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // 处理OPTIONS预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: '方法不允许' });
    }

    try {
        // 验证管理员权限
        const admin = await adminVerify(req);
        if (!admin) {
            return res.status(401).json({ error: '需要管理员权限' });
        }

        const { page = 1, limit = 20, search, role, isActive } = req.query;

        await dbConnect();

        // 构建查询条件
        let query = {};
        if (search) {
            query.username = { $regex: search, $options: 'i' };
        }
        if (role) {
            query.role = role;
        }
        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await User.countDocuments(query);

        res.json({
            users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('获取用户列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
