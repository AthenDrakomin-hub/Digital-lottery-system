#!/bin/bash

# API接口测试脚本
# 使用方法：./test-api.sh [base_url] [jwt_token] [cron_secret]

BASE_URL="${1:-http://localhost:5000}"
TOKEN="${2:-}"
CRON_SECRET="${3:-test123}"

echo "======================================"
echo "数字开奖管理系统 - API接口测试"
echo "======================================"
echo "基础URL: $BASE_URL"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_api() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local auth="$5"
    
    echo -n "测试 $name ... "
    
    if [ -n "$data" ]; then
        if [ -n "$auth" ]; then
            response=$(curl -s -X $method "$BASE_URL$endpoint" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $TOKEN" \
                -d "$data")
        else
            response=$(curl -s -X $method "$BASE_URL$endpoint" \
                -H "Content-Type: application/json" \
                -d "$data")
        fi
    else
        if [ -n "$auth" ]; then
            response=$(curl -s -X $method "$BASE_URL$endpoint" \
                -H "Authorization: Bearer $TOKEN")
        else
            response=$(curl -s -X $method "$BASE_URL$endpoint")
        fi
    fi
    
    # 检查响应
    if echo "$response" | grep -q '"error"'; then
        echo -e "${RED}失败${NC}"
        echo "  响应: $response"
    elif [ -z "$response" ]; then
        echo -e "${RED}无响应${NC}"
    else
        echo -e "${GREEN}成功${NC}"
    fi
}

echo "========== 1. 认证接口 =========="
echo ""

test_api "用户注册" "POST" "/api/auth/register" \
    '{"username":"testuser001","password":"123456"}'

test_api "用户登录" "POST" "/api/auth/login" \
    '{"username":"admin001","password":"admin123"}'

test_api "获取当前用户" "GET" "/api/auth/me" "" "auth"

test_api "修改密码" "POST" "/api/auth/change-password" \
    '{"oldPassword":"admin123","newPassword":"admin123"}' "auth"

echo ""
echo "========== 2. 用户管理接口 =========="
echo ""

test_api "获取用户列表" "GET" "/api/users" "" "auth"

test_api "创建用户" "POST" "/api/users/create" \
    '{"username":"testuser002","password":"123456","role":"user"}' "auth"

test_api "获取用户详情" "GET" "/api/users/507f1f77bcf86cd799439011" "" "auth"

test_api "调整用户余额" "POST" "/api/users/balance" \
    '{"userId":"507f1f77bcf86cd799439011","amount":100,"note":"测试充值"}' "auth"

echo ""
echo "========== 3. 资金管理接口 =========="
echo ""

test_api "获取交易列表" "GET" "/api/transactions" "" "auth"

test_api "提交充值申请" "POST" "/api/transactions/request" \
    '{"type":"deposit","amount":100}' "auth"

test_api "提交提现申请" "POST" "/api/transactions/request" \
    '{"type":"withdraw","amount":50}' "auth"

echo ""
echo "========== 4. 开奖管理接口 =========="
echo ""

test_api "获取开奖列表" "GET" "/api/draws" "" "auth"

test_api "获取每日开奖" "GET" "/api/draws/daily?date=$(date +%Y-%m-%d)&interval=5"

test_api "创建开奖结果" "POST" "/api/draws" \
    '{"date":"2024-01-01","interval":5,"period":0,"result":"1234567890"}' "auth"

echo ""
echo "========== 5. 投注管理接口 =========="
echo ""

test_api "获取投注配置" "GET" "/api/bets?interval=5"

test_api "获取期号信息" "GET" "/api/bets/period?interval=5"

test_api "提交投注" "POST" "/api/bets" \
    '{"date":"2024-01-01","interval":5,"period":0,"championNumbers":[1,3,5]}' "auth"

test_api "获取投注历史" "GET" "/api/bets/history" "" "auth"

test_api "管理员获取投注" "GET" "/api/bets/admin" "" "auth"

echo ""
echo "========== 6. 定时任务接口 =========="
echo ""

test_api "自动开奖结算" "GET" "/api/cron/check-draws?secret=$CRON_SECRET"

test_api "补偿检查" "GET" "/api/cron/compensation?secret=$CRON_SECRET"

echo ""
echo "========== 7. 管理员接口 =========="
echo ""

test_api "初始化管理员" "POST" "/api/admin/init" \
    '{"secret":"test-jwt-secret"}'

test_api "数据归档统计" "GET" "/api/admin/archive" "" "auth"

echo ""
echo "========== 8. 支付回调接口 =========="
echo ""

test_api "支付宝回调" "POST" "/api/payment/alipay/notify" \
    '{"trade_no":"test","trade_status":"TRADE_SUCCESS"}'

test_api "微信回调" "POST" "/api/payment/wechat/notify" \
    '<xml><return_code>SUCCESS</return_code></xml>'

echo ""
echo "======================================"
echo "测试完成"
echo "======================================"
