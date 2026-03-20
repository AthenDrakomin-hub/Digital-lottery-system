/**
 * 用户管理模块 API - 合并文件
 * 路由设计：
 *   GET    /api/users                    - 获取用户列表（管理员）
 *   POST   /api/users?action=create      - 创建用户（管理员）
 *   POST   /api/users?action=balance     - 调整用户余额（管理员）
 *   POST   /api/users?action=bankcard    - 添加银行卡（管理员/用户自己）
 *   DELETE /api/users?action=bankcard&id=xxx - 删除银行卡
 *   GET    /api/users?id=xxx             - 获取用户详情（管理员）
 *   PUT    /api/users?id=xxx             - 更新用户信息（管理员）
 *   PATCH  /api/users?id=xxx             - 更新用户状态（管理员）
 *   DELETE /api/users?id=xxx             - 删除用户（管理员）
 * 
 * 密码存储：使用bcrypt加密，非明文存储
 * 敏感信息：手机号、身份证、银行卡号等返回时自动脱敏
 */

// 加载环境变量（必须在最前面）
require('dotenv').config();

const dbConnect = require('../lib/db');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const bcrypt = require('bcryptjs');
const { extractUserFromRequest } = require('../lib/auth');
const { setCorsHeaders, handlePreflightRequest } = require('../lib/cors');
const cache = require('../lib/cache');
const { maskUserInfo, maskPhone, maskIdCard, maskBankCard } = require('../lib/mask');

/**
 * 验证管理员权限
 */
async function verifyAdmin(req) {
    const userData = extractUserFromRequest(req);
    if (!userData) return null;
    
    await dbConnect();
    const user = await User.findById(userData.id);
    return user && user.role === 'admin' && user.isActive ? user : null;
}

/**
 * 获取用户列表（管理员）
 * 返回脱敏后的用户信息
 */
async function handleList(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    const { page = 1, limit = 20, search, role, isActive, online } = req.query;

    // 构建查询条件
    let query = {};
    if (search) {
        query.$or = [
            { username: { $regex: search, $options: 'i' } },
            { realName: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } }
        ];
    }
    if (role) {
        query.role = role;
    }
    if (isActive !== undefined) {
        query.isActive = isActive === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(query)
        .select('-password -idCard') // 不返回密码和完整身份证
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    // 计算在线状态并脱敏
    const now = Date.now();
    const onlineThreshold = 5 * 60 * 1000; // 5分钟
    
    const usersWithOnline = users.map(user => {
        const userObj = user.toObject();
        // 在线判定：最后活动时间在5分钟内
        userObj.isOnline = user.lastActiveAt && (now - new Date(user.lastActiveAt).getTime()) < onlineThreshold;
        // 脱敏处理
        return maskUserInfo(userObj, { maskName: false });
    });

    // 如果有在线过滤参数
    let filteredUsers = usersWithOnline;
    if (online !== undefined) {
        const isOnlineFilter = online === 'true';
        filteredUsers = usersWithOnline.filter(u => u.isOnline === isOnlineFilter);
    }

    // 统计在线用户数
    const onlineCount = usersWithOnline.filter(u => u.isOnline).length;

    res.json({
        users: filteredUsers,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        },
        stats: {
            onlineCount,
            offlineCount: usersWithOnline.length - onlineCount
        }
    });
}

/**
 * 创建用户（管理员）
 * 密码使用bcrypt加密存储
 */
async function handleCreate(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    const { 
        username, password, role = 'user', balance = 0, isActive = true,
        realName, phone, idCard, email
    } = req.body;

    // 参数验证
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    if (username.length < 3 || username.length > 50) {
        return res.status(400).json({ error: '用户名长度应在3-50个字符之间' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: '密码长度至少6个字符' });
    }

    if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ error: '角色只能是user或admin' });
    }

    if (balance < 0) {
        return res.status(400).json({ error: '初始余额不能为负数' });
    }

    // 手机号格式验证
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
        return res.status(400).json({ error: '手机号格式不正确' });
    }

    // 身份证格式验证
    if (idCard && !/^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(idCard)) {
        return res.status(400).json({ error: '身份证号格式不正确' });
    }

    // 检查用户名是否已存在
    const existing = await User.findOne({ username });
    if (existing) {
        return res.status(400).json({ error: '用户名已存在' });
    }

    // 检查手机号是否已被使用
    if (phone) {
        const existingPhone = await User.findOne({ phone });
        if (existingPhone) {
            return res.status(400).json({ error: '该手机号已被注册' });
        }
    }

    // 检查身份证是否已被使用
    if (idCard) {
        const existingIdCard = await User.findOne({ idCard });
        if (existingIdCard) {
            return res.status(400).json({ error: '该身份证号已被注册' });
        }
    }

    // 创建用户 - 密码使用bcrypt加密
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
        username,
        password: hashedPassword, // bcrypt加密存储
        role,
        balance: parseFloat(balance),
        isActive,
        realName,
        phone,
        idCard,
        email
    });

    res.status(201).json({
        message: '用户创建成功',
        user: {
            id: user._id,
            username: user.username,
            role: user.role,
            balance: user.balance,
            isActive: user.isActive,
            realName: user.realName,
            phone: phone ? maskPhone(phone) : null, // 返回脱敏手机号
            createdAt: user.createdAt
        }
    });
}

