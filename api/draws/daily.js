const dbConnect = require('../../lib/db');
const Draw = require('../../models/Draw');

module.exports = async (req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // 处理OPTIONS预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: '方法不允许' });
    }

    try {
        const { date, interval } = req.query;

        // 验证参数
        if (!date || !interval) {
            return res.status(400).json({ error: '缺少date或interval参数' });
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

        await dbConnect();

        // 查询该日期该周期的所有开奖预设
        const draws = await Draw.find({ date, interval: intervalNum }).sort('period');

        // 根据周期计算总期数
        const totalPeriods = intervalNum === 5 ? 288 : (intervalNum === 10 ? 144 : 96);

        // 构建完整的期次数组（没有记录的期次用null填充）
        const fullDay = Array.from({ length: totalPeriods }, (_, i) => {
            const existing = draws.find(d => d.period === i);
            return existing ? existing.result : null;
        });

        res.json({
            date,
            interval: intervalNum,
            totalPeriods,
            draws: fullDay
        });
    } catch (error) {
        console.error('获取开奖预设错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
