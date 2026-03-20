const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
});

// 系统默认配置
const DEFAULT_CONFIG = {
    // 玩法配置
    'bet.pricePerNumber': { value: 2, description: '每注投注金额（元）' },
    'bet.winAmount': { value: 19.5, description: '中奖金额（元）' },
    'bet.maxNumbers': { value: 5, description: '最大投注数字数' },
    'bet.minNumbers': { value: 1, description: '最小投注数字数' },
    
    // 提现配置
    'withdraw.minAmount': { value: 10, description: '最小提现金额（元）' },
    'withdraw.maxAmount': { value: 50000, description: '最大提现金额（元）' },
    'withdraw.feeRate': { value: 0, description: '提现手续费率（%）' },
    'withdraw.processingTime': { value: '1-24小时', description: '提现到账时间' },
    
    // 支付配置
    'payment.alipay': { value: { name: '', account: '', qrcode: '' }, description: '支付宝收款信息' },
    'payment.wechat': { value: { name: '', account: '', qrcode: '' }, description: '微信收款信息' },
    'payment.bank': { value: { bankName: '', accountName: '', accountNumber: '', branch: '' }, description: '银行卡收款信息' },
    'payment.usdt': { value: { network: 'TRC20', address: '' }, description: 'USDT收款地址' },
    
    // CORS跨域配置
    'cors.allowedOrigins': { value: ['*'], description: '允许跨域访问的域名列表，* 表示允许所有' },
    'cors.enabled': { value: true, description: '是否启用CORS跨域' }
};

// 静态方法：获取配置
configSchema.statics.get = async function(key, defaultValue = null) {
    const config = await this.findOne({ key });
    if (config) return config.value;
    
    // 返回默认值
    if (DEFAULT_CONFIG[key]) return DEFAULT_CONFIG[key].value;
    return defaultValue;
};

// 静态方法：设置配置
configSchema.statics.set = async function(key, value, userId = null) {
    return await this.findOneAndUpdate(
        { key },
        { 
            value, 
            updatedAt: new Date(),
            updatedBy: userId,
            description: DEFAULT_CONFIG[key]?.description || ''
        },
        { upsert: true, new: true }
    );
};

// 静态方法：获取所有配置
configSchema.statics.getAll = async function() {
    const configs = await this.find({});
    const result = {};
    
    // 合并默认配置和数据库配置
    for (const [key, data] of Object.entries(DEFAULT_CONFIG)) {
        const dbConfig = configs.find(c => c.key === key);
        result[key] = {
            value: dbConfig ? dbConfig.value : data.value,
            description: data.description,
            isDefault: !dbConfig
        };
    }
    
    // 添加其他自定义配置
    for (const config of configs) {
        if (!result[config.key]) {
            result[config.key] = {
                value: config.value,
                description: config.description || '',
                isDefault: false
            };
        }
    }
    
    return result;
};

module.exports = mongoose.model('Config', configSchema);
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
