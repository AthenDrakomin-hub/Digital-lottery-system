/**
 * CORS配置工具
 * 用于统一处理跨域请求
 * 
 * 设计原则：同步处理，避免异步导致的headers已发送错误
 */

// 内存缓存
let cachedOrigins = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 缓存1分钟

/**
 * 获取允许的域名列表（同步版本，使用缓存）
 */
function getAllowedOriginsSync() {
    // 使用缓存
    if (cachedOrigins) {
        return cachedOrigins;
    }
    
    // 从环境变量读取或使用默认值
    let origins = ['*'];
    if (process.env.ALLOWED_ORIGINS) {
        origins = process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
    }
    
    return origins;
}

/**
 * 更新缓存（异步，不阻塞请求处理）
 */
async function updateCorsCache() {
    try {
        const now = Date.now();
        
        // 检查缓存是否过期
        if (cachedOrigins && (now - cacheTime) < CACHE_TTL) {
            return cachedOrigins;
        }
        
        // 默认配置
        let origins = ['*'];
        
        // 从环境变量读取
        if (process.env.ALLOWED_ORIGINS) {
            origins = process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
        }
        
        // 尝试从数据库读取
        try {
            const db = require('./db');
            const Config = require('../models/Config');
            
            await db();
            
            const enabled = await Config.get('cors.enabled', true);
            if (!enabled) {
                cachedOrigins = [];
                cacheTime = now;
                return cachedOrigins;
            }
            
            const dbOrigins = await Config.get('cors.allowedOrigins', origins);
            if (dbOrigins && dbOrigins.length > 0) {
                origins = Array.isArray(dbOrigins) ? dbOrigins : [dbOrigins];
            }
        } catch (e) {
            // 数据库读取失败，使用环境变量或默认值
            console.log('[CORS] 数据库读取失败，使用默认配置');
        }
        
        cachedOrigins = origins;
        cacheTime = now;
        return cachedOrigins;
    } catch (e) {
        console.error('[CORS] 更新缓存失败:', e.message);
        return cachedOrigins || ['*'];
    }
}

/**
 * 清除缓存（配置更新后调用）
 */
function clearCorsCache() {
    cachedOrigins = null;
    cacheTime = 0;
}

/**
 * 设置CORS响应头
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
function setCorsHeaders(req, res) {
    // 检查响应头是否已发送
    if (res.headersSent) {
        return;
    }
    
    const allowedOrigins = getAllowedOriginsSync();
    const origin = req.headers?.origin || req.headers?.Origin;
    
    try {
        if (allowedOrigins.includes('*')) {
            res.setHeader('Access-Control-Allow-Origin', '*');
        } else if (origin && allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Request-ID');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '86400');
        res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count, X-Page, X-Per-Page');
    } catch (e) {
        // headers可能已被发送，忽略错误
    }
    
    // 后台异步更新缓存（不阻塞当前请求）
    updateCorsCache().catch(() => {});
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
        if (!res.headersSent) {
            res.status(204).end();
        }
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
        if (req.method === 'OPTIONS') {
            if (!res.headersSent) {
                res.status(204).end();
            }
            return;
        }
        
        // 调用原始处理器
        return handler(req, res);
    };
}

module.exports = {
    setCorsHeaders,
    handlePreflightRequest,
    withCors,
    clearCorsCache,
    getAllowedOriginsSync,
    updateCorsCache
};
