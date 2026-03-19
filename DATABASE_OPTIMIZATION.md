# 数据库优化指南

## 一、索引优化

### 1. User模型索引
```javascript
// 已创建的索引
{ username: 1 }                    // 唯一索引（自动创建）
{ createdAt: -1 }                  // 按注册时间排序
{ role: 1, isActive: 1 }           // 管理员查询活跃用户
{ balance: -1 }                    // 余额排序
```

**适用场景**：
- 用户列表查询
- 管理员筛选活跃用户
- 按余额排序

### 2. Draw模型索引
```javascript
// 已创建的索引
{ date: 1, interval: 1, period: 1 }      // 唯一约束
{ date: -1 }                              // 按日期倒序
{ interval: 1, date: -1 }                 // 按周期和日期
{ status: 1, date: -1 }                   // 按状态和日期
{ updatedAt: -1 }                         // 按更新时间
{ date: 1, status: 1, interval: 1 }       // 复合查询优化
```

**适用场景**：
- 获取某日开奖预设（最常用）
- 按日期范围查询历史记录
- 按状态筛选待开奖/已开奖记录

### 3. Transaction模型索引
```javascript
// 已创建的索引
{ userId: 1, createdAt: -1 }              // 用户交易记录
{ status: 1, createdAt: -1 }              // 待处理交易
{ userId: 1, status: 1 }                  // 用户待处理交易
{ type: 1, status: 1, createdAt: -1 }     // 按类型和状态
{ createdAt: -1 }                         // 按时间倒序
{ processedBy: 1 }                        // 按处理人
{ processedAt: -1 }                       // 按处理时间
```

**适用场景**：
- 用户查询自己的交易记录
- 管理员查询待审核交易
- 交易统计分析

### 4. Bet模型索引（投注功能）
```javascript
// 已创建的索引
{ userId: 1, createdAt: -1 }              // 用户投注历史
{ userId: 1, status: 1 }                  // 用户待结算投注
{ status: 1, createdAt: -1 }              // 待结算投注列表
{ date: 1, interval: 1, period: 1, status: 1 }  // 按期号查询待结算（重要！）
{ date: 1, status: 1 }                    // 按日期查询待结算
{ userId: 1, date: 1, status: 1 }         // 用户某日投注
{ date: 1, interval: 1, userId: 1 }       // 按日期周期用户查询
{ createdAt: -1 }                         // 按时间倒序
{ betType: 1, createdAt: -1 }             // 按玩法统计
```

**适用场景**：
- 开奖时批量结算投注（最关键）
- 用户查看投注历史
- 投注统计分析

---

## 二、数据库连接优化

### 环境变量配置
```bash
# 基础配置
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/lottery

# 连接池配置（可选）
DB_POOL_SIZE=10              # 最大连接数（免费集群建议5-10）
DB_MIN_POOL_SIZE=2           # 最小连接数

# 读写分离配置（需要副本集）
DB_READ_PREFERENCE=secondaryPreferred  # 读偏好

# 写关注配置
DB_WRITE_CONCERN=majority    # 写关注级别
```

### 连接池优化
```javascript
// lib/db.js 已配置
{
    maxPoolSize: 10,         // 最大连接数
    minPoolSize: 2,          // 最小连接数
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,       // 自动重试写入
    retryReads: true,        // 自动重试读取
}
```

### MongoDB Atlas 免费集群限制
- 最大连接数：100
- 存储：512MB
- 建议连接池大小：5-10

---

## 三、数据归档清理

### 为什么需要归档？
- 保持数据库轻盈，提升查询性能
- 节省存储空间（免费集群512MB限制）
- 历史数据可归档到文件或对象存储

### 归档策略
- **开奖记录**：保留最近90天
- **投注记录**：保留最近90天（已结算的）
- **交易记录**：建议长期保留或保留1年

### 方式一：API归档

```bash
# 查看数据库统计
curl https://your-app.vercel.app/api/admin/archive

# 执行归档（试运行）
curl -X POST https://your-app.vercel.app/api/admin/archive \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"secret":"your-jwt-secret","dryRun":true}'

# 执行归档（实际删除）
curl -X POST https://your-app.vercel.app/api/admin/archive \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"secret":"your-jwt-secret","archiveDays":90,"models":["Draw"]}'
```

### 方式二：命令行归档

```bash
# 试运行（只统计不删除）
MONGODB_URI="your-uri" DRY_RUN=true node scripts/archive.js

# 执行归档
MONGODB_URI="your-uri" node scripts/archive.js

# 自定义保留天数
MONGODB_URI="your-uri" ARCHIVE_DAYS=30 node scripts/archive.js
```

