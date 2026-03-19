const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 50
    },
    password: { 
        type: String, 
        required: true 
    },
    role: { 
        type: String, 
        enum: ['admin', 'user'], 
        default: 'user' 
    },
    balance: { 
        type: Number, 
        default: 0,
        min: 0
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },
    deletedAt: {
        type: Date
    }, // 删除时间（软删除）
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// 索引
userSchema.index({ createdAt: -1 });
userSchema.index({ role: 1, isActive: 1 }); // 用于管理员查询活跃用户
userSchema.index({ balance: -1 }); // 用于余额排序

// 虚拟字段：格式化余额
userSchema.virtual('formattedBalance').get(function() {
    return `¥${this.balance.toFixed(2)}`;
});

module.exports = mongoose.model('User', userSchema);
