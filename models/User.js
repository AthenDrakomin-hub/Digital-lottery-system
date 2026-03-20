const mongoose = require('mongoose');

// 银行卡子模式
const bankCardSchema = new mongoose.Schema({
    bankName: { 
        type: String, 
        required: true,
        trim: true 
    }, // 银行名称
    cardNumber: { 
        type: String, 
        required: true,
        trim: true 
    }, // 银行卡号
    cardHolder: { 
        type: String, 
        required: true,
        trim: true 
    }, // 持卡人姓名
    bankBranch: { 
        type: String,
        trim: true 
    }, // 开户行
    isDefault: {
        type: Boolean,
        default: false
    }, // 是否默认银行卡
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
}, { _id: true });

const userSchema = new mongoose.Schema({
    // ===== 账户信息 =====
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
    }, // bcrypt加密存储
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
    
    // ===== 基本信息 =====
    realName: {
        type: String,
        trim: true,
        maxlength: 50
    }, // 真实姓名
    phone: {
        type: String,
        trim: true,
        validate: {
            validator: function(v) {
                return !v || /^1[3-9]\d{9}$/.test(v);
            },
            message: '手机号格式不正确'
        }
    }, // 手机号
    idCard: {
        type: String,
        trim: true,
        validate: {
            validator: function(v) {
                return !v || /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(v);
            },
            message: '身份证号格式不正确'
        }
    }, // 身份证号（加密存储）
    email: {
        type: String,
        trim: true,
        lowercase: true,
        validate: {
            validator: function(v) {
                return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: '邮箱格式不正确'
        }
    },
    
    // ===== 银行卡信息 =====
    bankCards: [bankCardSchema], // 银行卡列表
    
    // ===== 安全设置 =====
    // IP白名单（仅管理员可用）
    ipWhitelist: {
        type: [String],
        default: [],
        validate: {
            validator: function(ips) {
                const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
                return ips.every(ip => ipRegex.test(ip));
            },
            message: 'IP地址格式无效，支持格式：192.168.1.1 或 192.168.1.0/24'
        }
    },
    ipWhitelistEnabled: {
        type: Boolean,
        default: false
    },
    
    // ===== 登录信息 =====
    lastLoginIp: {
        type: String
    },
    lastLoginAt: {
        type: Date
    },
    lastActiveAt: {
        type: Date,
        default: Date.now
    },
    
    // ===== 系统字段 =====
    deletedAt: {
        type: Date
    },
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
