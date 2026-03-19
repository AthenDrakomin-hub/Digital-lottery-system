# 多用户彩票开奖管理系统

一个支持多种开奖周期的完整彩票开奖管理系统，支持每日288期（5分钟）、144期（10分钟）、96期（15分钟）的开奖结果预设。

## 功能特性

- ✅ 多周期开奖支持（5/10/15分钟）
- ✅ 用户注册/登录（JWT鉴权）
- ✅ 管理员预设开奖结果
- ✅ 用户资金管理（充值/提现）
- ✅ 管理员审核交易
- ✅ 用户账户管理
- ✅ 定时开奖检查（需外部cron触发）
- ✅ Redis缓存支持（开奖结果、用户余额）
- ✅ 消息队列处理异步任务
- ✅ 分布式锁确保幂等性
- ✅ 兜底补偿机制
- ✅ 投注API接口（供外部系统调用）

## 投注API服务

本系统提供投注API接口，供外部投注前端系统调用。

### 冠军玩法规则

**游戏规则**：
- 开奖结果为10位不重复数字（0-9），第一个数字为"冠军数字"
- 用户可选择1-5个数字进行投注，每个数字投注金额为2元
- 投注数字中只要有一个等于冠军数字即中奖，中奖固定获得19.5元
- 每期只能投注一次，开奖前1分钟停止投注

**赔率表**：

| 选择数字数 | 投注金额 | 中奖概率 | 赔率 | 中奖金额 |
|-----------|---------|---------|------|---------|
| 1个 | ¥2 | 10% | 9.75倍 | ¥19.5 |
| 2个 | ¥4 | 20% | 4.875倍 | ¥19.5 |
| 3个 | ¥6 | 30% | 3.25倍 | ¥19.5 |
| 4个 | ¥8 | 40% | 2.44倍 | ¥19.5 |
| 5个 | ¥10 | 50% | 1.95倍 | ¥19.5 |

### API接口

**获取投注配置**
```bash
GET /api/bets?interval=5
```

**提交投注**
```bash
POST /api/bets
Authorization: Bearer <token>
Content-Type: application/json

{
    "date": "2024-01-01",
    "interval": 5,
    "period": 10,
    "championNumbers": [1, 3, 5]
}
```

**获取期号信息**
```bash
GET /api/bets/period?interval=5
```

**获取投注历史**
```bash
GET /api/bets/history
Authorization: Bearer <token>
```

## 技术栈

- **后端**: Vercel Serverless Functions
- **数据库**: MongoDB Atlas
- **前端**: 纯HTML/CSS/JavaScript
- **认证**: JWT
- **缓存**: Redis（支持Upstash和标准Redis）

## 项目结构

```
.
├── api/                    # Vercel Serverless Functions
│   ├── auth/              # 认证相关
│   ├── users/             # 用户管理
│   ├── draws/             # 开奖预设
│   ├── transactions/      # 交易管理
│   ├── admin/             # 管理功能
│   └── cron/              # 定时任务
├── models/                # 数据库模型
├── lib/                   # 工具库
│   ├── db.js             # 数据库连接
│   ├── redis.js          # Redis连接
│   ├── cache.js          # 缓存服务
│   ├── auth.js           # 认证工具
│   ├── cors.js           # 跨域处理
│   ├── queue.js          # 消息队列
│   └── lock.js           # 分布式锁
├── workers/               # Worker进程
│   ├── settlement.js     # 开奖结算Worker
│   └── compensation.js   # 补偿Worker
├── scripts/               # 脚本工具
│   ├── init-admins.js    # 初始化管理员
│   └── archive.js        # 数据归档
├── public/                # 前端静态文件
├── package.json
├── vercel.json
└── README.md
```

## 定时任务可靠性

系统实现了完整的定时任务可靠性保障机制：

### 1. 消息队列处理异步任务

使用Redis Streams作为消息队列，处理开奖后的结算、通知等异步任务：

```javascript
// lib/queue.js - 消息队列模块
const { queue } = require('./lib/queue');

// 发布开奖结算任务
await queue.publishDrawSettlement({
    date: '2024-01-01',
    interval: 5,
    period: 10,
    result: '1234567890'
});
```

**优势**：
- 避免在API请求中直接处理耗时操作
- 支持任务重试和错误恢复
- 提高系统吞吐量

### 2. 幂等性设计

使用分布式锁确保同一开奖周期只执行一次结算：

```javascript
// lib/lock.js - 分布式锁模块
const { drawLock } = require('./lib/lock');

// 使用锁执行开奖结算
const result = await drawLock.withDrawLock(date, interval, period, async () => {
    // 执行结算逻辑
    return await processSettlement();
});
```

**幂等性保障**：
- 分布式锁防止并发执行
- 数据库唯一索引防止重复记录
- 状态检查防止重复处理

### 3. 兜底补偿机制

定期扫描数据库，检查并处理遗漏的开奖和结算：

```bash
# 检查遗漏情况
curl "https://your-app.vercel.app/api/cron/compensation?secret=YOUR_CRON_SECRET"

# 执行补偿（需要管理员权限）
curl -X POST "https://your-app.vercel.app/api/cron/compensation" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "all"}'
```

