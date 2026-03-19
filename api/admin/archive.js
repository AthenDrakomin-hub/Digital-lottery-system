const dbConnect = require('../../lib/db');
const Draw = require('../../models/Draw');
const adminVerify = require('../admin/verify');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');

/**
 * 数据库归档清理API
 * GET /api/admin/archive - 获取数据库统计信息
 * POST /api/admin/archive - 执行归档清理（需要管理员权限）
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

        // GET: 获取数据库统计信息
        if (req.method === 'GET') {
            // 获取各集合的记录数
            const User = require('../../models/User');
            const Transaction = require('../../models/Transaction');
            
            const stats = {
                users: await User.countDocuments(),
                draws: await Draw.countDocuments(),
                transactions: await Transaction.countDocuments(),
                pendingTransactions: await Transaction.countDocuments({ status: 'pending' })
            };
            
            // 尝试获取Bet模型统计
            try {
                const Bet = require('../../models/Bet');
                stats.bets = await Bet.countDocuments();
                stats.pendingBets = await Bet.countDocuments({ status: 'pending' });
            } catch (e) {
                stats.bets = 0;
                stats.pendingBets = 0;
            }
            
            // 获取开奖记录日期范围
            const drawDateRange = await Draw.aggregate([
                { $group: { 
                    _id: null, 
                    minDate: { $min: '$date' }, 
                    maxDate: { $max: '$date' },
                    totalRecords: { $sum: 1 }
                } }
            ]);
            
            if (drawDateRange.length > 0) {
                stats.drawDateRange = {
                    min: drawDateRange[0].minDate,
                    max: drawDateRange[0].maxDate,
                    total: drawDateRange[0].totalRecords
                };
            }
            
            // 计算可清理的记录数（超过90天的）
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 90);
            const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);
            
            stats.archivableDraws = await Draw.countDocuments({ date: { $lt: cutoffDateStr } });
            
            // 尝试获取可清理的投注记录数
            try {
                const Bet = require('../../models/Bet');
                stats.archivableBets = await Bet.countDocuments({ 
                    createdAt: { $lt: cutoffDate },
                    status: { $ne: 'pending' } // 不清理待结算的投注
                });
            } catch (e) {
                stats.archivableBets = 0;
            }
            
            stats.cutoffDate = cutoffDateStr;
            stats.archiveDays = 90;
            
            return res.json(stats);
        }

        // POST: 执行归档清理
        if (req.method === 'POST') {
            // 验证管理员权限
            const admin = await adminVerify(req);
            if (!admin) {
                return res.status(401).json({ error: '需要管理员权限' });
            }
            
            // 验证密钥
            const { secret, archiveDays = 90, dryRun = false, models = ['Draw'] } = req.body;
            
            if (secret !== process.env.JWT_SECRET) {
                return res.status(403).json({ error: '密钥错误' });
            }
            
            // 计算截止日期
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - archiveDays);
            const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);
            
            const results = {};
            
            // 清理开奖记录
            if (models.includes('Draw')) {
                const count = await Draw.countDocuments({ date: { $lt: cutoffDateStr } });
                results.draws = { 
                    cutoffDate: cutoffDateStr, 
                    found: count 
                };
                
                if (!dryRun && count > 0) {
                    const deleteResult = await Draw.deleteMany({ date: { $lt: cutoffDateStr } });
                    results.draws.deleted = deleteResult.deletedCount;
                } else {
                    results.draws.deleted = 0;
                }
            }
            
            // 清理投注记录
            if (models.includes('Bet')) {
                try {
                    const Bet = require('../../models/Bet');
                    const count = await Bet.countDocuments({ 
                        createdAt: { $lt: cutoffDate },
                        status: { $ne: 'pending' }
                    });
                    results.bets = { 
                        cutoffDate: cutoffDateStr, 
                        found: count 
                    };
                    
                    if (!dryRun && count > 0) {
                        const deleteResult = await Bet.deleteMany({ 
                            createdAt: { $lt: cutoffDate },
                            status: { $ne: 'pending' }
                        });
                        results.bets.deleted = deleteResult.deletedCount;
                    } else {
                        results.bets.deleted = 0;
                    }
                } catch (e) {
                    results.bets = { error: 'Bet模型未定义' };
                }
            }
            
            return res.json({
                success: true,
                message: dryRun ? '试运行完成，未删除任何数据' : '归档清理完成',
                dryRun,
                archiveDays,
                results
            });
        }

        return res.status(405).json({ error: '方法不允许' });
    } catch (error) {
        console.error('数据库归档错误:', error);
        return res.status(500).json({ error: '服务器错误', message: error.message });
    }
};
