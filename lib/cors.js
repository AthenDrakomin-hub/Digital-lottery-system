/**
 * CORS配置工具
 * 用于统一处理跨域请求
 */

// 内存缓存
let cachedOrigins = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 缓存1分钟

/**
 * 获取允许的域名列表
 * 优先级：缓存 > 环境变量 > 默认值
 * 数据库配置会在首次请求时加载
 */
async function getAllowedOrigins() {
    const now = Date.now();
    
    // 使用缓存（1分钟内有效）
    if (cachedOrigins && (now - cacheTime) < CACHE_TTL) {
        return cachedOrigins;
    }
    
    // 默认配置
    let origins = ['*'];
    
    // 尝试从环境变量读取
    if (process.env.ALLOWED_ORIGINS) {
        origins = process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
    }
    
    // 尝试从数据库读取（异步，不阻塞）
    try {
        const db = require('./db');
        const Config = require('../models/Config');
        
        // 设置超时，避免无限等待
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Database read timeout')), 2000);
        });
        
        const dbPromise = (async () => {
            await db();
            const enabled = await Config.get('cors.enabled', true);
            if (!enabled) return [];
            return await Config.get('cors.allowedOrigins', origins);
        })();
        
        const dbOrigins = await Promise.race([dbPromise, timeoutPromise]);
        if (dbOrigins && dbOrigins.length > 0) {
            origins = Array.isArray(dbOrigins) ? dbOrigins : [dbOrigins];
        }
    } catch (e) {
        // 数据库读取失败，使用环境变量或默认值
        console.log('[CORS] 数据库读取失败，使用默认配置:', e.message);
    }
    
    cachedOrigins = origins;
    cacheTime = now;
    return cachedOrigins;
}

/**
 * 清除缓存（配置更新后调用）
 */
function clearCorsCache() {
    cachedOrigins = null;
    cacheTime = 0;
}

/**
 * 设置CORS响应头（同步版本，用于快速响应）
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
function setCorsHeadersSync(req, res) {
    // 使用缓存或默认值
    const allowedOrigins = cachedOrigins || ['*'];
    const origin = req.headers?.origin || req.headers?.Origin;
    
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
    
    // 后台更新缓存
    getAllowedOrigins().catch(() => {});
}

/**
 * 设置CORS响应头（异步版本）
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function setCorsHeaders(req, res) {
    try {
        const allowedOrigins = await getAllowedOrigins();
        const origin = req.headers?.origin || req.headers?.Origin;
        
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
        // 发生错误时使用默认配置
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    }
}

/**
 * 处理OPTIONS预检请求
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @returns {boolean} 如果是OPTIONS请求返回true，否则返回false
 */
function handlePreflightRequest(req, res) {
    if (req.method === 'OPTIONS') {
        setCorsHeadersSync(req, res);
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
        // 设置CORS头（使用同步版本快速响应）
        setCorsHeadersSync(req, res);
        
        // 处理预检请求
        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return;
        }
        
        // 调用原始处理器
        return handler(req, res);
    };
}

module.exports = {
    setCorsHeaders,
    setCorsHeadersSync,
    handlePreflightRequest,
    withCors,
    clearCorsCache,
    getAllowedOrigins
};
