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

## 技术栈

- **后端**: Vercel Serverless Functions
- **数据库**: MongoDB Atlas
- **前端**: 纯HTML/CSS/JavaScript
- **认证**: JWT

## 项目结构

```
.
├── api/                    # Vercel Serverless Functions
│   ├── auth/              # 认证相关
│   ├── users/             # 用户管理
│   ├── draws/             # 开奖预设
│   ├── transactions/      # 交易管理
│   └── cron/              # 定时任务
├── models/                # 数据库模型
├── lib/                   # 工具库
├── public/                # 前端静态文件
├── package.json
├── vercel.json
└── README.md
```

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

- `MONGODB_URI`: MongoDB连接字符串
- `JWT_SECRET`: JWT签名密钥（随机字符串）
- `CRON_SECRET`: 定时任务调用密钥
- `ALLOWED_ORIGINS`: (可选) 允许的跨域来源，多个用逗号分隔，默认允许所有来源

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
