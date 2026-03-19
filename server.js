const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.DEPLOY_RUN_PORT || 5000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/xml' })); // 微信回调使用XML
app.use(express.static(path.join(__dirname, 'public')));

// CORS支持
app.use((req, res, next) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
        ? process.env.ALLOWED_ORIGINS.split(',') 
        : ['*'];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Request-ID');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    res.header('Access-Control-Expose-Headers', 'X-Total-Count, X-Page, X-Per-Page');
    
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    
    next();
});

// API路由处理器
const apiRoutes = {
    '/api/auth': './api/auth',
    '/api/users': './api/users',
    '/api/transactions': './api/transactions',
    '/api/admin': './api/admin',
    '/api/system': './api/system'
};

// 注册API路由
Object.keys(apiRoutes).forEach(route => {
    const handler = require(apiRoutes[route]);
    
    app.all(route, async (req, res) => {
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

// 默认路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404处理
app.use((req, res) => {
    res.status(404).json({ error: `路径 ${req.method} ${req.path} 不存在`, code: 'NOT_FOUND' });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
    console.log(`📝 API端点: 5个合并后的函数`);
    console.log(`   - /api/auth?action=register|login|me|change-password`);
    console.log(`   - /api/users[?id=xxx&action=create|balance]`);
    console.log(`   - /api/transactions[?id=xxx&action=request|approve|reject]`);
    console.log(`   - /api/admin?action=init|verify|archive|stats`);
    console.log(`   - /api/system?type=draws|bets|cron|payment`);
});
