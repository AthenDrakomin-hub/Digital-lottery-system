/**
 * 交易管理模块 API - 合并文件
 * 路由设计：
 *   GET    /api/transactions                    - 获取交易列表
 *   POST   /api/transactions?action=request     - 提交充值/提现申请
 *   PATCH  /api/transactions                    - 批量审核交易（管理员）
 *   GET    /api/transactions?id=xxx             - 获取交易详情
 *   DELETE /api/transactions?id=xxx             - 取消交易
 *   POST   /api/transactions?id=xxx&action=approve - 批准交易（管理员）
 *   POST   /api/transactions?id=xxx&action=reject  - 拒绝交易（管理员）
 */

// 加载环境变量（必须在最前面）
require('dotenv').config();

const dbConnect = require('../lib/db');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { extractUserFromRequest } = require('../lib/auth');
const { setCorsHeaders, handlePreflightRequest } = require('../lib/cors');
const cache = require('../lib/cache');
const { createLogger } = require('../lib/logger');

const logger = createLogger('transactions');

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
 * 获取交易列表
 */
async function handleList(req, res) {
    const userData = extractUserFromRequest(req);
    if (!userData) {
        return res.status(401).json({ error: '未授权，请先登录' });
    }

    const { page = 1, limit = 20, type, status, userId } = req.query;

    // 构建查询条件
    let query = {};
    
    // 如果不是管理员，只能查看自己的交易记录
    const currentUser = await User.findById(userData.id);
    if (currentUser.role !== 'admin') {
        query.userId = userData.id;
    } else {
        // 管理员可以查看指定用户的交易记录
        if (userId) {
            query.userId = userId;
        }
    }

    if (type) query.type = type;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const transactions = await Transaction.find(query)
        .populate('userId', 'username')
        .populate('processedBy', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);

    res.json({
        transactions,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        }
    });
}

/**
 * 提交交易申请
 */
async function handleRequest(req, res) {
    const userData = extractUserFromRequest(req);
    if (!userData) {
        return res.status(401).json({ error: '未授权，请先登录' });
    }

    const { type, amount, note } = req.body;

    // 验证参数
    if (!type || !['deposit', 'withdraw'].includes(type)) {
        return res.status(400).json({ error: '交易类型必须是deposit或withdraw' });
    }

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: '金额必须为正数' });
    }

    const amountNum = parseFloat(amount);

    // 查找用户
    const user = await User.findById(userData.id);
    if (!user || !user.isActive) {
        return res.status(404).json({ error: '用户不存在或已被禁用' });
    }

    // 如果是提现，检查余额
    if (type === 'withdraw' && user.balance < amountNum) {
        return res.status(400).json({ error: '余额不足' });
    }

    // 创建交易记录
    const transaction = await Transaction.create({
        userId: user._id,
        type,
        amount: amountNum,
        status: 'pending',
        note: note || (type === 'deposit' ? '充值申请' : '提现申请')
    });

    res.status(201).json({
        message: type === 'deposit' ? '充值申请已提交，等待审核' : '提现申请已提交，等待审核',
        transaction: {
            id: transaction._id,
            type: transaction.type,
            amount: transaction.amount,
            status: transaction.status,
            createdAt: transaction.createdAt
        }
    });
}

/**
 * 批量审核交易
 */
async function handleBatchAudit(req, res) {
    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    const { transactionId, status, note } = req.body;

    // 验证参数
    if (!transactionId) {
        return res.status(400).json({ error: '缺少交易ID' });
    }

    if (!status || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: '状态必须是approved或rejected' });
    }

    // 查找交易记录
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
        return res.status(404).json({ error: '交易记录不存在' });
    }

    // 检查交易状态
    if (transaction.status !== 'pending') {
        return res.status(400).json({ error: '该交易已被处理' });
    }

    // 查找用户
    const user = await User.findById(transaction.userId);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    // 如果批准，更新用户余额
    if (status === 'approved') {
        if (transaction.type === 'deposit') {
            user.balance += transaction.amount;
        } else if (transaction.type === 'withdraw') {
            if (user.balance < transaction.amount) {
                return res.status(400).json({ error: '用户余额不足，无法批准提现' });
            }
            user.balance -= transaction.amount;
        }
        await user.save();
        // 更新用户余额缓存
        await cache.setUserBalance(user._id.toString(), user.balance);
    }

    // 更新交易状态
    transaction.status = status;
    transaction.processedAt = new Date();
    transaction.processedBy = admin._id;
    if (note) {
        transaction.note = transaction.note + ' | 审核备注: ' + note;
    }
    await transaction.save();

    res.json({
        message: status === 'approved' ? '交易已批准' : '交易已拒绝',
        transaction: {
            id: transaction._id,
            type: transaction.type,
            amount: transaction.amount,
            status: transaction.status,
            processedAt: transaction.processedAt
        },
        user: {
            id: user._id,
            username: user.username,
            balance: user.balance
        }
    });
}

/**
 * 获取交易详情
 */
async function handleGetTransaction(req, res) {
    const { id } = req.query;
    
    const userData = extractUserFromRequest(req);
    if (!userData) {
        return res.status(401).json({ error: '未授权，请先登录' });
    }

    const transaction = await Transaction.findById(id)
        .populate('userId', 'username')
        .populate('processedBy', 'username');

    if (!transaction) {
        return res.status(404).json({ error: '交易记录不存在' });
    }

    // 非管理员只能查看自己的交易
    const currentUser = await User.findById(userData.id);
    if (currentUser.role !== 'admin' && transaction.userId._id.toString() !== userData.id) {
        return res.status(403).json({ error: '无权查看此交易记录' });
    }

    res.json({ transaction });
}

