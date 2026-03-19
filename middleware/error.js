/**
 * 全局错误处理中间件
 */

const { createLogger } = require('../lib/logger');

const logger = createLogger('error');

/**
 * 自定义错误类
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * 常见错误类型
 */
const ErrorTypes = {
    // 400 错误
    BadRequest: (message = '请求参数错误') => new AppError(message, 400, 'BAD_REQUEST'),
    ValidationError: (message = '数据验证失败') => new AppError(message, 400, 'VALIDATION_ERROR'),
    InvalidId: (message = '无效的ID格式') => new AppError(message, 400, 'INVALID_ID'),
    
    // 401 错误
    Unauthorized: (message = '未认证，请先登录') => new AppError(message, 401, 'UNAUTHORIZED'),
    TokenExpired: (message = 'Token已过期') => new AppError(message, 401, 'TOKEN_EXPIRED'),
    InvalidToken: (message = '无效的Token') => new AppError(message, 401, 'INVALID_TOKEN'),
    
    // 403 错误
    Forbidden: (message = '无权限访问') => new AppError(message, 403, 'FORBIDDEN'),
    AdminRequired: (message = '需要管理员权限') => new AppError(message, 403, 'ADMIN_REQUIRED'),
    
    // 404 错误
    NotFound: (resource = '资源') => new AppError(`${resource}不存在`, 404, 'NOT_FOUND'),
    UserNotFound: () => new AppError('用户不存在', 404, 'USER_NOT_FOUND'),
    
    // 409 错误
    Conflict: (message = '资源冲突') => new AppError(message, 409, 'CONFLICT'),
    Duplicate: (field = '字段') => new AppError(`${field}已存在`, 409, 'DUPLICATE'),
    
    // 429 错误
    TooManyRequests: (message = '请求过于频繁') => new AppError(message, 429, 'TOO_MANY_REQUESTS'),
    
    // 500 错误
    Internal: (message = '服务器内部错误') => new AppError(message, 500, 'INTERNAL_ERROR'),
    DatabaseError: (message = '数据库操作失败') => new AppError(message, 500, 'DATABASE_ERROR')
};

/**
 * 全局错误处理中间件
 */
function errorHandler(err, req, res, next) {
    // 如果响应已发送，交给默认错误处理
    if (res.headersSent) {
        return next(err);
    }

    // 获取错误信息
    const statusCode = err.statusCode || 500;
    const code = err.code || 'INTERNAL_ERROR';
    const message = err.message || '服务器内部错误';
    
    // 记录错误日志
    const logData = {
        error: message,
        code,
        statusCode,
        method: req.method,
        path: req.path || req.url,
        ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
        stack: err.stack
    };
    
    // 根据错误级别选择日志级别
    if (statusCode >= 500) {
        logger.error('服务器错误', logData);
    } else if (statusCode >= 400) {
        logger.warn('客户端错误', logData);
    }
    
    // 生产环境不暴露堆栈信息
    const response = {
        error: message,
        code
    };
    
    // 开发环境返回详细信息
    if (process.env.COZE_PROJECT_ENV === 'DEV' || process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
        response.details = err.details || {};
    }
    
    res.status(statusCode).json(response);
}

/**
 * 404 处理中间件
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        error: `路径 ${req.method} ${req.path || req.url} 不存在`,
        code: 'NOT_FOUND'
    });
}

/**
 * 异步路由包装器
 * 自动捕获异步错误并传递给错误处理中间件
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * 包装所有路由方法，自动处理异步错误
 */
function wrapRoutes(router) {
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'all'];
    
    methods.forEach(method => {
        const original = router[method].bind(router);
        router[method] = function(path, ...handlers) {
            const wrappedHandlers = handlers.map(handler => {
                if (typeof handler === 'function') {
                    return asyncHandler(handler);
                }
                return handler;
            });
            return original(path, ...wrappedHandlers);
        };
    });
    
    return router;
}

module.exports = {
    AppError,
    ErrorTypes,
    errorHandler,
    notFoundHandler,
    asyncHandler,
    wrapRoutes
};
