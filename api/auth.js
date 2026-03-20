/**
 * 认证模块 API - 合并文件
 * 路由设计：
 *   POST /api/auth?action=register     - 用户注册
 *   POST /api/auth?action=login        - 用户登录
 *   GET  /api/auth?action=me           - 获取当前用户信息
 *   POST /api/auth?action=heartbeat    - 用户心跳（保持在线状态）
 *   POST /api/auth?action=change-password - 修改密码
 */

// 加载环境变量（必须在最前面）
require('dotenv').config();

const dbConnect = require('../lib/db');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { generateToken, extractUserFromRequest } = require('../lib/auth');
const { setCorsHeaders, handlePreflightRequest } = require('../lib/cors');
const cache = require('../lib/cache');

/**
 * 用户注册
 */
async function handleRegister(req, res) {
    const { username, password } = req.body;

    // 验证输入
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    if (username.length < 3 || username.length > 50) {
        return res.status(400).json({ error: '用户名长度应在3-50个字符之间' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: '密码长度至少6个字符' });
    }

    await dbConnect();

    // 检查用户名是否已存在
    const existing = await User.findOne({ username });
    if (existing) {
        return res.status(409).json({ error: '用户名已存在' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const user = await User.create({
        username,
        password: hashedPassword,
        role: 'user',
        balance: 0,
        isActive: true
    });

    res.status(201).json({
        message: '注册成功',
        user: {
            id: user._id,
            username: user.username,
            role: user.role
        }
    });
}

/**
 * 用户登录
 */
async function handleLogin(req, res) {
    const { username, password } = req.body;

    // 验证输入
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    await dbConnect();

    // 查找用户
    const user = await User.findOne({ username });
    if (!user) {
        return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 检查用户是否被禁用
    if (!user.isActive) {
        return res.status(403).json({ error: '账户已被禁用' });
    }

    // 获取客户端IP
    const clientIp = getClientIp(req);

    // 检查IP白名单（仅对管理员生效）
    if (user.role === 'admin' && user.ipWhitelistEnabled && user.ipWhitelist.length > 0) {
        if (!user.isIpAllowed(clientIp)) {
            console.log(`管理员 ${user.username} 尝试从非白名单IP ${clientIp} 登录`);
            return res.status(403).json({ 
                error: '您的IP不在白名单中，禁止登录',
                ip: clientIp
            });
        }
    }

    // 验证密码
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 更新最后登录信息
    user.lastLoginIp = clientIp;
    user.lastLoginAt = new Date();
    await user.save();

    // 生成Token
    const token = generateToken({
        id: user._id,
        username: user.username,
        role: user.role
    });

    res.json({
        message: '登录成功',
        token,
        user: {
            id: user._id,
            username: user.username,
            role: user.role,
            balance: user.balance,
            lastLoginIp: clientIp
        }
    });
}

/**
 * 获取客户端真实IP
 */
function getClientIp(req) {
    // 尝试从各种header中获取真实IP
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        return realIp.trim();
    }
    
    // Vercel提供的header
    const vercelIp = req.headers['x-vercel-forwarded-for'];
    if (vercelIp) {
        return vercelIp.split(',')[0].trim();
    }
    
    // 直连IP
    return req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           'unknown';
}

/**
 * 获取当前用户信息
 */
async function handleMe(req, res) {
    // 验证Token
    const userData = extractUserFromRequest(req);
    if (!userData) {
        return res.status(401).json({ error: '未授权，请先登录' });
    }

    // 尝试从缓存获取用户余额
    const cachedBalance = await cache.getUserBalance(userData.id);

    await dbConnect();

    // 查找用户
    const user = await User.findById(userData.id).select('-password');
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    // 检查用户是否被禁用
    if (!user.isActive) {
        return res.status(403).json({ error: '账户已被禁用' });
    }

    // 更新最后活动时间（用于判断在线状态）
    user.lastActiveAt = new Date();
    await user.save();

    // 如果缓存中有余额，优先使用缓存值
    const balance = cachedBalance !== null ? cachedBalance : user.balance;

    // 如果缓存中没有余额，写入缓存
    if (cachedBalance === null) {
        await cache.setUserBalance(user._id.toString(), user.balance);
    }

    // 获取客户端IP
    const clientIp = getClientIp(req);

    // 判断在线状态：最后活动时间在5分钟内
    const isOnline = user.lastActiveAt && (Date.now() - new Date(user.lastActiveAt).getTime()) < 5 * 60 * 1000;

    res.json({
        user: {
            id: user._id,
            username: user.username,
            role: user.role,
            balance: balance,
            isActive: user.isActive,
            isOnline: isOnline,
            ipWhitelist: user.ipWhitelist,
            ipWhitelistEnabled: user.ipWhitelistEnabled,
            lastLoginIp: user.lastLoginIp,
            lastLoginAt: user.lastLoginAt,
            lastActiveAt: user.lastActiveAt,
            createdAt: user.createdAt
        },
        clientIp: clientIp
    });
}

/**
 * 用户心跳（保持在线状态）
 */
async function handleHeartbeat(req, res) {
    // 验证Token
    const userData = extractUserFromRequest(req);
    if (!userData) {
        return res.status(401).json({ error: '未授权，请先登录' });
    }

    await dbConnect();

    // 更新最后活动时间
    await User.findByIdAndUpdate(userData.id, { 
        lastActiveAt: new Date() 
    });

    res.json({ 
        success: true, 
        timestamp: new Date().toISOString(),
        message: '心跳成功'
    });
}

/**
 * 修改密码
 */
async function handleChangePassword(req, res) {
    // 验证用户身份
    const userData = extractUserFromRequest(req);
    if (!userData) {
        return res.status(401).json({ error: '未授权，请先登录' });
    }

    const { oldPassword, newPassword } = req.body;

    // 验证参数
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: '请输入旧密码和新密码' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: '新密码长度至少6个字符' });
    }

    if (oldPassword === newPassword) {
        return res.status(400).json({ error: '新密码不能与旧密码相同' });
    }

    await dbConnect();

    // 查找用户
    const user = await User.findById(userData.id);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    // 验证旧密码
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
        return res.status(400).json({ error: '旧密码错误' });
    }

    // 更新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({
        success: true,
        message: '密码修改成功'
    });
}

/**
 * 主入口 - 路由分发
 */
const handler = async (req, res) => {
    // 设置CORS头
    setCorsHeaders(req, res);

    // 处理OPTIONS预检请求
    if (handlePreflightRequest(req, res)) {
        return;
    }

    const { action } = req.query;

    try {
        switch (action) {
            case 'login':
                if (req.method !== 'POST') {
                    return res.status(405).json({ error: '方法不允许' });
                }
                return await handleLogin(req, res);

            case 'me':
                if (req.method !== 'GET') {
                    return res.status(405).json({ error: '方法不允许' });
                }
                return await handleMe(req, res);

            case 'heartbeat':
                if (req.method !== 'POST' && req.method !== 'GET') {
                    return res.status(405).json({ error: '方法不允许' });
                }
                return await handleHeartbeat(req, res);

            case 'change-password':
                if (req.method !== 'POST') {
                    return res.status(405).json({ error: '方法不允许' });
                }
                return await handleChangePassword(req, res);

            default:
                return res.status(400).json({ 
                    error: '无效的action参数',
                    availableActions: ['register', 'login', 'me', 'heartbeat', 'change-password']
                });
        }
    } catch (error) {
        console.error('认证模块错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};

module.exports = { handler, handleAuth: handler };