/**
 * 取消交易
 */
async function handleCancel(req, res) {
    const { id } = req.query;
    
    const userData = extractUserFromRequest(req);
    if (!userData) {
        return res.status(401).json({ error: '未授权，请先登录' });
    }

    const transaction = await Transaction.findById(id);
    if (!transaction) {
        return res.status(404).json({ error: '交易记录不存在' });
    }

    // 只能取消待审核的交易
    if (transaction.status !== 'pending') {
        return res.status(400).json({ error: '只能取消待审核的交易' });
    }

    // 非管理员只能取消自己的交易
    const currentUser = await User.findById(userData.id);
    if (currentUser.role !== 'admin' && transaction.userId.toString() !== userData.id) {
        return res.status(403).json({ error: '无权取消此交易' });
    }

    // 取消交易
    transaction.status = 'cancelled';
    transaction.cancelledAt = new Date();
    transaction.cancelledBy = userData.id;
    await transaction.save();

    res.json({
        message: '交易已取消',
        transaction: {
            id: transaction._id,
            type: transaction.type,
            amount: transaction.amount,
            status: transaction.status
        }
    });
}

/**
 * 批准交易
 */
async function handleApprove(req, res) {
    const { id } = req.query;
    const { note, payoutInfo } = req.body;

    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    const transaction = await Transaction.findById(id);
    if (!transaction) {
        return res.status(404).json({ error: '交易记录不存在' });
    }

    if (transaction.status !== 'pending') {
        return res.status(400).json({ error: `该交易已被${transaction.status === 'approved' ? '批准' : '处理'}` });
    }

    const user = await User.findById(transaction.userId);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    // 处理充值：直接入账
    if (transaction.type === 'deposit') {
        user.balance += transaction.amount;
        transaction.status = 'completed';
        transaction.completedAt = new Date();
    }
    // 处理提现：扣除余额，等待打款
    else if (transaction.type === 'withdraw') {
        if (user.balance < transaction.amount) {
            return res.status(400).json({ error: '用户余额不足' });
        }
        user.balance -= transaction.amount;
        transaction.status = 'approved'; // 已批准，等待打款
        
        if (payoutInfo) {
            transaction.payoutInfo = payoutInfo;
        }
    }

    await user.save();
    
    // 更新交易记录
    transaction.processedAt = new Date();
    transaction.processedBy = admin._id;
    if (note) {
        transaction.note = (transaction.note || '') + ` | 审核备注: ${note}`;
    }
    await transaction.save();

    // 更新用户余额缓存
    await cache.setUserBalance(user._id.toString(), user.balance);

    logger.info('交易已批准', {
        transactionId: id,
        type: transaction.type,
        amount: transaction.amount,
        userId: user._id,
        operator: admin.username
    });

    res.json({
        success: true,
        message: transaction.type === 'deposit' ? '充值已入账' : '提现已批准，等待打款',
        transaction: {
            id: transaction._id,
            type: transaction.type,
            amount: transaction.amount,
            status: transaction.status,
            processedAt: transaction.processedAt
        },
        user: {
            id: user._id,
            username: user.username,
            balance: user.balance
        }
    });
}

/**
 * 拒绝交易
 */
async function handleReject(req, res) {
    const { id } = req.query;
    const { reason } = req.body;

    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: '需要管理员权限' });
    }

    if (!reason) {
        return res.status(400).json({ error: '请提供拒绝原因' });
    }

    const transaction = await Transaction.findById(id);
    if (!transaction) {
        return res.status(404).json({ error: '交易记录不存在' });
    }

    if (transaction.status !== 'pending') {
        return res.status(400).json({ error: '该交易已被处理' });
    }

    // 更新交易状态
    transaction.status = 'rejected';
    transaction.processedAt = new Date();
    transaction.processedBy = admin._id;
    transaction.note = (transaction.note || '') + ` | 拒绝原因: ${reason}`;
    await transaction.save();

    logger.warn('交易已拒绝', {
        transactionId: id,
        type: transaction.type,
        amount: transaction.amount,
        userId: transaction.userId,
        reason,
        operator: admin.username
    });

    res.json({
        success: true,
        message: '交易已拒绝',
        transaction: {
            id: transaction._id,
            type: transaction.type,
            amount: transaction.amount,
            status: transaction.status,
            reason
        }
    });
}

/**
 * 主入口 - 路由分发
 */
const handleTransactions = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    const { action, id } = req.query;

    try {
        await dbConnect();

        // 有 id 参数时的操作
        if (id) {
            const actionType = action;
            
            if (actionType === 'approve' && req.method === 'POST') {
                return await handleApprove(req, res);
            } else if (actionType === 'reject' && req.method === 'POST') {
                return await handleReject(req, res);
            } else {
                switch (req.method) {
                    case 'GET':
                        return await handleGetTransaction(req, res);
                    case 'DELETE':
                        return await handleCancel(req, res);
                    default:
                        return res.status(405).json({ error: '方法不允许' });
                }
            }
        }

        // 无 id 参数时的操作
        switch (action) {
            case 'request':
                if (req.method !== 'POST') {
                    return res.status(405).json({ error: '方法不允许' });
                }
                return await handleRequest(req, res);

            default:
                if (req.method === 'GET') {
                    return await handleList(req, res);
                } else if (req.method === 'PATCH') {
                    return await handleBatchAudit(req, res);
                }
                return res.status(400).json({ 
                    error: '无效的action参数',
                    availableActions: ['request', 'approve', 'reject']
                });
        }
    } catch (error) {
        console.error('交易管理模块错误:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: '无效的交易ID' });
        }
        res.status(500).json({ error: '服务器错误' });
    }
};

module.exports = { handleTransactions, handler: handleTransactions };
