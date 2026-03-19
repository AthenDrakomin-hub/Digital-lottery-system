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
        enum: ['pending', 'approved', 'rejected'], 
        default: 'pending' 
    }, // pending-待处理，approved-已批准，rejected-已拒绝
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
    } // 处理人（管理员）
});

// 索引
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
