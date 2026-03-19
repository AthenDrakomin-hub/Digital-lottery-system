# 客户端接入文档

本文档为前端开发者提供API接入指南。

---

## 1. 基础信息

### 1.1 服务地址

| 环境 | 地址 |
|------|------|
| 生产环境 | `https://your-app.vercel.app/api` |
| 开发环境 | `http://localhost:5000/api` |

### 1.2 响应格式

所有响应均为 JSON 格式：

**成功响应**
```json
{
    "id": "507f1f77bcf86cd799439011",
    "username": "testuser",
    "balance": 100
}
```

**失败响应**
```json
{
    "error": "用户名已存在",
    "code": "DUPLICATE"
}
```

### 1.3 认证方式

使用 JWT Bearer Token 认证：

```http
Authorization: Bearer <your_token>
```

Token 通过登录接口获取，有效期 7 天。

### 1.4 分页参数

支持分页的接口使用统一参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `page` | 页码（从1开始） | 1 |
| `limit` | 每页数量 | 20 |

分页响应格式：
```json
{
    "items": [...],
    "pagination": {
        "page": 1,
        "limit": 20,
        "total": 100,
        "pages": 5
    }
}
```

---

## 2. 认证模块

### 2.1 用户注册

**POST** `/api/auth/register`

**请求体**
```json
{
    "username": "testuser",
    "password": "123456"
}
```

**响应**
```json
{
    "message": "注册成功",
    "user": {
        "id": "507f1f77bcf86cd799439011",
        "username": "testuser",
        "role": "user",
        "balance": 0
    }
}
```

### 2.2 用户登录

**POST** `/api/auth/login`

**请求体**
```json
{
    "username": "testuser",
    "password": "123456"
}
```

**响应**
```json
{
    "message": "登录成功",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
        "id": "507f1f77bcf86cd799439011",
        "username": "testuser",
        "role": "user",
        "balance": 100
    }
}
```

### 2.3 获取当前用户

**GET** `/api/auth/me`

**请求头**
```
Authorization: Bearer <token>
```

**响应**
```json
{
    "id": "507f1f77bcf86cd799439011",
    "username": "testuser",
    "role": "user",
    "balance": 100,
    "isActive": true
}
```

### 2.4 修改密码

**POST** `/api/auth/change-password`

**请求头**
```
Authorization: Bearer <token>
```

**请求体**
```json
{
    "oldPassword": "123456",
    "newPassword": "654321"
}
```

**响应**
```json
{
    "message": "密码修改成功"
}
```

---

## 3. 用户管理模块（管理员）

### 3.1 获取用户列表

**GET** `/api/users?page=1&limit=20&role=user&isActive=true`

**响应**
```json
{
    "users": [
        {
            "id": "...",
            "username": "user1",
            "role": "user",
            "balance": 100,
            "isActive": true,
            "createdAt": "2024-01-01T00:00:00.000Z"
        }
    ],
    "pagination": { ... }
}
```

### 3.2 创建用户

**POST** `/api/users/create`

**请求体**
```json
{
    "username": "newuser",
    "password": "123456",
    "role": "user",
    "balance": 0,
    "isActive": true
}
```

### 3.3 更新用户

**PUT** `/api/users/:id`

**请求体**
```json
{
    "isActive": false
}
```

### 3.4 删除用户

**DELETE** `/api/users/:id`

### 3.5 调整用户余额

**POST** `/api/users/balance`

**请求体**
```json
{
    "userId": "507f1f77bcf86cd799439011",
    "amount": 100,
    "note": "系统赠送"
}
```

---

## 4. 资金管理模块

### 4.1 获取交易记录

**GET** `/api/transactions?page=1&type=deposit&status=pending`

**响应**
```json
{
    "transactions": [
        {
            "id": "...",
            "type": "deposit",
            "amount": 100,
            "status": "pending",
            "createdAt": "2024-01-01T00:00:00.000Z"
        }
    ],
    "pagination": { ... }
}
```

### 4.2 提交充值/提现申请

**POST** `/api/transactions/request`

**请求体**
```json
{
    "type": "deposit",
    "amount": 100
}
```

### 4.3 获取交易详情

**GET** `/api/transactions/:id`

### 4.4 取消交易

**DELETE** `/api/transactions/:id`

（仅限待处理状态的交易）

### 4.5 批准交易（管理员）

**POST** `/api/transactions/:id/approve`

**请求体**
```json
{
    "note": "审核通过"
}
```

### 4.6 拒绝交易（管理员）

**POST** `/api/transactions/:id/reject`

**请求体**
```json
{
    "reason": "信息不完整"
}
```

---

## 5. 投注管理模块

### 5.1 获取投注配置

**GET** `/api/bets?interval=5`

**响应**
```json
{
    "config": {
        "pricePerNumber": 2,
        "winAmount": 19.5,
        "minNumbers": 1,
        "maxNumbers": 5,
        "odds": {
            "1": 9.75,
            "2": 4.875,
            "3": 3.25,
            "4": 2.4375,
            "5": 1.95
        }
    }
}
```

### 5.2 获取当前期号

**GET** `/api/bets/period?interval=5`

**响应**
```json
{
    "date": "2024-01-01",
    "interval": 5,
    "currentPeriod": 123,
    "nextPeriod": 124,
    "nextPeriodTime": "10:25"
}
```

