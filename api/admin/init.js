const dbConnect = require('../../lib/db');
const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');

// 预设管理员账户
const ADMIN_ACCOUNTS = [
    { username: 'admin001', password: 'admin123' },
    { username: 'admin002', password: 'admin123' },
    { username: 'admin003', password: 'admin123' }
];

/**
 * 初始化管理员账户API
 * GET /api/admin/init - 检查初始化状态
 * POST /api/admin/init - 执行初始化（需要secret）
 */
module.exports = async (req, res) => {
    // 设置CORS头
    setCorsHeaders(req, res);

    // 处理OPTIONS预检请求
    if (handlePreflightRequest(req, res)) {
        return;
    }

    try {
        await dbConnect();

        // GET: 检查初始化状态
        if (req.method === 'GET') {
            const adminCount = await User.countDocuments({ role: 'admin' });
            
            return res.json({
                initialized: adminCount >= ADMIN_ACCOUNTS.length,
                adminCount,
                requiredCount: ADMIN_ACCOUNTS.length,
                accounts: ADMIN_ACCOUNTS.map(a => a.username)
            });
        }

        // POST: 执行初始化
        if (req.method === 'POST') {
            // 验证初始化密钥（使用JWT_SECRET作为验证）
            const { secret } = req.body;
            
            if (secret !== process.env.JWT_SECRET) {
                return res.status(403).json({ 
                    error: '初始化密钥错误',
                    hint: '请使用JWT_SECRET作为初始化密钥'
                });
            }

            const results = [];

            for (const account of ADMIN_ACCOUNTS) {
                try {
                    // 检查用户是否已存在
                    const existing = await User.findOne({ username: account.username });

                    if (existing) {
                        // 如果存在但不是管理员，更新为管理员
                        if (existing.role !== 'admin') {
                            existing.role = 'admin';
                            await existing.save();
                            results.push({ 
                                username: account.username, 
                                status: 'updated',
                                message: '已升级为管理员'
                            });
                        } else {
                            results.push({ 
                                username: account.username, 
                                status: 'exists',
                                message: '管理员已存在'
                            });
                        }
                    } else {
                        // 创建新管理员
                        const hashedPassword = await bcrypt.hash(account.password, 10);
                        await User.create({
                            username: account.username,
                            password: hashedPassword,
                            role: 'admin',
                            balance: 0,
                            isActive: true
                        });
                        results.push({ 
                            username: account.username, 
                            status: 'created',
                            message: '创建成功'
                        });
                    }
                } catch (error) {
                    results.push({ 
                        username: account.username, 
                        status: 'error',
                        message: error.message
                    });
                }
            }

            return res.json({
                success: true,
                message: '管理员账户初始化完成',
                results,
                accounts: ADMIN_ACCOUNTS.map(a => ({
                    username: a.username,
                    password: a.password,
                    note: '请在首次登录后立即修改密码'
                }))
            });
        }

        return res.status(405).json({ error: '方法不允许' });
    } catch (error) {
        console.error('初始化管理员错误:', error);
        return res.status(500).json({ error: '服务器错误' });
    }
};
