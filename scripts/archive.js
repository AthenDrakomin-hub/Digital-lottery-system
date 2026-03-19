const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

/**
 * 数据归档清理脚本
 * 用于清理超过指定天数的开奖记录和投注记录
 */

// 默认配置
const DEFAULT_CONFIG = {
    archiveDays: 90, // 保留最近90天的数据
    archivePath: './archives', // 归档文件保存路径
    models: ['Draw', 'Bet'], // 需要归档的模型
    dryRun: false, // 试运行模式，只统计不删除
    batchSize: 1000 // 批量处理大小
};

/**
 * 归档并清理数据
 * @param {string} mongodbUri - MongoDB连接字符串
 * @param {Object} config - 配置选项
 */
async function archiveData(mongodbUri, config = {}) {
    const options = { ...DEFAULT_CONFIG, ...config };
    
    console.log('📦 数据归档清理工具');
    console.log('='.repeat(50));
    console.log(`📅 保留最近 ${options.archiveDays} 天的数据`);
    console.log(`📁 归档路径: ${options.archivePath}`);
    console.log(`🔍 试运行模式: ${options.dryRun ? '是' : '否'}`);
    console.log('='.repeat(50));
    
    try {
        // 连接数据库
        console.log('\n🔗 正在连接数据库...');
        await mongoose.connect(mongodbUri, {
            maxPoolSize: 5,
            serverSelectionTimeoutMS: 10000
        });
        console.log('✅ 数据库连接成功');
        
        // 计算截止日期
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - options.archiveDays);
        const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);
        
        console.log(`\n📅 截止日期: ${cutoffDateStr}`);
        console.log(`   将清理 ${cutoffDateStr} 之前的数据\n`);
        
        const results = {};
        
        // 处理开奖记录
        if (options.models.includes('Draw')) {
            results.Draw = await archiveDraws(cutoffDateStr, options);
        }
        
        // 处理投注记录
        if (options.models.includes('Bet')) {
            results.Bet = await archiveBets(cutoffDateStr, options);
        }
        
        // 输出汇总
        console.log('\n' + '='.repeat(50));
        console.log('📊 清理汇总');
        console.log('='.repeat(50));
        
        for (const [model, result] of Object.entries(results)) {
            console.log(`\n${model}:`);
            console.log(`  - 扫描记录: ${result.scanned} 条`);
            console.log(`  - 归档记录: ${result.archived} 条`);
            console.log(`  - 删除记录: ${result.deleted} 条`);
            if (result.archiveFile) {
                console.log(`  - 归档文件: ${result.archiveFile}`);
            }
        }
        
        console.log('\n✅ 归档清理完成！\n');
        
        return results;
    } catch (error) {
        console.error('❌ 归档清理失败:', error.message);
        throw error;
    } finally {
        await mongoose.disconnect();
    }
}

/**
 * 归档开奖记录
 */
async function archiveDraws(cutoffDate, options) {
    console.log('🎰 处理开奖记录...');
    
    const Draw = mongoose.model('Draw');
    
    // 统计需要归档的记录数
    const scanned = await Draw.countDocuments({ date: { $lt: cutoffDate } });
    console.log(`  找到 ${scanned} 条需要归档的记录`);
    
    if (scanned === 0) {
        return { scanned: 0, archived: 0, deleted: 0 };
    }
    
    let archived = 0;
    let deleted = 0;
    let archiveFile = null;
    
    // 获取需要归档的记录
    const records = await Draw.find({ date: { $lt: cutoffDate } }).lean();
    
    if (!options.dryRun && records.length > 0) {
        // 创建归档目录
        const archiveDir = path.join(options.archivePath, 'draws');
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
        }
        
        // 保存归档文件
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        archiveFile = path.join(archiveDir, `draws-${timestamp}.json`);
        fs.writeFileSync(archiveFile, JSON.stringify(records, null, 2));
        archived = records.length;
        console.log(`  已保存归档文件: ${archiveFile}`);
        
        // 分批删除记录
        let deletedCount = 0;
        while (true) {
            const result = await Draw.deleteMany({ 
                date: { $lt: cutoffDate } 
            }).limit(options.batchSize);
            
            deletedCount += result.deletedCount;
            console.log(`  已删除 ${deletedCount}/${scanned} 条记录`);
            
            if (result.deletedCount === 0) break;
        }
        deleted = deletedCount;
    }
    
    return { scanned, archived, deleted, archiveFile };
}