### 定时归档（推荐）

使用 cron-job.org 每周执行一次：

```
URL: https://your-app.vercel.app/api/admin/archive
Method: POST
Headers: 
  Content-Type: application/json
  Authorization: Bearer YOUR_ADMIN_TOKEN
Body: 
  {"secret":"your-jwt-secret","archiveDays":90,"models":["Draw","Bet"]}
Schedule: 每周日凌晨3点
```

---

## 四、读写分离（高级）

### 前提条件
- MongoDB Atlas 集群需要是副本集（Replica Set）
- 免费的M0集群已支持全球读分布，但不支持自定义读偏好

### 配置读偏好
```bash
# 环境变量
DB_READ_PREFERENCE=secondaryPreferred
```

### 读偏好选项
- `primary`：只从主节点读取（默认）
- `primaryPreferred`：优先主节点，不可用时从从节点读取
- `secondary`：只从从节点读取
- `secondaryPreferred`：优先从节点，不可用时从主节点读取
- `nearest`：从最近的节点读取（网络延迟最低）

### 使用场景
- **开奖结果写入**：主节点（默认）
- **历史开奖查询**：从节点（secondaryPreferred）
- **用户投注查询**：从节点（secondaryPreferred）

---

## 五、查询优化建议

### 1. 使用索引覆盖查询
```javascript
// ❌ 不推荐：查询所有字段
Draw.find({ date: '2024-01-01', interval: 5 })

// ✅ 推荐：只查询需要的字段
Draw.find({ date: '2024-01-01', interval: 5 }).select('period result status')
```

### 2. 分页查询
```javascript
// ❌ 不推荐：一次性获取所有数据
Draw.find({ date: '2024-01-01' })

// ✅ 推荐：分页查询
Draw.find({ date: '2024-01-01' })
    .skip(0)
    .limit(50)
    .sort('period')
```

### 3. 批量操作
```javascript
// ❌ 不推荐：循环单个插入
for (const item of items) {
    await Draw.create(item);
}

// ✅ 推荐：批量插入
await Draw.insertMany(items);

// ✅ 推荐：批量更新
await Draw.bulkWrite(operations);
```

### 4. 使用聚合管道
```javascript
// 统计各状态的开奖记录数
Draw.aggregate([
    { $match: { date: '2024-01-01' } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
]);
```

---

## 六、监控与诊断

### 查看索引使用情况
```javascript
// 在MongoDB Atlas控制台执行
db.draws.getIndexes()
db.draws.aggregate([{ $indexStats: {} }])
```

### 慢查询分析
```javascript
// 开启性能分析（仅开发环境）
db.setProfilingLevel(1, 50) // 记录超过50ms的查询

// 查看慢查询
db.system.profile.find().sort({ ts: -1 }).limit(10)
```

### Atlas监控
在MongoDB Atlas控制台可以查看：
- 连接数
- 查询延迟
- 读写操作次数
- 存储使用量

---

## 七、最佳实践

### 1. 避免全表扫描
- 确保查询条件使用了索引
- 使用 `.explain()` 检查查询计划

### 2. 合理使用投影
- 只查询需要的字段
- 避免返回大字段

### 3. 定期清理
- 设置定时归档任务
- 监控存储使用量

### 4. 连接管理
- 使用连接池
- 避免频繁创建连接
- Serverless环境复用连接

### 5. 错误处理
- 捕获连接错误
- 实现重试机制
- 优雅降级

---

## 八、数据量估算

### 单条记录大小
| 模型 | 平均大小 |
|------|----------|
| User | ~200 bytes |
| Draw | ~100 bytes |
| Transaction | ~150 bytes |
| Bet | ~200 bytes |

### 年度数据量估算
假设：
- 每天528条开奖记录（5+10+15分钟周期）
- 每天1000条投注记录
- 100个活跃用户

**开奖记录**：528 × 365 × 100 bytes ≈ 19MB/年  
**投注记录**：1000 × 365 × 200 bytes ≈ 73MB/年  
**用户数据**：100 × 200 bytes ≈ 0.02MB  

**总计**：约92MB/年，远低于512MB限制

### 归档后的数据量
归档90天前的数据后：
- 开奖记录：528 × 90 ≈ 47,520条 ≈ 4.7MB
- 投注记录：1000 × 90 ≈ 90,000条 ≈ 18MB

**总计**：约23MB，非常轻量

---

如有其他数据库优化需求，请随时联系！
