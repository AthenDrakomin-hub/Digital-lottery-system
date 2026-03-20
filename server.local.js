// 加载环境变量（必须在最前面）
require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.DEPLOY_RUN_PORT || 5000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/xml' })); // 微信回调使用XML
app.use(express.static(path.join(__dirname, 'public')));

// CORS支持
app.use((req, res, next) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
        ? process.env.ALLOWED_ORIGINS.split(',') 
        : ['*'];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Request-ID');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    res.header('Access-Control-Expose-Headers', 'X-Total-Count, X-Page, X-Per-Page');
    
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    
    next();
});

// API路由处理器
const apiRoutes = {
    '/api/auth': './api/auth',
    '/api/users': './api/users',
    '/api/transactions': './api/transactions',
    '/api/admin': './api/admin',
    '/api/system': './api/system'
};

// 注册API路由
Object.keys(apiRoutes).forEach(route => {
    const module = require(apiRoutes[route]);
    const handler = module.handler || module.handleAuth || module.handleUsers || module.handleTransactions || module.handleAdmin || module.handleSystem || module;
    
    app.all(route, async (req, res) => {
        const vercelReq = {
            ...req,
            query: req.query,
            body: req.body,
            headers: req.headers,
            method: req.method
        };
        
        try {
            await handler(vercelReq, res);
        } catch (error) {
            console.error(`API错误 [${route}]:`, error);
            res.status(500).json({ error: '服务器内部错误' });
        }
    });
});

// 默认路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404处理
app.use((req, res) => {
    res.status(404).json({ error: `路径 ${req.method} ${req.path} 不存在`, code: 'NOT_FOUND' });
});

// ==================== 自动开奖定时器 ====================

/**
 * 内置开奖检查器
 * 每分钟检查一次是否需要开奖
 */
class AutoDrawScheduler {
    constructor() {
        this.isRunning = false;
        this.lastCheckedMinute = -1;
        this.intervals = [5, 10, 15]; // 支持的周期（分钟）
        this.db = null;
        this.Draw = null;
        this.Bet = null;
        this.User = null;
    }

    /**
     * 生成随机开奖结果（10位数字）
     */
    generateResult() {
        let result = '';
        for (let i = 0; i < 10; i++) {
            result += Math.floor(Math.random() * 10);
        }
        return result;
    }

    /**
     * 获取当前期号信息
     */
    getCurrentPeriodInfo(interval) {
        const now = new Date();
        const date = now.toISOString().slice(0, 10);
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const totalMinutes = hours * 60 + minutes;
        
        // 当前是第几期（从0开始）
        const currentPeriod = Math.floor(totalMinutes / interval);
        
        // 当前期剩余秒数
        const periodStartMinute = currentPeriod * interval;
        const elapsedSeconds = (totalMinutes - periodStartMinute) * 60 + now.getSeconds();
        const remainingSeconds = interval * 60 - elapsedSeconds;
        
        return {
            date,
            currentPeriod,
            totalMinutes,
            remainingSeconds,
            nextPeriodMinute: (currentPeriod + 1) * interval
        };
    }

    /**
     * 检查并执行开奖
     */
    async checkAndDraw() {
        if (!this.db) {
            try {
                this.db = require('./lib/db');
                this.Draw = require('./models/Draw');
                this.Bet = require('./models/Bet');
                this.User = require('./models/User');
                await this.db();
            } catch (error) {
                console.error('[开奖检查器] 数据库连接失败:', error.message);
                return;
            }
        }

        const now = new Date();
        const currentMinute = now.getHours() * 60 + now.getMinutes();
        
        // 避免同一分钟内重复检查
        if (currentMinute === this.lastCheckedMinute) {
            return;
        }
        this.lastCheckedMinute = currentMinute;

        console.log(`\n[开奖检查器] ${now.toLocaleTimeString('zh-CN')} - 检查开奖状态...`);

        for (const interval of this.intervals) {
            const periodInfo = this.getCurrentPeriodInfo(interval);
            
            // 计算需要开奖的期号：上一期（当前时间已进入新一期，上一期应该开奖）
            const periodToDraw = periodInfo.currentPeriod - 1;
            
            if (periodToDraw < 0) continue;

            try {
                // 检查该期是否已开奖
                let draw = await this.Draw.findOne({
                    date: periodInfo.date,
                    interval: interval,
                    period: periodToDraw
                });

                if (draw && draw.status === 'settled') {
                    // 已结算，跳过
                    continue;
                }

                // 获取上一期的结束时间（分钟）
                const periodEndMinute = (periodToDraw + 1) * interval;
                
                // 判断是否到达开奖时间（当前时间已过该期结束时间）
                if (currentMinute >= periodEndMinute) {
                    // 执行开奖
                    await this.executeDraw(periodInfo.date, interval, periodToDraw, draw);
                }

            } catch (error) {
                console.error(`[开奖检查器] ${interval}分钟期检查失败:`, error.message);
            }
        }
    }

