/**
 * 数据库初始化脚本
 * 创建索引、管理员账户和初始数据
 */

require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// 数据库连接
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ 错误：请设置 MONGODB_URI 环境变量');
    process.exit(1);
}

// 定义模型
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null }
}, { timestamps: true, collection: 'users' });

const DrawSchema = new mongoose.Schema({
    date: { type: String, required: true },
    interval: { type: Number, required: true },
    period: { type: Number, required: true },
    result: { type: String },
    status: { type: String, enum: ['pending', 'drawn', 'settled'], default: 'pending' },
    settledAt: { type: Date },
    settlementStats: { type: Object }
}, { timestamps: true, collection: 'draws' });

const BetSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    interval: { type: Number, required: true },
    period: { type: Number, required: true },
    betType: { type: String, default: 'champion' },
    championNumbers: [{ type: Number }],
    numbers: { type: String },
    amount: { type: Number, required: true },
    odds: { type: Number },
    selectedCount: { type: Number },
    status: { type: String, enum: ['pending', 'won', 'lost', 'cancelled'], default: 'pending' },
    winAmount: { type: Number, default: 0 },
    result: { type: String },
    championNumber: { type: Number },
    settledAt: { type: Date },
    cancelledAt: { type: Date },
    refundAmount: { type: Number }
}, { timestamps: true, collection: 'bets' });

const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['deposit', 'withdraw', 'adjust'], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed', 'cancelled'], default: 'pending' },
    note: { type: String },
    processedAt: { type: Date },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    payoutInfo: { type: Object },
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId }
}, { timestamps: true, collection: 'transactions' });

// 创建索引（只在Schema层面定义，避免重复）
DrawSchema.index({ date: 1, interval: 1, period: 1 }, { unique: true });
DrawSchema.index({ date: 1, status: 1 });

BetSchema.index({ userId: 1, status: 1 });
BetSchema.index({ date: 1, interval: 1, period: 1 });
BetSchema.index({ createdAt: -1 });

TransactionSchema.index({ userId: 1, status: 1 });
TransactionSchema.index({ createdAt: -1 });

// 静态方法
BetSchema.statics.getOddsTable = function() {
    return [
        { selectedCount: 1, amount: 2, winAmount: 19.5, odds: 9.75, probability: 0.1 },
        { selectedCount: 2, amount: 4, winAmount: 19.5, odds: 4.875, probability: 0.2 },
        { selectedCount: 3, amount: 6, winAmount: 19.5, odds: 3.25, probability: 0.3 },
        { selectedCount: 4, amount: 8, winAmount: 19.5, odds: 2.4375, probability: 0.4 },
        { selectedCount: 5, amount: 10, winAmount: 19.5, odds: 1.95, probability: 0.5 }
    ];
};

BetSchema.statics.validateChampionBet = function(numbers) {
    if (!Array.isArray(numbers) || numbers.length < 1 || numbers.length > 5) {
        return { valid: false, error: '请选择1-5个数字' };
    }
    
    for (const num of numbers) {
        if (num < 0 || num > 9 || !Number.isInteger(num)) {
            return { valid: false, error: '数字必须是0-9的整数' };
        }
    }
    
    const uniqueNumbers = [...new Set(numbers)];
    if (uniqueNumbers.length !== numbers.length) {
        return { valid: false, error: '不能选择重复的数字' };
    }
    
    const oddsTable = this.getOddsTable();
    const config = oddsTable.find(o => o.selectedCount === numbers.length);
    
    return {
        valid: true,
        amount: config.amount,
        odds: config.odds,
        selectedCount: numbers.length
    };
};