**补偿策略**：
- 自动扫描遗漏期号（每5分钟）
- 补开遗漏的开奖
- 补结算遗漏的投注
- 记录补偿日志

### 4. Worker进程

系统提供独立的Worker进程处理异步任务：

```bash
# 启动结算Worker
node -e "require('./workers/settlement').startWorker()"

# 启动补偿Worker
node -e "require('./workers/compensation').startWorker()"
```

**Worker特性**：
- 支持消息队列消费
- 自动重试失败任务
- 优雅降级处理

## 数据库优化

系统已进行全面的数据库优化：

### 索引优化
- **User模型**：用户名唯一索引、角色+状态索引、余额索引
- **Draw模型**：日期+周期+期号唯一索引、日期索引、状态索引
- **Transaction模型**：用户+时间索引、状态索引、类型+状态索引
- **Bet模型**：用户投注历史索引、期号结算索引（关键）

### 数据归档
定期清理超过90天的历史数据，保持数据库轻盈：

```bash
# 查看数据库统计
curl https://your-app.vercel.app/api/admin/archive

# 执行归档清理
curl -X POST https://your-app.vercel.app/api/admin/archive \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"secret":"your-jwt-secret","archiveDays":90}'
```

详细优化方案请查看 [DATABASE_OPTIMIZATION.md](./DATABASE_OPTIMIZATION.md)

## 默认管理员账户

系统预设三个管理员账户：

| 用户名 | 密码 |
|--------|------|
| admin001 | admin123 |
| admin002 | admin123 |
| admin003 | admin123 |

⚠️ **重要提示**：请在首次登录后立即修改默认密码！

### 初始化方式

**方式一：API初始化（推荐）**
```bash
# 检查初始化状态
curl https://your-app.vercel.app/api/admin/init

# 执行初始化（使用JWT_SECRET作为密钥）
curl -X POST https://your-app.vercel.app/api/admin/init \
  -H "Content-Type: application/json" \
  -d '{"secret":"your-jwt-secret"}'
```

**方式二：命令行初始化**
```bash
MONGODB_URI="your-mongodb-uri" node scripts/init-admins.js
```

## 环境变量

在Vercel项目设置中添加以下环境变量：

### 必需变量
- `MONGODB_URI`: MongoDB连接字符串
- `JWT_SECRET`: JWT签名密钥（随机字符串）
- `CRON_SECRET`: 定时任务调用密钥

### 可选变量
- `ALLOWED_ORIGINS`: 允许的跨域来源，多个用逗号分隔，默认允许所有来源

### Redis缓存配置（推荐）
- `REDIS_URL`: Redis连接字符串（支持标准Redis和Upstash）
  - 标准Redis格式: `redis://localhost:6379`
  - Upstash格式: `https://your-endpoint.upstash.io`
  - 带密码: `redis://:password@host:port` 或 `https://:password@endpoint`

**注意**: 如果未配置Redis，系统将正常工作但不使用缓存。

## Redis缓存策略

系统使用Redis缓存提升性能和并发能力：

### 缓存内容
1. **开奖结果缓存**
   - 缓存某日某周期的所有开奖预设
   - TTL: 24小时
   - 在管理员保存预设后自动失效

2. **用户余额缓存**
   - 缓存用户当前余额
   - TTL: 1小时
   - 在余额变动后自动更新

### 缓存效果
- 减少数据库查询次数
- 提升高频访问接口响应速度
- 支持更高并发访问

### 推荐Redis服务
- **Upstash Redis**: Serverless友好，按需付费
- **Redis Labs**: 免费套餐，适合小型项目
- **自建Redis**: 完全控制，适合私有部署

## 跨域支持

系统已内置完整的CORS支持，允许跨域API调用：

- 支持所有HTTP方法（GET、POST、PUT、PATCH、DELETE、OPTIONS）
- 支持常见请求头（Content-Type、Authorization等）
- 支持携带凭证（Cookies）
- 预检请求缓存24小时

**配置允许的域名**（生产环境推荐）：
```
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev
```

## 部署到Vercel

1. 将代码推送到GitHub
2. 在Vercel导入项目
3. 配置环境变量
4. 部署完成

## 定时开奖

使用外部cron服务（如cron-job.org）每分钟调用：

```
https://your-app.vercel.app/api/cron/check-draws?secret=YOUR_CRON_SECRET
```

## 默认管理员账户

首次部署后，需要手动在MongoDB中创建管理员账户，或使用注册接口创建普通用户后，在数据库中将其role改为'admin'。

## API文档

### 认证相关
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息

### 开奖预设
- `GET /api/draws/daily?date=YYYY-MM-DD&interval=5` - 获取某日预设
- `POST /api/draws` - 批量保存预设（需管理员权限）

### 用户管理
- `GET /api/users` - 获取用户列表（需管理员权限）
- `PATCH /api/users/[id]` - 禁用/启用用户（需管理员权限）
- `POST /api/users/balance` - 调整用户余额（需管理员权限）

### 交易管理
- `GET /api/transactions` - 获取交易记录
- `POST /api/transactions/request` - 提交充值/提现申请
- `PATCH /api/transactions/[id]` - 审核交易（需管理员权限）

## 许可证

MIT
