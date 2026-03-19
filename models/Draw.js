const mongoose = require('mongoose');

const drawSchema = new mongoose.Schema({
    date: { 
        type: String, 
        required: true 
    }, // 格式 YYYY-MM-DD
    interval: { 
        type: Number, 
        required: true,
        enum: [5, 10, 15]
    }, // 周期（分钟）：5, 10, 15
    period: { 
        type: Number, 
        required: true 
    }, // 当天期号（0-based）：5分钟周期 0-287，10分钟周期 0-143，15分钟周期 0-95
    result: { 
        type: String, 
        required: true,
        validate: {
            validator: function(v) {
                return /^\d{10}$/.test(v);
            },
            message: props => `${props.value} 不是有效的10位数字字符串`
        }
    }, // 10位数字字符串，如 "5820913746"
    status: {
        type: String,
        enum: ['pending', 'drawn', 'settled'],
        default: 'pending'
    }, // 状态：pending-待开奖，drawn-已开奖未结算，settled-已结算
    updatedAt: { 
        type: Date, 
        default: Date.now 
    },
    settledAt: {
        type: Date
    }, // 结算时间
    settlementStats: {
        totalBets: { type: Number, default: 0 },
        wonBets: { type: Number, default: 0 },
        lostBets: { type: Number, default: 0 },
        totalWinAmount: { type: Number, default: 0 }
    } // 结算统计
});

// 索引
drawSchema.index({ date: 1, interval: 1, period: 1 }, { unique: true }); // 唯一约束
drawSchema.index({ date: -1 }); // 按日期倒序查询
drawSchema.index({ interval: 1, date: -1 }); // 按周期和日期查询
drawSchema.index({ status: 1, date: -1 }); // 按状态和日期查询
drawSchema.index({ updatedAt: -1 }); // 按更新时间查询
drawSchema.index({ date: 1, status: 1, interval: 1 }); // 复合查询优化

// 虚拟字段：格式化时间
drawSchema.virtual('formattedTime').get(function() {
    const minutes = this.period * this.interval;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
});

// 虚拟字段：期号（1-based）
drawSchema.virtual('periodNumber').get(function() {
    return this.period + 1;
});

// 静态方法：获取某天的总期数
drawSchema.statics.getTotalPeriods = function(interval) {
    return interval === 5 ? 288 : (interval === 10 ? 144 : 96);
};

module.exports = mongoose.model('Draw', drawSchema);
