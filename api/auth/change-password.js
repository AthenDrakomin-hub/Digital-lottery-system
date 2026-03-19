const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const { extractUserFromRequest } = require('../../lib/auth');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');

/**
 * 修改密码API
 * POST /api/auth/change-password
 */
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
        // 验证用户身份
        const userData = extractUserFromRequest(req);
        if (!userData) {
            return res.status(401).json({ error: '未授权，请先登录' });
        }

        const { oldPassword, newPassword } = req.body;

        // 验证参数
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: '请输入旧密码和新密码' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: '新密码长度至少6个字符' });
        }

        if (oldPassword === newPassword) {
            return res.status(400).json({ error: '新密码不能与旧密码相同' });
        }

        await dbConnect();

        // 查找用户
        const user = await User.findById(userData.id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 验证旧密码
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: '旧密码错误' });
        }

        // 更新密码
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        res.json({
            success: true,
            message: '密码修改成功'
        });
    } catch (error) {
        console.error('修改密码错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
