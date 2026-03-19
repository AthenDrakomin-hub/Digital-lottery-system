const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.DEPLOY_RUN_PORT || 5000;

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS支持
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
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
