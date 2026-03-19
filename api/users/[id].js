/**
 * 用户详情API - 增删改查
 */
const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const adminVerify = require('../admin/verify');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');

module.exports = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

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
            if (error.name === 'CastError') {
                return res.status(400).json({ error: '无效的用户ID' });
            }
            res.status(500).json({ error: '服务器错误' });
        }
    }
    // PUT: 更新用户信息
    else if (req.method === 'PUT') {
        try {
            const admin = await adminVerify(req);
            if (!admin) {
                return res.status(401).json({ error: '需要管理员权限' });
            }

            const { username, role, isActive } = req.body;

            await dbConnect();

            const user = await User.findById(id);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }

            // 更新字段
            if (username && username !== user.username) {
                const existing = await User.findOne({ username, _id: { $ne: id } });
                if (existing) {
                    return res.status(400).json({ error: '用户名已存在' });
                }
                user.username = username;
            }

            if (role && ['user', 'admin'].includes(role)) {
                user.role = role;
            }

            if (isActive !== undefined) {
                user.isActive = isActive;
            }

            await user.save();

            res.json({
                message: '用户信息已更新',
                user: {
                    id: user._id,
                    username: user.username,
                    role: user.role,
                    balance: user.balance,
                    isActive: user.isActive
                }
            });
        } catch (error) {
            console.error('更新用户错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    }
    // PATCH: 禁用/启用用户
    else if (req.method === 'PATCH') {
        try {
            const admin = await adminVerify(req);
            if (!admin) {
                return res.status(401).json({ error: '需要管理员权限' });
            }

            const { isActive, role, balance } = req.body;

            await dbConnect();

            const user = await User.findById(id);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }

            // 不能禁用自己
            if (user._id.toString() === admin._id.toString() && isActive === false) {
                return res.status(400).json({ error: '不能禁用自己的账户' });
            }

            // 更新状态
            if (isActive !== undefined) {
                user.isActive = isActive;
            }
            if (role !== undefined && ['user', 'admin'].includes(role)) {
                user.role = role;
            }
            if (balance !== undefined && !isNaN(parseFloat(balance))) {
                user.balance = parseFloat(balance);
            }

            await user.save();

            res.json({
                message: '用户状态已更新',
                user: {
                    id: user._id,
                    username: user.username,
                    role: user.role,
                    balance: user.balance,
                    isActive: user.isActive
                }
            });
        } catch (error) {
            console.error('更新用户状态错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    }
    // DELETE: 删除用户
    else if (req.method === 'DELETE') {
        try {
            const admin = await adminVerify(req);
            if (!admin) {
                return res.status(401).json({ error: '需要管理员权限' });
            }

            await dbConnect();

            const user = await User.findById(id);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }

            // 不能删除自己
            if (user._id.toString() === admin._id.toString()) {
                return res.status(400).json({ error: '不能删除自己的账户' });
            }

            // 软删除：设置为禁用状态
            user.isActive = false;
            user.deletedAt = new Date();
            await user.save();

            res.json({
                message: '用户已删除',
                user: {
                    id: user._id,
                    username: user.username
                }
            });
        } catch (error) {
            console.error('删除用户错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    } else {
        res.status(405).json({ error: '方法不允许' });
    }
};
