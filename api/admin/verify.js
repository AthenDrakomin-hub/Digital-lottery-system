const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const { extractUserFromRequest } = require('../../lib/auth');

/**
 * 管理员权限验证中间件
 * @param {Object} req - 请求对象
 * @returns {Object|null} 管理员用户对象，验证失败返回null
 */
module.exports = async (req) => {
    try {
        const userData = extractUserFromRequest(req);
        if (!userData) {
            return null;
        }

        await dbConnect();

        const user = await User.findById(userData.id);
        if (!user || user.role !== 'admin' || !user.isActive) {
            return null;
        }

        return user;
    } catch (error) {
        console.error('管理员验证错误:', error);
        return null;
    }
};
