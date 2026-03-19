# 数字开奖管理系统

一个完整的数字开奖管理系统，支持多周期开奖（5/10/15分钟）、用户投注、资金管理、自动结算等功能。

## 功能特性

### 核心功能
- ✅ 多周期开奖支持（5/10/15分钟，每日最多288期）
- ✅ 用户注册/登录（JWT鉴权）
- ✅ 冠军玩法投注（选择数字，猜中第一位即中奖）
- ✅ 用户资金管理（充值/提现）
- ✅ 管理员审核交易
- ✅ 定时自动开奖结算

### 高级功能
- ✅ Redis缓存支持（开奖结果、用户余额）
- ✅ 消息队列处理异步任务
- ✅ 分布式锁确保幂等性
- ✅ 兜底补偿机制
- ✅ 风控系统（限流、黑名单、异常检测）
- ✅ 第三方支付回调（支付宝/微信）
- ✅ 提现自动处理（代付）
- ✅ 日志服务集成（Axiom/Logtail）

---

## 快速开始

### 环境要求
- Node.js 18+
- MongoDB（推荐 MongoDB Atlas 免费套餐）
- Redis（可选，用于缓存）

### 本地开发

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入实际配置

# 启动开发服务器
pnpm run dev
```

### 部署到Vercel

1. 推送代码到 GitHub
2. 在 Vercel 导入项目
3. 配置环境变量（见下方说明）
4. 部署完成
5. 配置定时任务（cron-job.org）

详细部署步骤请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## API 文档

**5个合并后的 Serverless Functions，满足 Vercel Hobby 套餐限制**

详细接口文档请查看 [API_DOC.md](./API_DOC.md)

### 认证模块 (auth.js)

| 路由 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/auth?action=register` | POST | 用户注册 | 公开 |
| `/api/auth?action=login` | POST | 用户登录 | 公开 |
| `/api/auth?action=me` | GET | 获取当前用户信息 | 登录 |
| `/api/auth?action=change-password` | POST | 修改密码 | 登录 |

### 用户管理模块 (users.js)

| 路由 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/users` | GET | 获取用户列表 | 管理员 |
| `/api/users?action=create` | POST | 创建用户 | 管理员 |
| `/api/users?action=balance` | POST | 调整用户余额 | 管理员 |
| `/api/users?id=xxx` | GET | 获取用户详情 | 管理员 |
| `/api/users?id=xxx` | PUT | 更新用户 | 管理员 |
| `/api/users?id=xxx` | DELETE | 删除用户（软删除） | 管理员 |

### 交易管理模块 (transactions.js)

| 路由 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/transactions` | GET | 获取交易记录 | 登录 |
| `/api/transactions` | PATCH | 批量审核交易 | 管理员 |
| `/api/transactions?action=request` | POST | 提交充值/提现申请 | 登录 |
| `/api/transactions?id=xxx` | GET | 获取交易详情 | 登录 |
| `/api/transactions?id=xxx&action=approve` | POST | 批准交易 | 管理员 |
| `/api/transactions?id=xxx&action=reject` | POST | 拒绝交易 | 管理员 |
| `/api/transactions?id=xxx` | DELETE | 取消交易 | 登录 |

### 管理员模块 (admin.js)

| 路由 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/admin?action=init` | GET | 检查初始化状态 | 公开 |
| `/api/admin?action=init` | POST | 执行初始化 | 内部 |
| `/api/admin?action=verify` | GET | 验证管理员权限 | 管理员 |
| `/api/admin?action=archive` | GET | 获取数据库统计 | 管理员 |
| `/api/admin?action=archive` | POST | 执行归档清理 | 管理员 |
| `/api/admin?action=stats` | GET | 获取运营统计 | 管理员 |

### 系统模块 (system.js)

通过 `type` 参数一级分发，支持开奖、投注、定时任务、支付回调。

| 路由 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/system?type=draws` | GET | 获取开奖列表 | 登录 |
| `/api/system?type=draws` | POST | 批量保存开奖预设 | 管理员 |
| `/api/system?type=draws&action=daily` | GET | 获取每日开奖 | 公开 |
| `/api/system?type=draws&id=xxx` | PUT | 更新开奖结果 | 管理员 |
| `/api/system?type=bets` | GET | 获取投注配置 | 公开 |
| `/api/system?type=bets` | POST | 提交投注 | 登录 |
| `/api/system?type=bets&action=period` | GET | 获取期号信息 | 公开 |
| `/api/system?type=bets&action=history` | GET | 获取投注历史 | 登录 |
| `/api/system?type=cron&action=check-draws` | GET | 自动开奖结算 | 定时服务 |
| `/api/system?type=payment&action=alipay` | POST | 支付宝回调 | 支付宝 |
| `/api/draws` | GET | 获取开奖列表 | 登录 |
| `/api/draws` | POST | 创建开奖结果 | 管理员 |
| `/api/draws/daily` | GET | 获取某日开奖预设 | 公开 |
| `/api/draws/:id` | GET | 获取开奖详情 | 登录 |
| `/api/draws/:id` | PUT | 更新开奖结果 | 管理员 |
| `/api/draws/:id` | DELETE | 删除开奖记录 | 管理员 |