/**
 * 归档投注记录
 */
async function archiveBets(cutoffDate, options) {
    console.log('💰 处理投注记录...');
    
    // 检查Bet模型是否存在
    try {
        mongoose.model('Bet');
    } catch (e) {
        console.log('  ⚠️  Bet模型未定义，跳过投注记录归档');
        return { scanned: 0, archived: 0, deleted: 0 };
    }
    
    const Bet = mongoose.model('Bet');
    
    // 统计需要归档的记录数
    const cutoffDateTime = new Date(cutoffDate);
    const scanned = await Bet.countDocuments({ createdAt: { $lt: cutoffDateTime } });
    console.log(`  找到 ${scanned} 条需要归档的记录`);
    
    if (scanned === 0) {
        return { scanned: 0, archived: 0, deleted: 0 };
    }
    
    let archived = 0;
    let deleted = 0;
    let archiveFile = null;
    
    // 获取需要归档的记录
    const records = await Bet.find({ createdAt: { $lt: cutoffDateTime } }).lean();
    
    if (!options.dryRun && records.length > 0) {
        // 创建归档目录
        const archiveDir = path.join(options.archivePath, 'bets');
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
        }
        
        // 保存归档文件
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        archiveFile = path.join(archiveDir, `bets-${timestamp}.json`);
        fs.writeFileSync(archiveFile, JSON.stringify(records, null, 2));
        archived = records.length;
        console.log(`  已保存归档文件: ${archiveFile}`);
        
        // 分批删除记录
        let deletedCount = 0;
        while (true) {
            const result = await Bet.deleteMany({ 
                createdAt: { $lt: cutoffDateTime } 
            }).limit(options.batchSize);
            
            deletedCount += result.deletedCount;
            console.log(`  已删除 ${deletedCount}/${scanned} 条记录`);
            
            if (result.deletedCount === 0) break;
        }
        deleted = deletedCount;
    }
    
    return { scanned, archived, deleted, archiveFile };
}

/**
 * 获取数据库统计信息
 */
async function getStats(mongodbUri) {
    try {
        await mongoose.connect(mongodbUri, {
            maxPoolSize: 5,
            serverSelectionTimeoutMS: 10000
        });
        
        const stats = {
            users: await mongoose.model('User').countDocuments(),
            draws: await mongoose.model('Draw').countDocuments(),
            transactions: await mongoose.model('Transaction').countDocuments()
        };
        
        // 尝试获取投注统计
        try {
            stats.bets = await mongoose.model('Bet').countDocuments();
        } catch (e) {
            stats.bets = 0;
        }
        
        // 获取开奖记录日期范围
        const drawStats = await mongoose.model('Draw').aggregate([
            { $group: { _id: null, minDate: { $min: '$date' }, maxDate: { $max: '$date' }, count: { $sum: 1 } } }
        ]);
        
        if (drawStats.length > 0) {
            stats.drawDateRange = {
                min: drawStats[0].minDate,
                max: drawStats[0].maxDate,
                count: drawStats[0].count
            };
        }
        
        return stats;
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
        console.log('  # 执行归档清理');
        console.log('  MONGODB_URI="your-uri" node scripts/archive.js');
        console.log('\n  # 试运行模式（只统计不删除）');
        console.log('  MONGODB_URI="your-uri" DRY_RUN=true node scripts/archive.js');
        console.log('\n  # 自定义保留天数');
        console.log('  MONGODB_URI="your-uri" ARCHIVE_DAYS=30 node scripts/archive.js');
        process.exit(1);
    }
    
    const config = {
        dryRun: process.env.DRY_RUN === 'true',
        archiveDays: parseInt(process.env.ARCHIVE_DAYS) || 90,
        archivePath: process.env.ARCHIVE_PATH || './archives'
    };
    
    archiveData(mongodbUri, config).then(() => {
        process.exit(0);
    }).catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { archiveData, getStats };
