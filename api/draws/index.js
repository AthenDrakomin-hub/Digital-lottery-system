const dbConnect = require('../../lib/db');
const Draw = require('../../models/Draw');
const adminVerify = require('../admin/verify');

module.exports = async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // 处理OPTIONS预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET: 获取所有开奖预设（带分页）
    if (req.method === 'GET') {
        try {
            const { date, interval, page = 1, limit = 50 } = req.query;

            await dbConnect();

            let query = {};
            if (date) query.date = date;
            if (interval) query.interval = parseInt(interval);

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const draws = await Draw.find(query)
                .sort({ date: -1, interval: 1, period: 1 })
                .skip(skip)
                .limit(parseInt(limit));

            const total = await Draw.countDocuments(query);

            res.json({
                draws,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('获取开奖预设列表错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    }
    // POST: 批量保存开奖预设
    else if (req.method === 'POST') {
        try {
            // 验证管理员权限
            const admin = await adminVerify(req);
            if (!admin) {
                return res.status(401).json({ error: '需要管理员权限' });
            }

            const { date, interval, periods } = req.body;

            // 验证参数
            if (!date || !interval || !periods || !Array.isArray(periods)) {
                return res.status(400).json({ error: '缺少必要参数' });
            }

            const intervalNum = parseInt(interval);
            if (![5, 10, 15].includes(intervalNum)) {
                return res.status(400).json({ error: 'interval参数必须是5、10或15' });
            }

            // 验证日期格式
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date)) {
                return res.status(400).json({ error: '日期格式应为YYYY-MM-DD' });
            }

            // 验证每个期次的开奖结果
            for (const p of periods) {
                if (p.result && !/^\d{10}$/.test(p.result)) {
                    return res.status(400).json({ 
                        error: `第${p.period}期的开奖结果格式错误，应为10位数字` 
                    });
                }
            }

            await dbConnect();

            // 批量写入
            const ops = periods.map(p => ({
                updateOne: {
                    filter: { date, interval: intervalNum, period: p.period },
                    update: { 
                        result: p.result,
                        updatedAt: new Date()
                    },
                    upsert: true
                }
            }));

            if (ops.length > 0) {
                await Draw.bulkWrite(ops);
            }

            res.json({ 
                success: true, 
                message: `成功保存${periods.length}期开奖预设` 
            });
        } catch (error) {
            console.error('保存开奖预设错误:', error);
            res.status(500).json({ error: '服务器错误' });
        }
    } else {
        res.status(405).json({ error: '方法不允许' });
    }
};