/**
 * 调整用户余额
 */
async function handleBalance(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    const { userId, amount, note } = req.body;

    if (!userId) {
        return res.status(400).json({ error: '缺少用户ID' });
    }

    if (!amount || isNaN(amount) || parseFloat(amount) === 0) {
        return res.status(400).json({ error: '金额必须为非零数字' });
    }

    const amountNum = parseFloat(amount);

    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    const newBalance = user.balance + amountNum;
    if (newBalance < 0) {
        return res.status(400).json({ error: '余额不足，无法扣款' });
    }

    user.balance = newBalance;
    await user.save();
    await cache.setUserBalance(user._id.toString(), newBalance);

    const transaction = await Transaction.create({
        userId: user._id,
        type: 'adjust',
        amount: Math.abs(amountNum),
        status: 'approved',
        note: note || (amountNum > 0 ? '管理员充值' : '管理员扣款'),
        processedAt: new Date(),
        processedBy: admin._id
    });

    res.json({
        message: '余额调整成功',
        user: {
            id: user._id,
            username: user.username,
            balance: user.balance
        },
        transaction: {
            id: transaction._id,
            amount: amountNum,
            note: transaction.note
        }
    });
}

/**
 * 添加银行卡
 */
async function handleAddBankCard(req, res) {
    const admin = await verifyAdmin(req);
    const userData = extractUserFromRequest(req);
    
    if (!admin && !userData) {
        return res.status(401).json({ error: '未授权' });
    }

    const { userId, bankName, cardNumber, cardHolder, bankBranch, isDefault } = req.body;

    // 确定目标用户ID
    let targetUserId = userId;
    if (!admin && userData) {
        targetUserId = userData.id; // 普通用户只能给自己添加
    }

    if (!targetUserId || !bankName || !cardNumber || !cardHolder) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    // 银行卡号格式验证
    if (!/^\d{16,19}$/.test(cardNumber)) {
        return res.status(400).json({ error: '银行卡号格式不正确' });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    // 检查银行卡是否已存在
    const existingCard = user.bankCards.find(c => c.cardNumber === cardNumber);
    if (existingCard) {
        return res.status(400).json({ error: '该银行卡已添加' });
    }

    // 如果设为默认，取消其他卡的默认
    if (isDefault) {
        user.bankCards.forEach(card => card.isDefault = false);
    }

    // 添加银行卡
    user.bankCards.push({
        bankName,
        cardNumber,
        cardHolder,
        bankBranch,
        isDefault: isDefault || user.bankCards.length === 0 // 第一张卡默认为默认卡
    });

    await user.save();

    res.json({
        message: '银行卡添加成功',
        bankCards: user.bankCards.map(card => ({
            id: card._id,
            bankName: card.bankName,
            cardNumber: maskBankCard(card.cardNumber),
            cardHolder: card.cardHolder,
            bankBranch: card.bankBranch,
            isDefault: card.isDefault
        }))
    });
}

/**
 * 删除银行卡
 */
async function handleDeleteBankCard(req, res) {
    const admin = await verifyAdmin(req);
    const userData = extractUserFromRequest(req);
    
    if (!admin && !userData) {
        return res.status(401).json({ error: '未授权' });
    }

    const { id } = req.query; // 银行卡ID
    const { userId } = req.body;

    let targetUserId = userId;
    if (!admin && userData) {
        targetUserId = userData.id;
    }

    const user = await User.findById(targetUserId);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    // 找到并删除银行卡
    const cardIndex = user.bankCards.findIndex(c => c._id.toString() === id);
    if (cardIndex === -1) {
        return res.status(404).json({ error: '银行卡不存在' });
    }

    const wasDefault = user.bankCards[cardIndex].isDefault;
    user.bankCards.splice(cardIndex, 1);

    // 如果删除的是默认卡，设置第一张为默认
    if (wasDefault && user.bankCards.length > 0) {
        user.bankCards[0].isDefault = true;
    }

    await user.save();

    res.json({
        message: '银行卡删除成功',
        bankCards: user.bankCards.map(card => ({
            id: card._id,
            bankName: card.bankName,
            cardNumber: maskBankCard(card.cardNumber),
            cardHolder: card.cardHolder,
            bankBranch: card.bankBranch,
            isDefault: card.isDefault
        }))
    });
}

/**
 * 获取用户详情
 */
async function handleGetUser(req, res) {
    const { id, full } = req.query;
    if (!id) {
        return res.status(400).json({ error: '缺少用户ID' });
    }

    const admin = await verifyAdmin(req);
    
    const user = await User.findById(id).select('-password');
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    const userObj = user.toObject();
    
    // 计算在线状态
    const now = Date.now();
    const onlineThreshold = 5 * 60 * 1000;
    userObj.isOnline = user.lastActiveAt && (now - new Date(user.lastActiveAt).getTime()) < onlineThreshold;

    // 管理员可以查看完整信息（full=1时），否则脱敏
    if (admin && full === '1') {
        // 管理员查看完整信息，但身份证仍需脱敏
        userObj.idCard = user.idCard ? maskIdCard(user.idCard) : null;
        userObj.phone = user.phone; // 管理员可看完整手机号
        userObj.bankCards = user.bankCards.map(card => ({
            ...card.toObject(),
            cardNumber: card.cardNumber // 管理员可看完整卡号
        }));
    } else {
        // 脱敏处理
        const masked = maskUserInfo(userObj, { maskName: false });
        return res.json({ user: masked });
    }

    res.json({ user: userObj });
}

/**
 * 更新用户信息
 */
async function handleUpdate(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: '缺少用户ID' });
    }

    const { 
        username, role, isActive, balance, password, 
        ipWhitelist, ipWhitelistEnabled,
        realName, phone, idCard, email
    } = req.body;

    const user = await User.findById(id);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    // 更新用户名
    if (username && username !== user.username) {
        const existing = await User.findOne({ username, _id: { $ne: id } });
        if (existing) {
            return res.status(400).json({ error: '用户名已存在' });
        }
        user.username = username;
    }

    // 更新角色
    if (role && ['user', 'admin'].includes(role)) {
        user.role = role;
    }

    // 更新状态
    if (isActive !== undefined) {
        user.isActive = isActive;
    }

    // 更新余额
    if (balance !== undefined && !isNaN(parseFloat(balance))) {
        user.balance = parseFloat(balance);
        await cache.setUserBalance(user._id.toString(), user.balance);
    }

    // 更新密码（bcrypt加密）
    if (password && password.length >= 6) {
        user.password = await bcrypt.hash(password, 10);
    }

    // 更新基本信息
    if (realName !== undefined) user.realName = realName;
    if (email !== undefined) user.email = email;
    
    // 更新手机号（检查唯一性）
    if (phone !== undefined) {
        if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
            return res.status(400).json({ error: '手机号格式不正确' });
        }
        if (phone) {
            const existingPhone = await User.findOne({ phone, _id: { $ne: id } });
            if (existingPhone) {
                return res.status(400).json({ error: '该手机号已被使用' });
            }
        }
        user.phone = phone || null;
    }

    // 更新身份证（检查唯一性）
    if (idCard !== undefined) {
        if (idCard && !/^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(idCard)) {
            return res.status(400).json({ error: '身份证号格式不正确' });
        }
        if (idCard) {
            const existingIdCard = await User.findOne({ idCard, _id: { $ne: id } });
            if (existingIdCard) {
                return res.status(400).json({ error: '该身份证号已被使用' });
            }
        }
        user.idCard = idCard || null;
    }

    // 更新IP白名单（仅管理员）
    if (user.role === 'admin') {
        if (ipWhitelistEnabled !== undefined) {
            user.ipWhitelistEnabled = ipWhitelistEnabled;
        }
        
        if (ipWhitelist !== undefined && Array.isArray(ipWhitelist)) {
            const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
            for (const ip of ipWhitelist) {
                if (!ipRegex.test(ip)) {
                    return res.status(400).json({ 
                        error: `IP地址格式无效: ${ip}`,
                        hint: '支持格式：192.168.1.1 或 192.168.1.0/24'
                    });
                }
            }
            user.ipWhitelist = ipWhitelist;
        }
    }

    await user.save();

    res.json({
        message: '用户信息已更新',
        user: {
            id: user._id,
            username: user.username,
            role: user.role,
            balance: user.balance,
            isActive: user.isActive,
            realName: user.realName,
            phone: user.phone ? maskPhone(user.phone) : null,
            email: user.email,
            ipWhitelist: user.ipWhitelist,
            ipWhitelistEnabled: user.ipWhitelistEnabled
        }
    });
}