### 投注管理接口 (8个)

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/bets` | GET | 获取投注配置/列表 | 公开/登录 |
| `/api/bets` | POST | 提交投注 | 登录 |
| `/api/bets/period` | GET | 获取期号信息 | 公开 |
| `/api/bets/history` | GET | 获取投注历史 | 登录 |
| `/api/bets/admin` | GET | 获取所有投注 | 管理员 |
| `/api/bets/:id` | GET | 获取投注详情 | 登录 |
| `/api/bets/:id` | DELETE | 取消投注 | 登录 |
| `/api/bets/:id/status` | PATCH | 修改投注状态 | 管理员 |

### 定时任务接口 (2个)

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/cron/check-draws` | GET | 自动开奖结算 | CRON_SECRET |
| `/api/cron/compensation` | GET/POST | 补偿机制 | 管理员 |

### 管理员接口 (4个)

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/admin/init` | GET/POST | 初始化系统 | 内部 |
| `/api/admin/archive` | GET/POST | 数据归档 | 管理员 |
| `/api/admin/verify` | GET | 验证管理员权限 | 管理员 |
| `/api/admin/stats` | GET | 获取统计数据 | 管理员 |

### 支付回调接口 (4个)

| 接口 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/api/payment/alipay/notify` | POST | 支付宝支付回调 | 支付宝 |
| `/api/payment/wechat/notify` | POST | 微信支付回调 | 微信 |
| `/api/payment/payout/process` | POST | 提现自动处理 | 内部 |
| `/api/payment/payout/callback` | POST | 代付结果回调 | 第三方 |

---

## 投注玩法说明

### 冠军玩法

**规则**：猜开奖结果的第一位数字

**投注示例**：
```json
POST /api/bets
Authorization: Bearer <token>
{
    "date": "2024-01-01",
    "interval": 5,
    "period": 10,
    "championNumbers": [1, 3, 5]
}
```

**赔率表**：

| 选择数字数 | 投注金额 | 中奖金额 | 赔率 | 中奖概率 |
|-----------|---------|---------|------|---------|
| 1个 | ¥2 | ¥19.5 | 9.75 | 10% |
| 2个 | ¥4 | ¥19.5 | 4.875 | 20% |
| 3个 | ¥6 | ¥19.5 | 3.25 | 30% |
| 4个 | ¥8 | ¥19.5 | 2.4375 | 40% |
| 5个 | ¥10 | ¥19.5 | 1.95 | 50% |

**结算逻辑**：
```
开奖结果: "5820913746"
冠军数字: result[0] = 5
投注: championNumbers = [3, 5, 7]
结果: 5 ∈ [3, 5, 7] → 中奖 ¥19.5
```

---

## 风控系统

### 限流规则

| 接口类型 | 限制 | 存储方式 |
|----------|------|---------|
| 投注 | 10次/分钟 | Redis/内存 |
| 充值 | 3次/分钟 | Redis/内存 |
| 提现 | 1次/分钟 | Redis/内存 |
| 登录 | 5次/分钟 | Redis/内存 |

### 风控规则

| 规则 | 限制 | 级别 |
|------|------|------|
| 单期投注金额 | 无限制 | - |
| 单期投注次数 | 1次 | 高 |
| 单日投注金额 | 无限制 | - |
| 单日提现金额 | ¥50,000 | 高 |
| 单日提现次数 | 5次 | 中 |
| 异常倍投检测 | 10倍 | 中 |

---

## 数据库模型

### User（用户）

| 字段 | 类型 | 说明 |
|------|------|------|
| username | String | 用户名（唯一） |
| password | String | 密码（bcrypt加密） |
| role | String | 角色：user/admin |
| balance | Number | 余额 |
| isActive | Boolean | 是否启用 |

### Draw（开奖）

| 字段 | 类型 | 说明 |
|------|------|------|
| date | String | 日期 YYYY-MM-DD |
| interval | Number | 周期（5/10/15分钟） |
| period | Number | 期号（0-based） |
| result | String | 10位数字结果 |
| status | String | 状态：pending/drawn/settled |

### Bet（投注）

| 字段 | 类型 | 说明 |
|------|------|------|
| userId | ObjectId | 用户ID |
| date | String | 开奖日期 |
| interval | Number | 周期 |
| period | Number | 期号 |
| championNumbers | [Number] | 投注数字 |
| amount | Number | 投注金额 |
| status | String | 状态：pending/won/lost |
| winAmount | Number | 中奖金额 |

