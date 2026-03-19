const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    type: { 
        type: String, 
        enum: ['deposit', 'withdraw', 'adjust'], 
        required: true 
    }, // deposit-充值，withdraw-提现，adjust-管理员调账
    amount: { 
        type: Number, 
        required: true 
    }, // 金额（正数）
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected', 'cancelled'], 
        default: 'pending' 
    }, // pending-待处理，approved-已批准，rejected-已拒绝，cancelled-已取消
    note: { 
        type: String 
    }, // 备注
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    processedAt: { 
        type: Date 
    }, // 处理时间
    processedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    }, // 处理人（管理员）
    cancelledAt: {
        type: Date
    }, // 取消时间
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    } // 取消人
});

// 索引
transactionSchema.index({ userId: 1, createdAt: -1 }); // 用户交易记录查询
transactionSchema.index({ status: 1, createdAt: -1 }); // 待处理交易查询
transactionSchema.index({ userId: 1, status: 1 }); // 用户待处理交易查询
transactionSchema.index({ type: 1, status: 1, createdAt: -1 }); // 按类型和状态查询
transactionSchema.index({ createdAt: -1 }); // 按时间倒序查询
transactionSchema.index({ processedBy: 1 }); // 按处理人查询
transactionSchema.index({ processedAt: -1 }); // 按处理时间查询

// 虚拟字段：格式化金额
transactionSchema.virtual('formattedAmount').get(function() {
    return `¥${this.amount.toFixed(2)}`;
});

// 静态方法：获取用户待处理交易数量
transactionSchema.statics.getPendingCountByUser = async function(userId) {
    return this.countDocuments({ userId, status: 'pending' });
};

// 静态方法：获取所有待处理交易数量
transactionSchema.statics.getPendingCount = async function() {
    return this.countDocuments({ status: 'pending' });
};

module.exports = mongoose.model('Transaction', transactionSchema);