// 创建模型
const User = mongoose.model('User', UserSchema);
const Draw = mongoose.model('Draw', DrawSchema);
const Bet = mongoose.model('Bet', BetSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

// 预设管理员账户
const ADMIN_ACCOUNTS = [
    { username: 'admin001', password: 'admin123', role: 'admin' },
    { username: 'admin002', password: 'admin123', role: 'admin' },
    { username: 'admin003', password: 'admin123', role: 'admin' }
];

async function initDatabase() {
    console.log('🚀 开始初始化数据库...\n');
    
    try {
        // 连接数据库
        console.log('📡 连接 MongoDB...');
        await mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
            maxPoolSize: 10,
            minPoolSize: 1
        });
        console.log('✅ MongoDB 连接成功\n');
        
        // 1. 创建管理员账户
        console.log('👤 创建管理员账户...');
        
        for (const account of ADMIN_ACCOUNTS) {
            const existing = await User.findOne({ username: account.username });
            
            if (existing) {
                if (existing.role !== 'admin') {
                    existing.role = 'admin';
                    await existing.save();
                    console.log(`  ✅ ${account.username} 已升级为管理员`);
                } else {
                    console.log(`  ℹ️  ${account.username} 已存在`);
                }
            } else {
                const hashedPassword = await bcrypt.hash(account.password, 10);
                await User.create({
                    username: account.username,
                    password: hashedPassword,
                    role: 'admin',
                    balance: 0,
                    isActive: true
                });
                console.log(`  ✅ ${account.username} 创建成功`);
            }
        }
        console.log();
        
        // 2. 创建测试用户（可选）
        console.log('👥 创建测试用户...');
        
        const testUsers = [
            { username: 'test001', password: '123456', balance: 100 },
            { username: 'test002', password: '123456', balance: 200 },
            { username: 'test003', password: '123456', balance: 500 }
        ];
        
        for (const user of testUsers) {
            const existing = await User.findOne({ username: user.username });
            if (!existing) {
                const hashedPassword = await bcrypt.hash(user.password, 10);
                await User.create({
                    username: user.username,
                    password: hashedPassword,
                    role: 'user',
                    balance: user.balance,
                    isActive: true
                });
                console.log(`  ✅ ${user.username} 创建成功（余额: ¥${user.balance}）`);
            } else {
                console.log(`  ℹ️  ${user.username} 已存在`);
            }
        }
        console.log();
        
        // 3. 创建今日开奖预设（示例）
        console.log('🎲 创建今日开奖预设...');
        
        const today = new Date().toISOString().slice(0, 10);
        const intervals = [5, 10, 15];
        
        for (const interval of intervals) {
            const totalPeriods = interval === 5 ? 288 : (interval === 10 ? 144 : 96);
            const existingCount = await Draw.countDocuments({ date: today, interval });
            
            if (existingCount === 0) {
                // 创建前10期的预设（示例）
                const draws = [];
                for (let i = 0; i < Math.min(10, totalPeriods); i++) {
                    draws.push({
                        date: today,
                        interval,
                        period: i,
                        status: 'pending'
                    });
                }
                await Draw.insertMany(draws);
                console.log(`  ✅ ${interval}分钟周期：创建了 ${draws.length} 期预设`);
            } else {
                console.log(`  ℹ️  ${interval}分钟周期：已存在 ${existingCount} 期`);
            }
        }
        console.log();
        
        // 4. 显示统计信息
        console.log('📊 数据库统计：');
        console.log(`  - 用户总数: ${await User.countDocuments()}`);
        console.log(`  - 管理员数: ${await User.countDocuments({ role: 'admin' })}`);
        console.log(`  - 活跃用户: ${await User.countDocuments({ isActive: true })}`);
        console.log(`  - 开奖记录: ${await Draw.countDocuments()}`);
        console.log(`  - 投注记录: ${await Bet.countDocuments()}`);
        console.log(`  - 交易记录: ${await Transaction.countDocuments()}`);
        console.log();
        
        console.log('🎉 数据库初始化完成！\n');
        
        // 显示管理员账户信息
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('管理员账户信息：');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        for (const account of ADMIN_ACCOUNTS) {
            console.log(`  用户名: ${account.username}`);
            console.log(`  密码: ${account.password}`);
            console.log('  ─────────────────────');
        }
        console.log('⚠️  请在首次登录后立即修改默认密码！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('📡 数据库连接已关闭');
    }
}

// 执行初始化
initDatabase();
