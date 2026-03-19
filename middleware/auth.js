/**
 * 认证中间件
 * 提供统一的JWT认证和管理员权限验证
 */

const jwt = require('jsonwebtoken');
const { createLogger } = require('../lib/logger');

const logger = createLogger('auth');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * JWT认证中间件
 * 验证请求头中的 Authorization: Bearer <token>
 * 将用户信息挂载到 req.user
 */
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ 
            error: '未认证，请先登录',
            code: 'UNAUTHORIZED'
        });
    }

    const token = auth.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
            id: decoded.id || decoded.userId,
            userId: decoded.id || decoded.userId,
            username: decoded.username,
            role: decoded.role
        };
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Token已过期，请重新登录',
                code: 'TOKEN_EXPIRED'
            });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                error: '无效的Token',
                code: 'INVALID_TOKEN'
            });
        }
        
        logger.error('Token验证失败', { error: error.message });
        return res.status(401).json({ 
            error: '认证失败',
            code: 'AUTH_FAILED'
        });
    }
}

/**
 * 管理员权限中间件
 * 在authMiddleware之后使用，检查用户是否为管理员
 */
function adminMiddleware(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ 
            error: '未认证，请先登录',
            code: 'UNAUTHORIZED'
        });
    }

    if (req.user.role !== 'admin') {
        logger.warn('非管理员尝试访问管理接口', {
            userId: req.user.id,
            username: req.user.username,
            path: req.path || req.url,
            ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress
        });
        
        return res.status(403).json({ 
            error: '需要管理员权限',
            code: 'FORBIDDEN'
        });
    }

    next();
}

/**
 * 可选认证中间件
 * 如果有Token则验证，没有则跳过
 */
function optionalAuthMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    
    if (!auth || !auth.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    const token = auth.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
            id: decoded.id || decoded.userId,
            userId: decoded.id || decoded.userId,
            username: decoded.username,
            role: decoded.role
        };
    } catch (error) {
        req.user = null;
    }
    
    next();
}

/**
 * 组合中间件：认证 + 管理员权限
 */
function requireAdmin(req, res, next) {
    return authMiddleware(req, res, (err) => {
        if (err) return next(err);
        return adminMiddleware(req, res, next);
    });
}

/**
 * 生成Token
 */
function generateToken(payload, expiresIn = '7d') {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * 验证Token
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

/**
 * 从请求中提取用户信息（不返回错误，用于已处理的路由）
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
    authMiddleware,
    adminMiddleware,
    optionalAuthMiddleware,
    requireAdmin,
    generateToken,
    verifyToken,
    extractUserFromRequest,
    JWT_SECRET
};
