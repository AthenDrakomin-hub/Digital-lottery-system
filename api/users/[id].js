const dbConnect = require('../../lib/db');
const User = require('../../models/User');
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

    // 从URL中提取用户ID
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: '缺少用户ID' });
    }

    // GET: 获取用户详情
    if (req.method === 'GET') {
        try {
            await dbConnect();

            const user = await User.findById(id).select('-password');
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }

            res.json({ user });
        } catch (error) {
            console.error('获取用户详情错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    }
    // PATCH: 禁用/启用用户
    else if (req.method === 'PATCH') {
        try {
            // 验证管理员权限
            const admin = await adminVerify(req);
            if (!admin) {
                return res.status(401).json({ error: '需要管理员权限' });
            }

            const { isActive } = req.body;

            if (isActive === undefined) {
                return res.status(400).json({ error: '缺少isActive参数' });
            }

            await dbConnect();

            // 查找用户
            const user = await User.findById(id);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }

            // 不能禁用自己
            if (user._id.toString() === admin._id.toString()) {
                return res.status(400).json({ error: '不能禁用自己的账户' });
            }

            // 更新状态
            user.isActive = isActive;
            await user.save();

            res.json({ 
                message: isActive ? '用户已启用' : '用户已禁用',
                user: {
                    id: user._id,
                    username: user.username,
                    isActive: user.isActive
                }
            });
        } catch (error) {
            console.error('更新用户状态错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    } else {
        res.status(405).json({ error: '方法不允许' });
    }
};
