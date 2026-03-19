/**
 * CORS配置工具
 * 用于统一处理跨域请求
 */

/**
 * 设置CORS响应头
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
function setCorsHeaders(req, res) {
    // 允许所有来源（生产环境建议指定具体域名）
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
        ? process.env.ALLOWED_ORIGINS.split(',') 
        : ['*'];
    
    const origin = req.headers?.origin || req.headers?.Origin;
    
    if (allowedOrigins.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    // 允许的HTTP方法
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    
    // 允许的请求头
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Request-ID');
    
    // 允许携带凭证（cookies）
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // 预检请求缓存时间（秒）
    res.setHeader('Access-Control-Max-Age', '86400');
    
    // 暴露给客户端的响应头
    res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count, X-Page, X-Per-Page');
}

/**
 * 处理OPTIONS预检请求
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @returns {boolean} 如果是OPTIONS请求返回true，否则返回false
 */
function handlePreflightRequest(req, res) {
    if (req.method === 'OPTIONS') {
        setCorsHeaders(req, res);
        res.status(204).end();
        return true;
    }
    return false;
}

/**
 * CORS中间件包装器
 * 用于包装Vercel Serverless Function处理器
 * @param {Function} handler - 原始处理器函数
 * @returns {Function} 包装后的处理器函数
 */
function withCors(handler) {
    return async (req, res) => {
        // 设置CORS头
        setCorsHeaders(req, res);
        
        // 处理预检请求
        if (handlePreflightRequest(req, res)) {
            return;
        }
        
        // 调用原始处理器
        return handler(req, res);
    };
}

module.exports = {
    setCorsHeaders,
    handlePreflightRequest,
    withCors
};
