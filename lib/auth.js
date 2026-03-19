const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * 生成JWT Token
 * @param {Object} payload - 要编码的数据
 * @param {string} expiresIn - 过期时间，默认7天
 * @returns {string} JWT Token
 */
function generateToken(payload, expiresIn = '7d') {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * 验证JWT Token
 * @param {string} token - JWT Token
 * @returns {Object|null} 解码后的数据，失败返回null
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

/**
 * 从请求头中提取并验证Token
 * @param {Object} req - 请求对象
 * @returns {Object|null} 解码后的用户数据，失败返回null
 */
function extractUserFromRequest(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return null;
    }

    const token = auth.split(' ')[1];
    return verifyToken(token);
}

module.exports = {
    generateToken,
    verifyToken,
    extractUserFromRequest,
    JWT_SECRET
};
