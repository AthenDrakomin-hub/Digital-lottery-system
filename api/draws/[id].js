/**
 * 开奖更新接口
 * PUT /api/draws/:id
 * 管理员修改已预设的开奖结果
 */

const dbConnect = require('../../lib/db');
const Draw = require('../../models/Draw');
const adminVerify = require('../admin/verify');
const { setCorsHeaders, handlePreflightRequest } = require('../../lib/cors');
const cache = require('../../lib/cache');
const { createLogger } = require('../../lib/logger');

const logger = createLogger('draws');

module.exports = async (req, res) => {
    setCorsHeaders(req, res);
    if (handlePreflightRequest(req, res)) return;

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: '缺少开奖记录ID' });
    }

    // GET: 获取开奖详情
    if (req.method === 'GET') {
        try {
            await dbConnect();

            const draw = await Draw.findById(id);
            if (!draw) {
                return res.status(404).json({ error: '开奖记录不存在' });
            }

            res.json({ draw });
        } catch (error) {
            console.error('获取开奖详情错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    }
    // PUT: 更新开奖结果
    else if (req.method === 'PUT') {
        try {
            // 验证管理员权限
            const admin = await adminVerify(req);
            if (!admin) {
                return res.status(401).json({ error: '需要管理员权限' });
            }

            const { result, status } = req.body;

            // 至少需要提供一个更新字段
            if (!result && !status) {
                return res.status(400).json({ error: '请提供要更新的字段（result或status）' });
            }

            // 验证开奖结果格式
            if (result && !/^\d{10}$/.test(result)) {
                return res.status(400).json({ error: '开奖结果必须为10位数字' });
            }

            // 验证状态
            if (status && !['pending', 'drawn', 'settled'].includes(status)) {
                return res.status(400).json({ error: '无效的状态值' });
            }

            await dbConnect();

            const draw = await Draw.findById(id);
            if (!draw) {
                return res.status(404).json({ error: '开奖记录不存在' });
            }

            const oldResult = draw.result;
            const oldStatus = draw.status;

            // 更新字段
            if (result) draw.result = result;
            if (status) draw.status = status;
            draw.updatedAt = new Date();

            await draw.save();

            // 清除缓存
            await cache.deleteDailyDraws(draw.date, draw.interval);

            // 记录操作日志
            logger.info('开奖结果已更新', {
                drawId: id,
                date: draw.date,
                interval: draw.interval,
                period: draw.period + 1,
                oldResult,
                newResult: result || oldResult,
                oldStatus,
                newStatus: status || oldStatus,
                operator: admin.username,
                operatorId: admin._id
            });

            res.json({
                message: '开奖记录已更新',
                draw: {
                    id: draw._id,
                    date: draw.date,
                    interval: draw.interval,
                    period: draw.period + 1,
                    result: draw.result,
                    status: draw.status,
                    updatedAt: draw.updatedAt
                }
            });
        } catch (error) {
            console.error('更新开奖记录错误:', error);
            if (error.name === 'CastError') {
                return res.status(400).json({ error: '无效的开奖记录ID' });
            }
            res.status(500).json({ error: '服务器错误' });
        }
    }
    // DELETE: 删除开奖记录（仅限未结算的）
    else if (req.method === 'DELETE') {
        try {
            // 验证管理员权限
            const admin = await adminVerify(req);
            if (!admin) {
                return res.status(401).json({ error: '需要管理员权限' });
            }

            await dbConnect();

            const draw = await Draw.findById(id);
            if (!draw) {
                return res.status(404).json({ error: '开奖记录不存在' });
            }

            // 已结算的不能删除
            if (draw.status === 'settled') {
                return res.status(400).json({ error: '已结算的开奖记录不能删除' });
            }

            await Draw.findByIdAndDelete(id);

            // 清除缓存
            await cache.deleteDailyDraws(draw.date, draw.interval);

            // 记录操作日志
            logger.warn('开奖记录已删除', {
                drawId: id,
                date: draw.date,
                interval: draw.interval,
                period: draw.period + 1,
                result: draw.result,
                operator: admin.username,
                operatorId: admin._id
            });

            res.json({ message: '开奖记录已删除' });
        } catch (error) {
            console.error('删除开奖记录错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    } else {
        res.status(405).json({ error: '方法不允许' });
    }
};
