/**
 * 用户管理模块 API - 合并文件
 * 路由设计：
 *   GET    /api/users                    - 获取用户列表（管理员）
 *   POST   /api/users?action=create      - 创建用户（管理员）
 *   POST   /api/users?action=balance     - 调整用户余额（管理员）
 *   GET    /api/users?id=xxx             - 获取用户详情（管理员）
 *   PUT    /api/users?id=xxx             - 更新用户信息（管理员）
 *   PATCH  /api/users?id=xxx             - 更新用户状态（管理员）
 *   DELETE /api/users?id=xxx             - 删除用户（管理员）
 */

const dbConnect = require('../lib/db');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const bcrypt = require('bcryptjs');
const { extractUserFromRequest } = require('../lib/auth');
const { setCorsHeaders, handlePreflightRequest } = require('../lib/cors');
const cache = require('../lib/cache');

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
 * 获取用户列表
 */
async function handleList(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    const { page = 1, limit = 20, search, role, isActive } = req.query;

    // 构建查询条件
    let query = {};
    if (search) {
        query.username = { $regex: search, $options: 'i' };
    }
    if (role) {
        query.role = role;
    }
    if (isActive !== undefined) {
        query.isActive = isActive === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
        users,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        }
    });
}

/**
 * 创建用户
 */
async function handleCreate(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    const { username, password, role = 'user', balance = 0, isActive = true } = req.body;

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

    // 检查用户名是否已存在
    const existing = await User.findOne({ username });
    if (existing) {
        return res.status(400).json({ error: '用户名已存在' });
    }

    // 创建用户
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
        username,
        password: hashedPassword,
        role,
        balance: parseFloat(balance),
        isActive
    });

    res.status(201).json({
        message: '用户创建成功',
        user: {
            id: user._id,
            username: user.username,
            role: user.role,
            balance: user.balance,
            isActive: user.isActive,
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

    // 验证参数
    if (!userId) {
        return res.status(400).json({ error: '缺少用户ID' });
    }

    if (!amount || isNaN(amount) || parseFloat(amount) === 0) {
        return res.status(400).json({ error: '金额必须为非零数字' });
    }

    const amountNum = parseFloat(amount);

    // 查找用户
    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    // 计算新余额
    const newBalance = user.balance + amountNum;
    if (newBalance < 0) {
        return res.status(400).json({ error: '余额不足，无法扣款' });
    }

    // 更新用户余额
    user.balance = newBalance;
    await user.save();

    // 更新用户余额缓存
    await cache.setUserBalance(user._id.toString(), newBalance);

    // 创建交易记录
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
 * 获取用户详情
 */
async function handleGetUser(req, res) {
    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: '缺少用户ID' });
    }

    const user = await User.findById(id).select('-password');
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }
    res.json({ user });
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

    const { username, role, isActive } = req.body;

    const user = await User.findById(id);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    // 更新字段
    if (username && username !== user.username) {
        const existing = await User.findOne({ username, _id: { $ne: id } });
        if (existing) {
            return res.status(400).json({ error: '用户名已存在' });
        }
        user.username = username;
    }

    if (role && ['user', 'admin'].includes(role)) {
        user.role = role;
    }

    if (isActive !== undefined) {
        user.isActive = isActive;
    }

    await user.save();

    res.json({
        message: '用户信息已更新',
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

    // 不能禁用自己
    if (user._id.toString() === admin._id.toString() && isActive === false) {
        return res.status(400).json({ error: '不能禁用自己的账户' });
    }

    // 更新状态
    if (isActive !== undefined) {
        user.isActive = isActive;
    }
    if (role !== undefined && ['user', 'admin'].includes(role)) {
        user.role = role;
    }
    if (balance !== undefined && !isNaN(parseFloat(balance))) {
        user.balance = parseFloat(balance);
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

    // 不能删除自己
    if (user._id.toString() === admin._id.toString()) {
        return res.status(400).json({ error: '不能删除自己的账户' });
    }

    // 软删除：设置为禁用状态
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
module.exports = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    const { action, id } = req.query;

    try {
        await dbConnect();

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

            default:
                if (req.method === 'GET') {
                    return await handleList(req, res);
                }
                return res.status(400).json({ 
                    error: '无效的action参数',
                    availableActions: ['create', 'balance']
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
