const mongoose = require('mongoose');

/**
 * 投注模型
 * 用于记录用户投注信息
 */
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
        enum: ['direct', 'group', 'bigSmall', 'dragonTiger']
    }, // 玩法：direct-直选, group-组选, bigSmall-大小单双, dragonTiger-龙虎
    numbers: { 
        type: String, 
        required: true 
    }, // 投注号码
    amount: { 
        type: Number, 
        required: true,
        min: 1
    }, // 投注金额
    odds: { 
        type: Number, 
        default: 1
    }, // 赔率
    
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

module.exports = mongoose.model('Bet', betSchema);
