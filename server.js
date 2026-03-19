const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.DEPLOY_RUN_PORT || 5000;

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS支持 - 完整配置
app.use((req, res, next) => {
    // 允许所有来源（生产环境建议指定具体域名）
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
        ? process.env.ALLOWED_ORIGINS.split(',') 
        : ['*'];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    
    // 允许的HTTP方法
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    
    // 允许的请求头
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Request-ID');
    
    // 允许携带凭证（cookies）
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // 预检请求缓存时间（秒）
    res.header('Access-Control-Max-Age', '86400');
    
    // 暴露给客户端的响应头
    res.header('Access-Control-Expose-Headers', 'X-Total-Count, X-Page, X-Per-Page');
    
    // 处理OPTIONS预检请求
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    
    next();
});

// 动态加载API路由
const apiRoutes = {
    '/api/auth/register': './api/auth/register',
    '/api/auth/login': './api/auth/login',
    '/api/auth/me': './api/auth/me',
    '/api/users': './api/users/index',
    '/api/users/balance': './api/users/balance',
    '/api/draws': './api/draws/index',
    '/api/draws/daily': './api/draws/daily',
    '/api/transactions': './api/transactions/index',
    '/api/transactions/request': './api/transactions/request',
    '/api/cron/check-draws': './api/cron/check-draws'
};

// 注册API路由
Object.keys(apiRoutes).forEach(route => {
    const handler = require(apiRoutes[route]);
    app.all(route, async (req, res) => {
        // 模拟Vercel的req和res对象
        const vercelReq = {
            ...req,
            query: req.query,
            body: req.body,
            headers: req.headers,
            method: req.method
        };
        
        try {
            await handler(vercelReq, res);
        } catch (error) {
            console.error(`API错误 [${route}]:`, error);
            res.status(500).json({ error: '服务器内部错误' });
        }
    });
});

// 处理动态路由（用户ID）
app.all('/api/users/:id', async (req, res) => {
    const handler = require('./api/users/[id]');
    const vercelReq = {
        ...req,
        query: { id: req.params.id, ...req.query },
        body: req.body,
        headers: req.headers,
        method: req.method
    };
    
    try {
        await handler(vercelReq, res);
    } catch (error) {
        console.error('API错误 [/api/users/:id]:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 默认路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
    console.log(`📝 API文档: http://localhost:${PORT}/api`);
    console.log(`\n⏳ 等待数据库连接...`);
    console.log(`提示: 请确保设置了 MONGODB_URI 环境变量`);
});
