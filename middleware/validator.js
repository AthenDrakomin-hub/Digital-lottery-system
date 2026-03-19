/**
 * 请求参数验证中间件
 * 使用简单的验证规则，无需额外依赖
 */

/**
 * 验证规则
 */
const Validators = {
    // 必填字段
    required: (value, fieldName) => {
        if (value === undefined || value === null || value === '') {
            return `${fieldName}不能为空`;
        }
        return null;
    },
    
    // 字符串长度
    minLength: (value, min, fieldName) => {
        if (typeof value === 'string' && value.length < min) {
            return `${fieldName}长度不能少于${min}个字符`;
        }
        return null;
    },
    
    maxLength: (value, max, fieldName) => {
        if (typeof value === 'string' && value.length > max) {
            return `${fieldName}长度不能超过${max}个字符`;
        }
        return null;
    },
    
    // 数字范围
    min: (value, min, fieldName) => {
        if (typeof value === 'number' && value < min) {
            return `${fieldName}不能小于${min}`;
        }
        return null;
    },
    
    max: (value, max, fieldName) => {
        if (typeof value === 'number' && value > max) {
            return `${fieldName}不能大于${max}`;
        }
        return null;
    },
    
    // 正则匹配
    pattern: (value, regex, fieldName, message) => {
        if (!regex.test(String(value))) {
            return message || `${fieldName}格式不正确`;
        }
        return null;
    },
    
    // 枚举值
    enum: (value, values, fieldName) => {
        if (!values.includes(value)) {
            return `${fieldName}必须是以下值之一: ${values.join(', ')}`;
        }
        return null;
    },
    
    // MongoDB ObjectId
    objectId: (value, fieldName) => {
        const regex = /^[0-9a-fA-F]{24}$/;
        if (!regex.test(String(value))) {
            return `${fieldName}不是有效的ID格式`;
        }
        return null;
    },
    
    // 日期格式 YYYY-MM-DD
    date: (value, fieldName) => {
        const regex = /^\d{4}-\d{2}-\d{2}$/;
        if (!regex.test(String(value))) {
            return `${fieldName}日期格式不正确，应为YYYY-MM-DD`;
        }
        return null;
    },
    
    // 10位数字字符串
    drawResult: (value, fieldName) => {
        const regex = /^\d{10}$/;
        if (!regex.test(String(value))) {
            return `${fieldName}必须为10位数字`;
        }
        return null;
    },
    
    // 用户名：3-50位字母数字下划线
    username: (value, fieldName = '用户名') => {
        if (!value) return `${fieldName}不能为空`;
        if (value.length < 3) return `${fieldName}不能少于3个字符`;
        if (value.length > 50) return `${fieldName}不能超过50个字符`;
        if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(value)) {
            return `${fieldName}只能包含字母、数字、下划线和中文`;
        }
        return null;
    },
    
    // 密码：至少6位
    password: (value, fieldName = '密码') => {
        if (!value) return `${fieldName}不能为空`;
        if (value.length < 6) return `${fieldName}不能少于6个字符`;
        return null;
    },
    
    // 金额：正数
    amount: (value, fieldName = '金额') => {
        const num = Number(value);
        if (isNaN(num)) return `${fieldName}必须是数字`;
        if (num <= 0) return `${fieldName}必须大于0`;
        return null;
    },
    
    // 投注数字数组
    championNumbers: (value, fieldName = '投注数字') => {
        if (!Array.isArray(value)) return `${fieldName}必须是数组`;
        if (value.length < 1 || value.length > 5) return `${fieldName}数量必须在1-5个之间`;
        for (const num of value) {
            if (num < 0 || num > 9 || !Number.isInteger(num)) {
                return `${fieldName}必须是0-9的整数`;
            }
        }
        return null;
    }
};

/**
 * 创建验证中间件
 * @param {Object} rules - 验证规则
 * @param {string} source - 数据来源: 'body', 'query', 'params'
 */
function validate(rules, source = 'body') {
    return (req, res, next) => {
        const data = req[source] || {};
        const errors = [];
        
        for (const [field, fieldRules] of Object.entries(rules)) {
            const value = data[field];
            
            for (const rule of fieldRules) {
                let error = null;
                
                if (typeof rule === 'function') {
                    // 自定义验证函数
                    error = rule(value, field);
                } else if (typeof rule === 'object') {
                    // 规则对象 { validator, params, message }
                    const { validator, params, message } = rule;
                    if (Validators[validator]) {
                        const validatorFn = Validators[validator];
                        if (Array.isArray(params)) {
                            error = validatorFn(value, ...params, field, message);
                        } else {
                            error = validatorFn(value, params, field, message);
                        }
                    }
                } else if (typeof rule === 'string') {
                    // 简写字符串规则
                    if (Validators[rule]) {
                        error = Validators[rule](value, field);
                    }
                }
                
                if (error) {
                    errors.push({ field, message: error });
                    break; // 一个字段只返回第一个错误
                }
            }
        }
        
        if (errors.length > 0) {
            return res.status(400).json({
                error: errors[0].message,
                code: 'VALIDATION_ERROR',
                errors
            });
        }
        
        next();
    };
}

/**
 * 常用验证规则预设
 */
const ValidationSchemas = {
    // 用户注册
    register: {
        username: [
            { validator: 'required' },
            { validator: 'username' }
        ],
        password: [
            { validator: 'required' },
            { validator: 'password' }
        ]
    },
    
    // 用户登录
    login: {
        username: [{ validator: 'required' }],
        password: [{ validator: 'required' }]
    },
    
    // 创建用户（管理员）
    createUser: {
        username: [{ validator: 'required' }, { validator: 'username' }],
        password: [{ validator: 'required' }, { validator: 'password' }],
        role: [{ validator: 'enum', params: ['user', 'admin'] }]
    },
    
    // 提交投注
    createBet: {
        date: [{ validator: 'required' }, { validator: 'date' }],
        interval: [{ validator: 'enum', params: [5, 10, 15] }],
        period: [{ validator: 'required' }],
        championNumbers: [{ validator: 'championNumbers' }]
    },
    
    // 创建开奖
    createDraw: {
        date: [{ validator: 'required' }, { validator: 'date' }],
        interval: [{ validator: 'enum', params: [5, 10, 15] }],
        period: [{ validator: 'required' }],
        result: [{ validator: 'required' }, { validator: 'drawResult' }]
    },
    
    // 调整余额
    adjustBalance: {
        userId: [{ validator: 'required' }, { validator: 'objectId' }],
        amount: [{ validator: 'required' }, { validator: 'amount' }]
    },
    
    // 提交交易申请
    createTransaction: {
        type: [{ validator: 'enum', params: ['deposit', 'withdraw'] }],
        amount: [{ validator: 'required' }, { validator: 'amount' }]
    }
};

module.exports = {
    validate,
    Validators,
    ValidationSchemas
};