### Transaction（交易）

| 字段 | 类型 | 说明 |
|------|------|------|
| userId | ObjectId | 用户ID |
| type | String | 类型：deposit/withdraw |
| amount | Number | 金额 |
| status | String | 状态：pending/approved/completed |
| paymentInfo | Object | 支付信息 |

---

## 项目结构

```
.
├── api/                          # Vercel Serverless Functions (5个)
│   ├── auth.js                   # 认证模块（注册/登录/用户信息/修改密码）
│   ├── users.js                  # 用户管理模块（列表/创建/详情/更新/删除/余额）
│   ├── transactions.js           # 交易管理模块（列表/申请/详情/取消/审核）
│   ├── admin.js                  # 管理员模块（初始化/验证/归档/统计）
│   └── system.js                 # 系统模块（开奖/投注/定时/支付）
├── models/                       # 数据库模型
│   ├── User.js
│   ├── Draw.js
│   ├── Bet.js
│   └── Transaction.js
├── lib/                          # 工具库
│   ├── db.js                     # 数据库连接
│   ├── redis.js                  # Redis连接
│   ├── cache.js                  # 缓存服务
│   ├── auth.js                   # 认证工具
│   ├── cors.js                   # 跨域处理
│   ├── queue.js                  # 消息队列
│   ├── lock.js                   # 分布式锁
│   ├── rateLimiter.js            # 限流中间件
│   ├── riskControl.js            # 风控检查
│   └── logger.js                 # 日志服务
├── middleware/                   # 中间件
│   ├── auth.js                   # 认证中间件
│   ├── error.js                  # 错误处理中间件
│   └── validator.js              # 参数验证中间件
├── workers/                      # Worker进程
│   ├── settlement.js             # 开奖结算Worker
│   └── compensation.js           # 补偿Worker
├── scripts/                      # 脚本工具
│   ├── init-admins.js            # 初始化管理员
│   └── archive.js                # 数据归档
├── public/                       # 前端静态文件
│   └── index.html
├── package.json
├── vercel.json
├── README.md
├── DEPLOYMENT.md
└── DATABASE_OPTIMIZATION.md
```

---

## 环境变量配置

### 必需变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `MONGODB_URI` | MongoDB连接字符串 | `mongodb+srv://...` |
| `JWT_SECRET` | JWT签名密钥 | 随机字符串，至少32位 |
| `CRON_SECRET` | 定时任务密钥 | 随机字符串 |

### 支付配置（可选）

| 变量名 | 说明 |
|--------|------|
| `ALIPAY_APP_ID` | 支付宝应用ID |
| `ALIPAY_PUBLIC_KEY` | 支付宝公钥 |
| `ALIPAY_PRIVATE_KEY` | 应用私钥 |
| `WECHAT_APP_ID` | 微信应用ID |
| `WECHAT_MCH_ID` | 微信商户号 |
| `WECHAT_API_KEY` | 微信API密钥 |

### 日志配置（可选）

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `LOG_SERVICE` | 日志服务 | `console` |
| `LOG_LEVEL` | 日志级别 | `info` |
| `AXIOM_DATASET` | Axiom数据集 | - |
| `AXIOM_TOKEN` | Axiom Token | - |

### 其他可选变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `REDIS_URL` | Redis连接URL | 无 |
| `ALLOWED_ORIGINS` | 允许跨域域名 | `*` |

---

## 默认管理员账户

系统预设三个管理员账户：

| 用户名 | 密码 |
|--------|------|
| admin001 | admin123 |
| admin002 | admin123 |
| admin003 | admin123 |

⚠️ **重要**：请在首次登录后立即修改默认密码！

### 初始化管理员

```bash
# 方式一：API初始化
curl -X POST https://your-app.vercel.app/api/admin/init \
  -H "Content-Type: application/json" \
  -d '{"secret":"your-jwt-secret"}'

# 方式二：命令行初始化
MONGODB_URI="your-mongodb-uri" node scripts/init-admins.js
```

---

## 定时任务配置

### 使用 cron-job.org

| 配置项 | 值 |
|--------|-----|
| URL | `https://your-app.vercel.app/api/cron/check-draws?secret=YOUR_CRON_SECRET` |
| 频率 | 每分钟 (`* * * * *`) |
| 方法 | GET |
| 超时 | 30秒 |

### API密钥（用于程序化管理）
```
API Key: tCEFJYhQyEbRwlTV9rbuxu27cw1LuysOecCXiX7vk0A=
```

---

## 许可证

MIT

---

## 测试

### API集成测试

```bash
# 确保服务已启动（端口5000）
# 运行测试脚本
chmod +x scripts/test-api.sh
./scripts/test-api.sh

# 或指定服务地址
./scripts/test-api.sh https://your-app.vercel.app
```

### 类型检查

```bash
npx tsc --noEmit
```
