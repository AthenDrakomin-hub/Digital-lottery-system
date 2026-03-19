const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// 预设管理员账户
const ADMIN_ACCOUNTS = [
    { username: 'admin001', password: 'admin123' },
    { username: 'admin002', password: 'admin123' },
    { username: 'admin003', password: 'admin123' }
];

/**
 * 初始化管理员账户
 * @param {string} mongodbUri - MongoDB连接字符串
 */
async function initAdmins(mongodbUri) {
    try {
        console.log('🔗 正在连接数据库...');
        
        await mongoose.connect(mongodbUri, {
            maxPoolSize: 5,
            serverSelectionTimeoutMS: 10000
        });
        
        console.log('✅ 数据库连接成功');
        
        // 定义User模型（简化版）
        const userSchema = new mongoose.Schema({
            username: { type: String, required: true, unique: true, trim: true },
            password: { type: String, required: true },
            role: { type: String, enum: ['admin', 'user'], default: 'user' },
            balance: { type: Number, default: 0, min: 0 },
            isActive: { type: Boolean, default: true },
            createdAt: { type: Date, default: Date.now }
        });
        
        userSchema.index({ createdAt: -1 });
        
        const User = mongoose.models.User || mongoose.model('User', userSchema);
        
        console.log('\n📋 开始初始化管理员账户...\n');
        
        for (const account of ADMIN_ACCOUNTS) {
            try {
                // 检查用户是否已存在
                const existing = await User.findOne({ username: account.username });
                
                if (existing) {
                    // 如果存在但不是管理员，更新为管理员
                    if (existing.role !== 'admin') {
                        existing.role = 'admin';
                        await existing.save();
                        console.log(`✅ 用户 ${account.username} 已存在，已升级为管理员`);
                    } else {
                        console.log(`⏭️  管理员 ${account.username} 已存在，跳过`);
                    }
                } else {
                    // 创建新管理员
                    const hashedPassword = await bcrypt.hash(account.password, 10);
                    await User.create({
                        username: account.username,
                        password: hashedPassword,
                        role: 'admin',
                        balance: 0,
                        isActive: true
                    });
                    console.log(`✅ 管理员 ${account.username} 创建成功`);
                }
            } catch (error) {
                if (error.code === 11000) {
                    console.log(`⏭️  管理员 ${account.username} 已存在，跳过`);
                } else {
                    console.error(`❌ 创建管理员 ${account.username} 失败:`, error.message);
                }
            }
        }
        
        console.log('\n✅ 管理员账户初始化完成！\n');
        console.log('📝 管理员账户列表：');
        console.log('   ┌─────────────┬────────────┐');
        console.log('   │ 用户名      │ 密码       │');
        console.log('   ├─────────────┼────────────┤');
        ADMIN_ACCOUNTS.forEach(acc => {
            console.log(`   │ ${acc.username.padEnd(11)} │ ${acc.password.padEnd(10)} │`);
        });
        console.log('   └─────────────┴────────────┘');
        console.log('\n⚠️  重要提示：请在首次登录后立即修改默认密码！\n');
        
        return true;
    } catch (error) {
        console.error('❌ 初始化失败:', error.message);
        return false;
    } finally {
        await mongoose.disconnect();
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    const mongodbUri = process.env.MONGODB_URI;
    
    if (!mongodbUri) {
        console.error('❌ 错误: 请设置 MONGODB_URI 环境变量');
        console.log('\n使用方法:');
        console.log('  MONGODB_URI="your-mongodb-uri" node scripts/init-admins.js\n');
        process.exit(1);
    }
    
    initAdmins(mongodbUri).then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = initAdmins;
