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
        enum: ['pending', 'drawn'],
        default: 'pending'
    }, // 状态：pending-待开奖，drawn-已开奖
    updatedAt: { 
        type: Date, 
        default: Date.now 
    }
});

// 复合索引确保同一日期同一周期同期的唯一性
drawSchema.index({ date: 1, interval: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('Draw', drawSchema);