/**
 * 更新用户状态
 */
async function handlePatch(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: '缺少用户ID' });
    }

    const { isActive, role, balance } = req.body;

    const user = await User.findById(id);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    if (user._id.toString() === admin._id.toString() && isActive === false) {
        return res.status(400).json({ error: '不能禁用自己的账户' });
    }

    if (isActive !== undefined) user.isActive = isActive;
    if (role !== undefined && ['user', 'admin'].includes(role)) user.role = role;
    if (balance !== undefined && !isNaN(parseFloat(balance))) {
        user.balance = parseFloat(balance);
        await cache.setUserBalance(user._id.toString(), user.balance);
    }

    await user.save();

    res.json({
        message: '用户状态已更新',
        user: {
            id: user._id,
            username: user.username,
            role: user.role,
            balance: user.balance,
            isActive: user.isActive
        }
    });
}

/**
 * 重置所有用户余额缓存
 */
async function handleResetBalanceCache(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    const users = await User.find({}, '_id balance');
    let count = 0;
    
    for (const user of users) {
        await cache.setUserBalance(user._id.toString(), user.balance);
        count++;
    }

    res.json({
        success: true,
        message: `已重置 ${count} 个用户的余额缓存`,
        count
    });
}

/**
 * 删除用户
 */
async function handleDelete(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: '缺少用户ID' });
    }

    const user = await User.findById(id);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    if (user._id.toString() === admin._id.toString()) {
        return res.status(400).json({ error: '不能删除自己的账户' });
    }

    user.isActive = false;
    user.deletedAt = new Date();
    await user.save();

    res.json({
        message: '用户已删除',
        user: {
            id: user._id,
            username: user.username
        }
    });
}