### 5.3 提交投注

**POST** `/api/bets`

**请求体**
```json
{
    "date": "2024-01-01",
    "interval": 5,
    "period": 123,
    "championNumbers": [1, 3, 5]
}
```

**响应**
```json
{
    "message": "投注成功",
    "bet": {
        "id": "...",
        "amount": 6,
        "championNumbers": [1, 3, 5],
        "odds": 3.25,
        "status": "pending"
    },
    "balance": 94
}
```

### 5.4 获取投注历史

**GET** `/api/bets/history?page=1&status=pending`

### 5.5 获取投注详情

**GET** `/api/bets/:id`

### 5.6 取消投注

**DELETE** `/api/bets/:id`

（仅限未开奖的投注）

### 5.7 修改投注状态（管理员）

**PATCH** `/api/bets/:id/status`

**请求体**
```json
{
    "status": "won",
    "winAmount": 19.5,
    "reason": "系统错误补偿"
}
```

---

## 6. 开奖管理模块

### 6.1 获取开奖列表

**GET** `/api/draws?date=2024-01-01&interval=5`

### 6.2 获取每日开奖

**GET** `/api/draws/daily?date=2024-01-01&interval=5`

**响应**
```json
{
    "date": "2024-01-01",
    "interval": 5,
    "draws": [
        {
            "period": 1,
            "result": "5820913746",
            "status": "settled",
            "championNumber": 5
        }
    ]
}
```

### 6.3 创建开奖结果（管理员）

**POST** `/api/draws`

**请求体**
```json
{
    "date": "2024-01-01",
    "interval": 5,
    "periods": [
        { "period": 0, "result": "1234567890" },
        { "period": 1, "result": "0987654321" }
    ]
}
```

### 6.4 更新开奖结果（管理员）

**PUT** `/api/draws/:id`

**请求体**
```json
{
    "result": "1111111111"
}
```

### 6.5 删除开奖记录（管理员）

**DELETE** `/api/draws/:id`

---

## 7. 管理员模块

### 7.1 初始化系统

**POST** `/api/admin/init`

**请求体**
```json
{
    "secret": "your-jwt-secret"
}
```

### 7.2 获取统计数据

**GET** `/api/admin/stats?range=today`

**响应**
```json
{
    "dateRange": {
        "start": "2024-01-01T00:00:00.000Z",
        "end": "2024-01-01T23:59:59.999Z",
        "range": "today"
    },
    "users": {
        "total": 100,
        "active": 95,
        "admins": 3,
        "totalBalance": 50000
    },
    "bets": {
        "total": 1000,
        "amount": 50000,
        "won": 300,
        "lost": 700,
        "winAmount": 19500,
        "platformProfit": 30500,
        "winRate": "30%"
    },
    "transactions": {
        "depositAmount": 10000,
        "withdrawAmount": 5000,
        "netInflow": 5000
    }
}
```

### 7.3 数据归档

**POST** `/api/admin/archive`

**请求体**
```json
{
    "archiveDays": 90,
    "models": ["Draw", "Bet"]
}
```

---

## 8. 错误码说明

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或Token无效 |
| 403 | 无权限访问 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如用户名已存在） |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

### 业务错误码

| 错误码 | 说明 |
|--------|------|
| `VALIDATION_ERROR` | 参数验证失败 |
| `UNAUTHORIZED` | 未登录 |
| `TOKEN_EXPIRED` | Token已过期 |
| `INVALID_TOKEN` | 无效的Token |
| `FORBIDDEN` | 无权限 |
| `ADMIN_REQUIRED` | 需要管理员权限 |
| `NOT_FOUND` | 资源不存在 |
| `USER_NOT_FOUND` | 用户不存在 |
| `DUPLICATE` | 资源已存在 |
| `TOO_MANY_REQUESTS` | 请求过于频繁 |

---

## 9. 开发调试

### 9.1 使用 cURL 测试

```bash
# 注册
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"123456"}'

# 登录
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin001","password":"admin123"}'

# 获取用户信息
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <token>"

# 提交投注
curl -X POST http://localhost:5000/api/bets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"date":"2024-01-01","interval":5,"period":0,"championNumbers":[1,3,5]}'
```

### 9.2 使用 JavaScript fetch

```javascript
const BASE_URL = 'https://your-app.vercel.app/api';

// 登录获取Token
async function login(username, password) {
    const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (data.token) {
        localStorage.setItem('token', data.token);
    }
    return data;
}

// 带认证的请求
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    return fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    });
}

// 提交投注
async function placeBet(date, interval, period, numbers) {
    const response = await fetchWithAuth(`${BASE_URL}/bets`, {
        method: 'POST',
        body: JSON.stringify({
            date,
            interval,
            period,
            championNumbers: numbers
        })
    });
    return response.json();
}
```

---

## 10. 常见问题

### Q: Token过期如何处理？

A: Token有效期为7天。过期后需重新调用登录接口获取新Token。建议在请求返回401时自动跳转登录页。

### Q: 如何处理限流？

A: 请求过于频繁时会返回429状态码，响应体中包含 `retryAfter` 字段，表示需要等待的秒数。

### Q: 投注截止时间是什么？

A: 当前期号的开奖时间前1分钟停止投注和取消投注。

### Q: 如何获取开奖结果？

A: 开奖后，投注记录中会包含 `result` 和 `championNumber` 字段。
