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
    // IP白名单（仅管理员可用）
    ipWhitelist: {
        type: [String],
        default: [],
        validate: {
            validator: function(ips) {
                // 验证每个IP地址格式
                const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
                return ips.every(ip => ipRegex.test(ip));
            },
            message: 'IP地址格式无效，支持格式：192.168.1.1 或 192.168.1.0/24'
        }
    },
    // IP白名单开关
    ipWhitelistEnabled: {
        type: Boolean,
        default: false
    },
    // 最后登录IP
    lastLoginIp: {
        type: String
    },
    // 最后登录时间
    lastLoginAt: {
        type: Date
    },
    // 最后活动时间（用于判断在线状态）
    lastActiveAt: {
        type: Date,
        default: Date.now
    },
    // 在线状态（内存中维护，不持久化）
    // 在线判定：最后活动时间在5分钟内
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

// 方法：检查IP是否在白名单中
userSchema.methods.isIpAllowed = function(ip) {
    // 如果未启用IP白名单，允许所有IP
    if (!this.ipWhitelistEnabled || this.ipWhitelist.length === 0) {
        return true;
    }
    
    return this.ipWhitelist.some(allowedIp => {
        // 支持CIDR格式，如 192.168.1.0/24
        if (allowedIp.includes('/')) {
            return isIpInCIDR(ip, allowedIp);
        }
        // 支持单个IP
        return ip === allowedIp;
    });
};

// 辅助函数：检查IP是否在CIDR范围内
function isIpInCIDR(ip, cidr) {
    const [range, bits] = cidr.split('/');
    const mask = parseInt(bits) || 32;
    
    const ipNum = ipToInt(ip);
    const rangeNum = ipToInt(range);
    const maskNum = ~((1 << (32 - mask)) - 1);
    
    return (ipNum & maskNum) === (rangeNum & maskNum);
}

// 辅助函数：IP转整数
function ipToInt(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

module.exports = mongoose.model('User', userSchema);
