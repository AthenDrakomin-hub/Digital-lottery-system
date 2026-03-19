const mongoose = require('mongoose');

/**
 * 投注模型
 * 用于记录用户投注信息
 */

// 投注配置常量
const BET_CONFIG = {
    // 每个数字投注金额（元）
    PRICE_PER_NUMBER: 2,
    // 中奖固定金额（元）
    WIN_AMOUNT: 19.5,
    // 最大选择数字数
    MAX_NUMBERS: 5,
    // 最小选择数字数
    MIN_NUMBERS: 1,
    // 可选数字范围
    AVAILABLE_NUMBERS: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    // 赔率表（选择n个数字的赔率）
    ODDS: {
        1: 9.75,
        2: 4.875,
        3: 3.25,
        4: 2.4375,
        5: 1.95
    }
};

const betSchema = new mongoose.Schema({
    // 用户ID
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true
    },
    
    // 投注信息
    date: { 
        type: String, 
        required: true 
    }, // 开奖日期 YYYY-MM-DD
    interval: { 
        type: Number, 
        required: true,
        enum: [5, 10, 15]
    }, // 周期（分钟）
    period: { 
        type: Number, 
        required: true 
    }, // 期号（0-based）
    
    // 投注详情
    betType: { 
        type: String, 
        required: true,
        enum: ['champion', 'direct', 'group', 'bigSmall', 'dragonTiger']
    }, // 玩法：champion-冠军, direct-直选, group-组选, bigSmall-大小单双, dragonTiger-龙虎
    
    // 冠军玩法专用字段
    championNumbers: [{
        type: Number,
        min: 0,
        max: 9
    }], // 投注的数字数组（冠军玩法）
    
    numbers: { 
        type: String
    }, // 投注号码（其他玩法）
    
    amount: { 
        type: Number, 
        required: true,
        min: 2
    }, // 投注金额
    
    odds: { 
        type: Number, 
        default: 1
    }, // 赔率
    
    selectedCount: {
        type: Number,
        min: 1,
        max: 5
    }, // 选择的数字数量（冠军玩法）
    
    // 结算信息
    status: { 
        type: String, 
        enum: ['pending', 'won', 'lost', 'cancelled'], 
        default: 'pending' 
    }, // pending-待开奖, won-中奖, lost-未中奖, cancelled-已取消
    winAmount: { 
        type: Number, 
        default: 0 
    }, // 中奖金额
    result: { 
        type: String 
    }, // 开奖结果
    championNumber: {
        type: Number
    }, // 冠军数字（开奖结果第一个数字）
    
    // 取消相关
    cancelledAt: {
        type: Date
    }, // 取消时间
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }, // 取消人
    refundAmount: {
        type: Number,
        default: 0
    }, // 退款金额
    
    // 时间戳
    createdAt: { 
        type: Date, 
        default: Date.now,
        index: true
    },
    settledAt: { 
        type: Date 
    } // 结算时间
});

// ========== 索引优化 ==========

// 1. 核心查询索引
betSchema.index({ userId: 1, createdAt: -1 }); // 用户投注历史
betSchema.index({ userId: 1, status: 1 }); // 用户待结算投注
betSchema.index({ status: 1, createdAt: -1 }); // 待结算投注列表

// 2. 结算查询索引（重要！）
betSchema.index({ date: 1, interval: 1, period: 1, status: 1 }); // 按期号查询待结算投注
betSchema.index({ date: 1, status: 1 }); // 按日期查询待结算投注

// 3. 复合查询索引
betSchema.index({ userId: 1, date: 1, status: 1 }); // 用户某日投注查询
betSchema.index({ date: 1, interval: 1, userId: 1 }); // 按日期周期用户查询

// 4. 统计分析索引
betSchema.index({ createdAt: -1 }); // 按时间倒序
betSchema.index({ betType: 1, createdAt: -1 }); // 按玩法统计

// ========== 虚拟字段 ==========
betSchema.virtual('periodNumber').get(function() {
    return this.period + 1;
});

