#!/bin/bash

# API集成测试脚本
# 用法: ./scripts/test-api.sh [base_url]

BASE_URL="${1:-http://localhost:5000}"
TOKEN=""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数器
PASS=0
FAIL=0

# 测试函数
test_api() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_status="$5"
    
    echo -n "测试: $name ... "
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $TOKEN" \
            -d "$data" \
            "${BASE_URL}${endpoint}")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Authorization: Bearer $TOKEN" \
            "${BASE_URL}${endpoint}")
    fi
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" == "$expected_status" ]; then
        echo -e "${GREEN}✓ 通过${NC} (HTTP $http_code)"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}✗ 失败${NC} (期望 $expected_status, 实际 $http_code)"
        echo "  响应: $body"
        FAIL=$((FAIL + 1))
    fi
}

echo "========================================"
echo "API集成测试"
echo "服务地址: $BASE_URL"
echo "========================================"
echo

# ==================== 认证模块 ====================
echo "【认证模块】"

# 测试注册
test_api "用户注册" "POST" "/api/auth/register" \
    '{"username":"testuser_'"$(date +%s)"'","password":"123456"}' "201"

# 测试登录
echo -n "测试: 管理员登录 ... "
response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{"username":"admin001","password":"admin123"}' \
    "${BASE_URL}/api/auth/login")
    
TOKEN=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo -e "${GREEN}✓ 通过${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${RED}✗ 失败${NC}"
    echo "  响应: $response"
    FAIL=$((FAIL + 1))
fi

# 测试获取当前用户
test_api "获取当前用户" "GET" "/api/auth/me" "" "200"

# 测试修改密码（无效旧密码）
test_api "修改密码（无效旧密码）" "POST" "/api/auth/change-password" \
    '{"oldPassword":"wrong","newPassword":"654321"}' "400"

echo

# ==================== 用户管理模块 ====================
echo "【用户管理模块】"

test_api "获取用户列表" "GET" "/api/users?page=1&limit=10" "" "200"

test_api "创建用户" "POST" "/api/users/create" \
    '{"username":"newuser_'"$(date +%s)"'","password":"123456","role":"user"}' "201"

echo

# ==================== 资金管理模块 ====================
echo "【资金管理模块】"

test_api "获取交易列表" "GET" "/api/transactions?page=1" "" "200"

test_api "提交充值申请" "POST" "/api/transactions/request" \
    '{"type":"deposit","amount":100}' "201"

echo

# ==================== 开奖管理模块 ====================
echo "【开奖管理模块】"

TODAY=$(date +%Y-%m-%d)

test_api "获取开奖列表" "GET" "/api/draws?date=${TODAY}&interval=5" "" "200"

test_api "获取每日开奖" "GET" "/api/draws/daily?date=${TODAY}&interval=5" "" "200"

echo

# ==================== 投注管理模块 ====================
echo "【投注管理模块】"

test_api "获取投注配置" "GET" "/api/bets?interval=5" "" "200"

test_api "获取当前期号" "GET" "/api/bets/period?interval=5" "" "200"

test_api "获取投注历史" "GET" "/api/bets/history?page=1" "" "200"

echo

# ==================== 管理员模块 ====================
echo "【管理员模块】"

test_api "获取统计数据" "GET" "/api/admin/stats?range=today" "" "200"

echo

# ==================== 总结 ====================
echo "========================================"
echo "测试总结"
echo "========================================"
echo -e "通过: ${GREEN}${PASS}${NC}"
echo -e "失败: ${RED}${FAIL}${NC}"
echo "总计: $((PASS + FAIL))"

if [ $FAIL -eq 0 ]; then
    echo -e "\n${GREEN}所有测试通过！${NC}"
    exit 0
else
    echo -e "\n${RED}存在失败的测试${NC}"
    exit 1
fi