/**
 * 主入口 - 路由分发
 */
const handleUsers = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    const { action, id } = req.query;

    try {
        await dbConnect();

        // 银行卡操作
        if (action === 'bankcard') {
            if (req.method === 'POST') {
                return await handleAddBankCard(req, res);
            }
            if (req.method === 'DELETE') {
                return await handleDeleteBankCard(req, res);
            }
            return res.status(405).json({ error: '方法不允许' });
        }

        // 有 id 参数时的操作
        if (id) {
            switch (req.method) {
                case 'GET':
                    return await handleGetUser(req, res);
                case 'PUT':
                    return await handleUpdate(req, res);
                case 'PATCH':
                    return await handlePatch(req, res);
                case 'DELETE':
                    return await handleDelete(req, res);
                default:
                    return res.status(405).json({ error: '方法不允许' });
            }
        }

        // 无 id 参数时的操作
        switch (action) {
            case 'create':
                if (req.method !== 'POST') {
                    return res.status(405).json({ error: '方法不允许' });
                }
                return await handleCreate(req, res);

            case 'balance':
                if (req.method !== 'POST') {
                    return res.status(405).json({ error: '方法不允许' });
                }
                return await handleBalance(req, res);

            case 'reset-balance-cache':
                if (req.method !== 'POST') {
                    return res.status(405).json({ error: '方法不允许' });
                }
                return await handleResetBalanceCache(req, res);

            default:
                if (req.method === 'GET') {
                    return await handleList(req, res);
                }
                return res.status(400).json({ 
                    error: '无效的action参数',
                    availableActions: ['create', 'balance', 'bankcard', 'reset-balance-cache']
                });
        }
    } catch (error) {
        console.error('用户管理模块错误:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: '无效的用户ID' });
        }
        res.status(500).json({ error: '服务器错误' });
    }
};

module.exports = { handleUsers, handler: handleUsers };
