# 免费额度优化与部署指南

## 一、服务免费额度概览

本项目使用的云服务免费额度：

### 1. MongoDB Atlas 免费套餐
- **存储空间**: 512MB
- **共享内存**: 适合小型应用
- **无信用卡要求**
- **足够支持**: 约10万条投注记录（每月）

### 2. Vercel 免费套餐
- **带宽**: 100GB/月
- **Serverless函数执行时间**: 100GB-Hrs/月
- **函数调用次数**: 无限制
- **构建时间**: 6000分钟/月

### 3. Upstash Redis 免费套餐（可选）
- **命令数**: 10,000次/天
- **存储**: 256MB
- **适合**: 缓存热点数据

## 二、月度使用估算

### 数据量估算（每日288期 × 30天）

| 数据类型 | 每月新增 | 累计估算 |
|---------|---------|---------|
| 开奖记录 | 8,640条 | ~8.6KB |
| 投注记录 | 约3万条 | ~15MB |
| 交易记录 | 约1千条 | ~500KB |
| 用户数据 | 约100条 | ~50KB |

**结论**: MongoDB 512MB免费额度足够使用1年以上。

### API调用量估算

| 接口类型 | 每日调用 | 每月调用 |
|---------|---------|---------|
| 开奖检查cron | 1,440次 | 43,200次 |
| 用户操作 | 约500次 | 15,000次 |
| 投注操作 | 约1,000次 | 30,000次 |

**结论**: Vercel免费额度完全足够。

## 三、优化策略

### 1. 数据库优化

```javascript
// 已实现的优化
// 1. 连接池复用
mongoose.connect(uri, {
    maxPoolSize: 10,      // 最大连接数
    minPoolSize: 2,       // 最小连接数
    serverSelectionTimeoutMS: 5000
});

// 2. 索引优化（已添加）
// - 用户名唯一索引
// - 日期+周期+期号复合索引
// - 状态+时间复合索引

// 3. 分页查询
const skip = (page - 1) * limit;
const results = await Model.find().skip(skip).limit(limit);
```

### 2. 缓存策略

```javascript
// Redis缓存（可选，未配置时自动降级）
// - 开奖结果缓存: 24小时TTL
// - 用户余额缓存: 1小时TTL

// 无Redis时的内存缓存降级
const memoryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

function getCached(key) {
    const item = memoryCache.get(key);
    if (item && Date.now() - item.time < CACHE_TTL) {
        return item.data;
    }
    return null;
}
```

### 3. 数据归档

```bash
# 定期归档90天前的数据
# 通过API触发
curl -X POST https://your-app.vercel.app/api/admin/archive \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"archiveDays":90}'
```

## 四、Vercel部署步骤

### 步骤1: 准备MongoDB Atlas

1. 访问 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. 创建免费集群（选择最近的区域）
3. 创建数据库用户
4. 配置网络访问（允许所有IP: 0.0.0.0/0）
5. 获取连接字符串

### 步骤2: 部署到Vercel

