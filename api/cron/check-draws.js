const dbConnect = require('../../lib/db');
const Draw = require('../../models/Draw');

/**
 * 生成随机10位数字字符串（不重复）
 */
function generateRandomResult() {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    // Fisher-Yates 洗牌算法
    for (let i = digits.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits.join('');
}

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
        // 验证请求来源（使用secret token）
        const { secret } = req.query;
        if (secret !== process.env.CRON_SECRET) {
            return res.status(401).json({ error: '未授权' });
        }

        await dbConnect();

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const minutesSinceMidnight = hours * 60 + minutes;

        // 定义要检查的周期
        const intervals = [5, 10, 15];
        const results = [];

        for (const interval of intervals) {
            // 计算当前分钟数对应的期号 (0-based)
            // 例如：5分钟一期，分钟数 0-4 为第0期，5-9 为第1期，依此类推
            const period = Math.floor(minutesSinceMidnight / interval);
            const totalPeriods = interval === 5 ? 288 : (interval === 10 ? 144 : 96);

            // 确保period在有效范围内
            if (period >= totalPeriods) {
                continue;
            }

            // 检查是否已开奖（避免重复）
            const existing = await Draw.findOne({ 
                date: dateStr, 
                interval, 
                period,
                status: 'drawn'
            });

            if (existing) {
                // 已开奖，跳过
                continue;
            }

            // 查找预设结果
            const preset = await Draw.findOne({ 
                date: dateStr, 
                interval, 
                period 
            });

            let result;
            if (preset && preset.result && /^\d{10}$/.test(preset.result)) {
                // 使用预设结果
                result = preset.result;
            } else {
                // 没有预设，随机生成
                result = generateRandomResult();
            }

            // 更新或创建开奖记录
            await Draw.findOneAndUpdate(
                { date: dateStr, interval, period },
                { 
                    result,
                    status: 'drawn',
                    updatedAt: new Date()
                },
                { upsert: true }
            );

            results.push({ 
                date: dateStr, 
                interval, 
                period: period + 1, // 返回1-based期号
                result,
                time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
            });
        }

        res.json({ 
            triggered: now.toISOString(),
            date: dateStr,
            time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
            results 
        });
    } catch (error) {
        console.error('定时开奖检查错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
};
