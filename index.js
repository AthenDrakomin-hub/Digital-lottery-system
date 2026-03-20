// Vercel Serverless 入口点
// 统一处理所有请求

require('dotenv').config();

const express = require('express');
const path = require('path');
const { handleAuth } = require('./api/auth');
const { handleUsers } = require('./api/users');
const { handleTransactions } = require('./api/transactions');
const { handleAdmin } = require('./api/admin');
const { handleSystem } = require('./api/system');

const app = express();

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
});

// API 路由 - 使用正则匹配所有子路径
app.all(/^\/api\/auth(\/.*)?$/, handleAuth);
app.all(/^\/api\/users(\/.*)?$/, handleUsers);
app.all(/^\/api\/transactions(\/.*)?$/, handleTransactions);
app.all(/^\/api\/admin(\/.*)?$/, handleAdmin);
app.all(/^\/api\/system(\/.*)?$/, handleSystem);

// 首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// 导出给 Vercel
module.exports = app;
