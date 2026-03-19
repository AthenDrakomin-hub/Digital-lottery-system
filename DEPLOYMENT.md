# 部署指南

## 前置要求

1. **MongoDB Atlas账户**（免费）
   - 访问 https://www.mongodb.com/cloud/atlas
   - 创建免费集群
   - 创建数据库用户
   - 获取连接字符串

2. **Vercel账户**（免费）
   - 访问 https://vercel.com
   - 使用GitHub登录

3. **GitHub账户**（可选，用于托管代码）

## 快速部署

### 方式一：Vercel部署（推荐）

#### 步骤1：准备代码

1. 将代码推送到GitHub仓库

#### 步骤2：在Vercel导入项目

1. 登录 Vercel
2. 点击 "New Project"
3. 导入你的GitHub仓库
4. Vercel会自动检测到项目配置

#### 步骤3：配置环境变量

在Vercel项目设置中添加以下环境变量：

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/lottery?retryWrites=true&w=majority
JWT_SECRET=your-random-secret-key-at-least-32-characters-long
CRON_SECRET=your-random-cron-secret-key
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

**跨域配置说明**：
- `ALLOWED_ORIGINS`（可选）：限制允许跨域访问的域名，多个域名用逗号分隔
- 如不设置 `ALLOWED_ORIGINS`，默认允许所有来源（`*`）访问API
- 生产环境建议设置具体域名，提高安全性

#### 步骤4：部署

点击 "Deploy" 按钮，等待部署完成

#### 步骤5：创建管理员账户

部署完成后，使用注册页面创建账户，然后在MongoDB Atlas中将该用户的`role`字段改为`'admin'`

### 方式二：本地开发

#### 步骤1：安装依赖

```bash
pnpm install
```

#### 步骤2：配置环境变量

创建`.env`文件：

```env
MONGODB_URI=mongodb://localhost:27017/lottery
JWT_SECRET=your-random-secret-key
CRON_SECRET=your-random-cron-secret
```

#### 步骤3：启动MongoDB

确保本地MongoDB服务正在运行，或使用Docker：

```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

#### 步骤4：启动开发服务器

```bash
pnpm run dev
```

访问 http://localhost:5000

## 定时开奖配置

### 使用cron-job.org

1. 访问 https://cron-job.org
2. 创建免费账户
3. 创建新任务：
   - URL: `https://your-app.vercel.app/api/cron/check-draws?secret=YOUR_CRON_SECRET`
   - 执行频率：每分钟
   - 时区：选择你的时区

### 使用Vercel Cron（Pro功能）

在`vercel.json`中添加：

```json
{
  "crons": [{
    "path": "/api/cron/check-draws?secret=YOUR_CRON_SECRET",
    "schedule": "* * * * *"
  }]
}
```

## 项目结构说明

```
.
├── api/                    # Vercel Serverless Functions
│   ├── auth/              # 认证相关
│   │   ├── register.js    # 用户注册
│   │   ├── login.js       # 用户登录
│   │   └── me.js          # 获取用户信息
│   ├── users/             # 用户管理
│   │   ├── index.js       # 用户列表
│   │   ├── [id].js        # 用户详情/禁用
│   │   └── balance.js     # 调整余额
│   ├── draws/             # 开奖预设
│   │   ├── index.js       # 获取/保存预设
│   │   └── daily.js       # 获取每日预设
│   ├── transactions/      # 交易管理
│   │   ├── index.js       # 交易记录/审核
│   │   └── request.js     # 充值/提现申请
│   ├── cron/              # 定时任务
│   │   └── check-draws.js # 开奖检查
│   └── admin/             # 管理员中间件
│       └── verify.js
├── models/                # 数据库模型
│   ├── User.js           # 用户模型
│   ├── Draw.js           # 开奖模型
│   └── Transaction.js    # 交易模型
├── lib/                   # 工具库
│   ├── db.js             # 数据库连接
│   └── auth.js           # JWT工具
├── public/                # 前端静态文件
│   ├── index.html        # 首页
│   ├── login.html        # 登录页
│   ├── register.html     # 注册页
│   ├── dashboard.html    # 管理后台
│   └── style.css         # 样式文件
├── server.js              # 本地开发服务器
├── package.json
├── vercel.json            # Vercel配置
└── README.md
```

## 功能说明

### 用户角色

- **管理员 (admin)**：可以预设开奖结果、管理用户、审核交易
- **普通用户 (user)**：可以查看开奖结果、申请充值/提现

### 开奖周期

- **5分钟周期**：每天288期（00:00 - 23:55）
- **10分钟周期**：每天144期（00:00 - 23:50）
- **15分钟周期**：每天96期（00:00 - 23:45）

### 开奖流程

1. 管理员预设开奖结果（可选）
2. 定时任务每分钟检查是否需要开奖
3. 如有预设则使用预设结果，否则随机生成
4. 记录开奖结果到数据库

## 常见问题

### Q: 如何创建管理员账户？

A: 首次部署后，使用注册页面创建账户，然后在MongoDB中找到该用户，将`role`字段改为`'admin'`

### Q: 忘记密码怎么办？

A: 管理员可以在MongoDB中找到用户，使用bcrypt重新生成密码hash

### Q: 如何修改开奖周期？

A: 修改`models/Draw.js`中的`interval`枚举值，并更新前端下拉框选项

### Q: 数据库连接失败？

A: 检查`MONGODB_URI`环境变量是否正确，确保IP白名单包含`0.0.0.0/0`（开发环境）

## 安全建议

1. **生产环境**务必使用强密码作为`JWT_SECRET`
2. 定期更换`JWT_SECRET`会使所有token失效
3. 使用HTTPS（Vercel自动提供）
4. 定期备份数据库
5. 限制管理员账户数量
6. 定期检查交易记录

## 技术支持

如有问题，请查看：
- Vercel部署日志
- MongoDB Atlas日志
- 浏览器控制台错误

## 许可证

MIT License
