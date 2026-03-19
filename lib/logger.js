/**
 * 日志服务集成模块
 * 支持多种免费日志服务：Axiom、Logtail、Console
 */

// 日志配置
const LOG_CONFIG = {
    // 日志级别
    level: process.env.LOG_LEVEL || 'info',
    // 服务类型：axiom, logtail, console
    service: process.env.LOG_SERVICE || 'console',
    // Axiom配置
    axiom: {
        dataset: process.env.AXIOM_DATASET,
        token: process.env.AXIOM_TOKEN
    },
    // Logtail配置
    logtail: {
        sourceToken: process.env.LOGTAIL_SOURCE_TOKEN
    },
    // 是否开启结构化日志
    structured: process.env.LOG_STRUCTURED === 'true',
    // 敏感字段（不记录）
    sensitiveFields: ['password', 'token', 'secret', 'apiKey', 'privateKey', 'authorization']
};

// 日志级别优先级
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

// 内存缓冲（用于批量发送）
let logBuffer = [];
const FLUSH_INTERVAL = 5000; // 5秒刷新一次

/**
 * 日志类
 */
class Logger {
    constructor(context = 'app') {
        this.context = context;
    }
    
    /**
     * 格式化日志消息
     */
    formatMessage(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const baseLog = {
            timestamp,
            level,
            context: this.context,
            message,
            environment: process.env.COZE_PROJECT_ENV || 'development'
        };
        
        // 过滤敏感字段
        const sanitizedData = this.sanitize(data);
        
        return { ...baseLog, ...sanitizedData };
    }
    
    /**
     * 过滤敏感字段
     */
    sanitize(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            if (LOG_CONFIG.sensitiveFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
                result[key] = '***REDACTED***';
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.sanitize(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }
    
    /**
     * 发送日志
     */
    async send(level, message, data) {
        // 检查日志级别
        if (LOG_LEVELS[level] < LOG_LEVELS[LOG_CONFIG.level]) {
            return;
        }
        
        const logEntry = this.formatMessage(level, message, data);
        
        // 根据服务类型发送
        switch (LOG_CONFIG.service) {
            case 'axiom':
                await this.sendToAxiom(logEntry);
                break;
            case 'logtail':
                await this.sendToLogtail(logEntry);
                break;
            default:
                this.sendToConsole(logEntry);
        }
    }
    
    /**
     * 发送到控制台
     */
    sendToConsole(logEntry) {
        const logString = LOG_CONFIG.structured
            ? JSON.stringify(logEntry)
            : `[${logEntry.timestamp}] [${logEntry.level.toUpperCase()}] [${logEntry.context}] ${logEntry.message}`;
        
        switch (logEntry.level) {
            case 'error':
                console.error(logString, logEntry.error || '');
                break;
            case 'warn':
                console.warn(logString);
                break;
            default:
                console.log(logString);
        }
    }
    
    /**
     * 发送到Axiom
     */
    async sendToAxiom(logEntry) {
        if (!LOG_CONFIG.axiom.dataset || !LOG_CONFIG.axiom.token) {
            this.sendToConsole(logEntry);
            return;
        }
        
        try {
            // 添加到缓冲区
            logBuffer.push(logEntry);
            
            // 达到阈值或定时刷新
            if (logBuffer.length >= 10) {
                await this.flushAxiom();
            }
        } catch (error) {
            console.error('Axiom日志发送失败:', error);
            this.sendToConsole(logEntry);
        }
    }
    
    /**
     * 刷新Axiom缓冲区
     */
    async flushAxiom() {
        if (logBuffer.length === 0) return;
        
        const logs = [...logBuffer];
        logBuffer = [];
        
        try {
            const response = await fetch(`https://api.axiom.co/v1/datasets/${LOG_CONFIG.axiom.dataset}/ingest`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${LOG_CONFIG.axiom.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(logs)
            });
            
            if (!response.ok) {
                throw new Error(`Axiom API error: ${response.status}`);
            }
        } catch (error) {
            console.error('Axiom刷新失败:', error);
            // 降级到控制台
            logs.forEach(log => this.sendToConsole(log));
        }
    }
    
    /**
     * 发送到Logtail
     */
    async sendToLogtail(logEntry) {
        if (!LOG_CONFIG.logtail.sourceToken) {
            this.sendToConsole(logEntry);
            return;
        }
        
        try {
            await fetch('https://in.logtail.com/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${LOG_CONFIG.logtail.sourceToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(logEntry)
            });
        } catch (error) {
            console.error('Logtail日志发送失败:', error);
            this.sendToConsole(logEntry);
        }
    }
    
    // 日志方法
    debug(message, data) {
        return this.send('debug', message, data);
    }
    
    info(message, data) {
        return this.send('info', message, data);
    }
    
    warn(message, data) {
        return this.send('warn', message, data);
    }
    
    error(message, data) {
        return this.send('error', message, data);
    }
    
    // 特殊日志方法
    
    /**
     * 记录API请求
     */
    logRequest(req, responseTime, statusCode) {
        this.info('API请求', {
            method: req.method,
            path: req.path || req.url,
            statusCode,
            responseTime: `${responseTime}ms`,
            ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent']
        });
    }
    
    /**
     * 记录开奖事件
     */
    logDraw(date, interval, period, result) {
        this.info('开奖完成', {
            date,
            interval,
            period: period + 1,
            result,
            championNumber: result[0]
        });
    }
    
    /**
     * 记录结算事件
     */
    logSettlement(date, interval, period, stats) {
        this.info('结算完成', {
            date,
            interval,
            period: period + 1,
            totalBets: stats.totalBets,
            wonBets: stats.wonBets,
            lostBets: stats.lostBets,
            totalWinAmount: stats.totalWinAmount
        });
    }
    
    /**
     * 记录错误告警
     */
    logAlert(type, message, details) {
        this.error('系统告警', {
            alertType: type,
            message,
            ...details
        });
    }
}

// 定时刷新缓冲区
setInterval(() => {
    if (LOG_CONFIG.service === 'axiom' && logBuffer.length > 0) {
        new Logger('system').flushAxiom();
    }
}, FLUSH_INTERVAL);

// 导出
function createLogger(context) {
    return new Logger(context);
}

// 默认logger
const defaultLogger = new Logger('app');

module.exports = {
    Logger,
    createLogger,
    logger: defaultLogger
};