1. 将代码推送到GitHub
2. 访问 [Vercel](https://vercel.com)
3. 导入GitHub仓库
4. 配置环境变量：

```
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/lottery
JWT_SECRET=your-random-secret-string-here
CRON_SECRET=your-cron-secret-string
```

5. 点击Deploy

### 步骤3: 配置定时任务

使用外部cron服务（如cron-job.org）：
- **URL**: `https://your-app.vercel.app/api/cron/check-draws?secret=YOUR_CRON_SECRET`
- **频率**: 每分钟一次
- **方法**: GET

### 步骤4: 初始化管理员

```bash
# 部署后执行
curl -X POST https://your-app.vercel.app/api/admin/init \
  -H "Content-Type: application/json" \
  -d '{"secret":"your-jwt-secret"}'
```

## 五、环境变量配置

### 必需变量

| 变量名 | 说明 | 示例 |
|-------|------|------|
| `MONGODB_URI` | MongoDB连接字符串 | `mongodb+srv://...` |
| `JWT_SECRET` | JWT签名密钥 | 随机字符串，至少32位 |
| `CRON_SECRET` | 定时任务密钥 | 随机字符串 |

### 可选变量

| 变量名 | 说明 | 默认值 |
|-------|------|-------|
| `REDIS_URL` | Redis连接URL | 无（禁用缓存） |
| `ALLOWED_ORIGINS` | 允许的跨域域名 | `*`（所有） |
| `DB_POOL_SIZE` | 数据库连接池大小 | 10 |

## 六、免费额度监控与告警 ⚠️

### 1. MongoDB Atlas M0 免费套餐

| 资源 | 免费额度 | 监控指标 | 告警阈值 |
|------|---------|---------|---------|
| 存储 | 512MB | 存储使用量 | > 400MB (80%) |
| 连接数 | 500 | 当前连接数 | > 400 |
| 备份 | 每日1次 | 保留1天 | ⚠️ 需手动导出 |

**监控设置步骤：**
1. Atlas Dashboard → Alerts → Add Alert
2. 配置存储告警：`Data Size > 400MB`
3. 配置连接数告警：`Connections > 400`

**⚠️ 数据备份提醒：**
- M0免费套餐仅保留1天备份
- 建议每月手动导出数据
- 导出命令：
```bash
# 使用mongodump导出
mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/lottery" --out=./backup

# 或使用mongoexport导出CSV
mongoexport --uri="..." --collection=bets --type=csv --out=bets.csv
```

### 2. Vercel Hobby 免费套餐

| 资源 | 免费额度 | 月使用估算 | 利用率 |
|------|---------|-----------|-------|
| 带宽 | 100GB/月 | ~5GB | ~5% |
| 函数调用 | 100万次/月 | ~43,200次 | ~4% |
| 函数执行时间 | 100GB-Hrs | ~2GB-Hrs | ~2% |
| 构建时间 | 6000分钟/月 | ~100分钟 | ~2% |

**单期开奖任务调用量计算：**
```
每分钟1次 × 60分钟 × 24小时 × 30天 = 43,200次/月
```
**结论**：远低于100万次限制，非常安全！

**监控设置：**
1. Vercel Dashboard → Usage
2. 关注 Bandwidth 和 Serverless Functions
3. 设置用量邮件通知（默认已开启）

### 3. cron-job.org 免费服务

| 特性 | 说明 |
|------|------|
| 价格 | 完全免费 |
| 执行频率 | 每分钟执行一次 ✅ |
| 超时时间 | 30秒 |
| 失败重试 | 支持（建议开启） |

**监控配置：**
1. 登录 cron-job.org
2. 创建任务时勾选 "Enable failure notifications"
3. 设置备用通知邮箱

### 4. 监控检查清单

| 检查项 | 频率 | 方法 |
|--------|------|------|
| MongoDB存储 | 每周 | Atlas Dashboard |
| Vercel带宽 | 每周 | Vercel Dashboard |
| 数据备份 | 每月 | 手动导出 |
| API错误日志 | 每周 | Vercel Logs |
| Cron执行状态 | 每天 | cron-job.org Dashboard |

### 5. 超限预警处理

**MongoDB存储即将满（>400MB）：**
```bash
# 1. 归档旧数据
curl -X POST https://your-app.vercel.app/api/admin/archive \
  -H "Authorization: Bearer TOKEN" \
  -d '{"archiveDays":60}'

# 2. 删除已归档数据（需手动在Atlas执行）
```

**Vercel带宽超限：**
- 检查是否有异常流量
- 考虑启用CDN缓存
- 升级到Pro套餐（$20/月）

## 七、故障排查

### 常见问题

1. **数据库连接失败**
   - 检查MONGODB_URI格式
   - 确认IP白名单已添加
   - 检查用户名密码

2. **API超时**
   - 检查数据库索引是否正确
   - 减少分页limit值
   - 启用Redis缓存

3. **定时任务不执行**
   - 确认CRON_SECRET正确
   - 检查cron服务配置
   - 查看Vercel函数日志

## 八、成本预估

### 免费额度使用

| 服务 | 月使用量 | 免费额度 | 利用率 |
|-----|---------|---------|-------|
| MongoDB | ~20MB | 512MB | ~4% |
| Vercel | ~10GB-Hrs | 100GB-Hrs | ~10% |
| Upstash | ~5K命令/天 | 10K命令/天 | ~50% |

### 升级建议

当出现以下情况时考虑升级：
- MongoDB存储 > 400MB
- Vercel带宽 > 80GB/月
- 并发用户 > 100