    /**
     * 执行开奖
     */
    async executeDraw(date, interval, period, existingDraw) {
        console.log(`[开奖检查器] 开始开奖: ${date} ${interval}分钟 第${period + 1}期`);

        try {
            let draw = existingDraw;
            
            // 如果没有开奖记录，创建一个
            if (!draw) {
                draw = await this.Draw.create({
                    date,
                    interval,
                    period,
                    result: this.generateResult(),
                    status: 'drawn'
                });
                console.log(`[开奖检查器] 创建新开奖记录: 结果=${draw.result}`);
            } else if (!draw.result) {
                // 如果有记录但没有结果，生成结果
                draw.result = this.generateResult();
                draw.status = 'drawn';
                await draw.save();
                console.log(`[开奖检查器] 更新开奖结果: 结果=${draw.result}`);
            }

            // 结算投注
            await this.settleBets(draw);

        } catch (error) {
            console.error(`[开奖检查器] 开奖失败:`, error.message);
        }
    }

    /**
     * 结算投注
     */
    async settleBets(draw) {
        // 查找该期所有待结算的投注
        const bets = await this.Bet.find({
            date: draw.date,
            interval: draw.interval,
            period: draw.period,
            status: 'pending'
        });

        if (bets.length === 0) {
            console.log(`[开奖检查器] 无待结算投注`);
            draw.status = 'settled';
            draw.settledAt = new Date();
            await draw.save();
            return;
        }

        console.log(`[开奖检查器] 结算 ${bets.length} 笔投注...`);

        // 冠军数字（开奖结果第一位）
        const championNumber = parseInt(draw.result[0]);
        const WIN_AMOUNT = 19.5; // 中奖金额

        let wonCount = 0;
        let lostCount = 0;
        let totalWinAmount = 0;

        for (const bet of bets) {
            // 冠军玩法：投注数字包含冠军数字即中奖
            const isWin = bet.championNumbers && bet.championNumbers.includes(championNumber);
            
            bet.status = isWin ? 'won' : 'lost';
            bet.winAmount = isWin ? WIN_AMOUNT : 0;
            bet.result = draw.result;
            bet.championNumber = championNumber;
            bet.settledAt = new Date();
            await bet.save();

            if (isWin) {
                // 更新用户余额
                await this.User.findByIdAndUpdate(bet.userId, { $inc: { balance: WIN_AMOUNT } });
                wonCount++;
                totalWinAmount += WIN_AMOUNT;
            } else {
                lostCount++;
            }
        }

        // 更新开奖状态
        draw.status = 'settled';
        draw.settledAt = new Date();
        draw.settlementStats = {
            totalBets: bets.length,
            wonBets: wonCount,
            lostBets: lostCount,
            totalWinAmount
        };
        await draw.save();

        console.log(`[开奖检查器] 结算完成: 中奖${wonCount}笔，未中${lostCount}笔，派奖${totalWinAmount.toFixed(2)}元`);
    }

    /**
     * 启动定时器
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        console.log('[开奖检查器] 启动自动开奖定时器...');
        
        // 立即执行一次
        this.checkAndDraw();
        
        // 每10秒检查一次
        this.timer = setInterval(() => {
            this.checkAndDraw();
        }, 10000);
    }

    /**
     * 停止定时器
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
        console.log('[开奖检查器] 已停止');
    }
}

// 创建开奖检查器实例
const drawScheduler = new AutoDrawScheduler();

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
    console.log(`📝 API端点: 5个合并后的函数`);
    console.log(`   - /api/auth?action=register|login|me|change-password`);
    console.log(`   - /api/users[?id=xxx&action=create|balance]`);
    console.log(`   - /api/transactions[?id=xxx&action=request|approve|reject]`);
    console.log(`   - /api/admin?action=init|verify|archive|stats`);
    console.log(`   - /api/system?type=draws|bets|cron|payment`);
    
    // 启动自动开奖
    drawScheduler.start();
});

// 导出用于测试
module.exports = { app, drawScheduler };