betSchema.virtual('formattedAmount').get(function() {
    return `¥${this.amount.toFixed(2)}`;
});

betSchema.virtual('formattedWinAmount').get(function() {
    return `¥${this.winAmount.toFixed(2)}`;
});

// ========== 静态方法 ==========

/**
 * 验证冠军玩法投注
 * @param {Array} numbers - 投注数字数组
 * @returns {object} { valid, error, amount, odds }
 */
betSchema.statics.validateChampionBet = function(numbers) {
    // 检查是否为数组
    if (!Array.isArray(numbers)) {
        return { valid: false, error: '投注数字必须是数组' };
    }
    
    // 检查数量
    if (numbers.length < BET_CONFIG.MIN_NUMBERS || numbers.length > BET_CONFIG.MAX_NUMBERS) {
        return { valid: false, error: `投注数字数量必须在${BET_CONFIG.MIN_NUMBERS}-${BET_CONFIG.MAX_NUMBERS}个之间` };
    }
    
    // 检查数字是否有效
    for (const num of numbers) {
        if (!BET_CONFIG.AVAILABLE_NUMBERS.includes(num)) {
            return { valid: false, error: `无效的数字: ${num}` };
        }
    }
    
    // 检查是否有重复
    const uniqueNumbers = [...new Set(numbers)];
    if (uniqueNumbers.length !== numbers.length) {
        return { valid: false, error: '投注数字不能重复' };
    }
    
    // 计算金额和赔率
    const amount = numbers.length * BET_CONFIG.PRICE_PER_NUMBER;
    const odds = BET_CONFIG.ODDS[numbers.length];
    
    return {
        valid: true,
        amount,
        odds,
        selectedCount: numbers.length
    };
};

/**
 * 计算中奖金额
 * @param {Array} championNumbers - 投注数字
 * @param {number} championResult - 开奖冠军数字
 * @returns {object} { isWin, winAmount }
 */
betSchema.statics.calculateChampionWin = function(championNumbers, championResult) {
    const isWin = championNumbers.includes(championResult);
    return {
        isWin,
        winAmount: isWin ? BET_CONFIG.WIN_AMOUNT : 0
    };
};

/**
 * 获取投注配置
 */
betSchema.statics.getBetConfig = function() {
    return { ...BET_CONFIG };
};

/**
 * 获取赔率表
 */
betSchema.statics.getOddsTable = function() {
    return Object.entries(BET_CONFIG.ODDS).map(([count, odds]) => ({
        selectedCount: parseInt(count),
        amount: parseInt(count) * BET_CONFIG.PRICE_PER_NUMBER,
        winAmount: BET_CONFIG.WIN_AMOUNT,
        odds,
        probability: parseInt(count) / 10
    }));
};

// 获取用户待结算投注数量
betSchema.statics.getPendingCountByUser = async function(userId) {
    return this.countDocuments({ userId, status: 'pending' });
};

// 获取某期所有待结算投注
betSchema.statics.getPendingBetsByPeriod = async function(date, interval, period) {
    return this.find({ date, interval, period, status: 'pending' });
};

// 获取用户投注统计
betSchema.statics.getUserStats = async function(userId, startDate, endDate) {
    return this.aggregate([
        { 
            $match: { 
                userId: mongoose.Types.ObjectId(userId),
                createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
            } 
        },
        {
            $group: {
                _id: null,
                totalBets: { $sum: 1 },
                totalAmount: { $sum: '$amount' },
                totalWin: { $sum: '$winAmount' },
                wonCount: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } }
            }
        }
    ]);
};

// 获取用户某期投注
betSchema.statics.getUserBetsByPeriod = async function(userId, date, interval, period) {
    return this.find({ 
        userId, 
        date, 
        interval, 
        period,
        status: { $ne: 'cancelled' }
    }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Bet', betSchema);
module.exports.BET_CONFIG = BET_CONFIG;
