/**
 * 消息队列模块 - 基于Redis Streams
 * 用于处理开奖后的结算、通知等异步任务
 */

const { getRedisClient } = require('./redis');

// 队列名称常量
const QUEUE_NAMES = {
    DRAW_SETTLEMENT: 'lottery:draw:settlement',      // 开奖结算队列
    NOTIFICATION: 'lottery:notification',            // 通知队列
    COMPENSATION: 'lottery:compensation'             // 补偿队列
};

// 消费者组名称
const CONSUMER_GROUPS = {
    SETTLEMENT_WORKER: 'settlement-workers',
    NOTIFICATION_WORKER: 'notification-workers',
    COMPENSATION_WORKER: 'compensation-workers'
};

/**
 * 消息队列类
 */
class MessageQueue {
    constructor() {
        this.redis = null;
        this.initialized = false;
    }

    /**
     * 初始化队列（创建消费者组）
     */
    async init() {
        if (this.initialized) return;

        this.redis = getRedisClient();
        if (!this.redis) {
            console.log('[Queue] Redis未配置，消息队列功能禁用');
            return;
        }

        try {
            // 创建消费者组（如果不存在）
            const groups = [
                { stream: QUEUE_NAMES.DRAW_SETTLEMENT, group: CONSUMER_GROUPS.SETTLEMENT_WORKER },
                { stream: QUEUE_NAMES.NOTIFICATION, group: CONSUMER_GROUPS.NOTIFICATION_WORKER },
                { stream: QUEUE_NAMES.COMPENSATION, group: CONSUMER_GROUPS.COMPENSATION_WORKER }
            ];

            for (const { stream, group } of groups) {
                try {
                    // XGROUP CREATE stream group $ MKSTREAM
                    // $ 表示从最新消息开始消费，MKSTREAM 表示如果流不存在则创建
                    await this.redis.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
                    console.log(`[Queue] 创建消费者组: ${group} -> ${stream}`);
                } catch (err) {
                    // 消费者组已存在是正常情况
                    if (!err.message.includes('BUSYGROUP')) {
                        console.error(`[Queue] 创建消费者组失败: ${group}`, err.message);
                    }
                }
            }

            this.initialized = true;
            console.log('[Queue] 消息队列初始化完成');
        } catch (error) {
            console.error('[Queue] 消息队列初始化错误:', error);
        }
    }

    /**
     * 发送消息到队列
     * @param {string} queueName - 队列名称
     * @param {object} message - 消息内容
     * @returns {string} 消息ID
     */
    async publish(queueName, message) {
        if (!this.redis) {
            console.log('[Queue] Redis未配置，跳过消息发布');
            return null;
        }

        try {
            // 确保队列已初始化
            if (!this.initialized) {
                await this.init();
            }

            // 将消息对象转换为键值对数组
            const fields = [];
            for (const [key, value] of Object.entries(message)) {
                fields.push(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
            }

            // XADD queueName * field1 value1 field2 value2 ...
            const messageId = await this.redis.xadd(queueName, '*', ...fields);
            console.log(`[Queue] 消息已发布: ${queueName} -> ${messageId}`);
            return messageId;
        } catch (error) {
            console.error('[Queue] 发布消息失败:', error);
            return null;
        }
    }

    /**
     * 从队列消费消息
     * @param {string} queueName - 队列名称
     * @param {string} consumerGroup - 消费者组名称
     * @param {string} consumerName - 消费者名称
     * @param {number} count - 一次获取的消息数量
     * @param {number} block - 阻塞等待时间（毫秒）
     * @returns {Array} 消息列表
     */
    async consume(queueName, consumerGroup, consumerName, count = 1, block = 5000) {
        if (!this.redis) {
            return [];
        }

        try {
            // XREADGROUP GROUP group consumer COUNT count BLOCK block STREAMS stream >
            // > 表示只获取新消息，不是已pending的消息
            const result = await this.redis.xreadgroup(
                'GROUP', consumerGroup, consumerName,
                'COUNT', count,
                'BLOCK', block,
                'STREAMS', queueName,
                '>'
            );

            if (!result || result.length === 0) {
                return [];
            }

            // 解析消息
            const messages = [];
            for (const [stream, entries] of result) {
                for (const [messageId, fields] of entries) {
                    // 将键值对数组转换为对象
                    const message = { _id: messageId };
                    for (let i = 0; i < fields.length; i += 2) {
                        const key = fields[i];
                        const value = fields[i + 1];
                        // 尝试解析JSON
                        try {
                            message[key] = JSON.parse(value);
                        } catch {
                            message[key] = value;
                        }
                    }
                    messages.push(message);
                }
            }

            return messages;
        } catch (error) {
            console.error('[Queue] 消费消息失败:', error);
            return [];
        }
    }

    /**
     * 确认消息已处理（ACK）
     * @param {string} queueName - 队列名称
     * @param {string} consumerGroup - 消费者组名称
     * @param {string} messageId - 消息ID
     */
    async ack(queueName, consumerGroup, messageId) {
        if (!this.redis) return;

        try {
            await this.redis.xack(queueName, consumerGroup, messageId);
            console.log(`[Queue] 消息已确认: ${queueName} -> ${messageId}`);
        } catch (error) {
            console.error('[Queue] 确认消息失败:', error);
        }
    }

    /**
     * 获取待处理消息（pending messages）
     * 用于处理未确认的消息（可能是处理失败需要重试）
     * @param {string} queueName - 队列名称
     * @param {string} consumerGroup - 消费者组名称
     * @param {number} count - 获取数量
     * @returns {Array} 待处理消息列表
     */
    async getPending(queueName, consumerGroup, count = 10) {
        if (!this.redis) return [];

        try {
            // XPENDING stream group - + count
            // 获取待处理消息的摘要信息
            const pending = await this.redis.xpending(queueName, consumerGroup, '-', '+', count);
            
            if (!pending || pending.length === 0) {
                return [];
            }

            // 获取待处理消息的详细内容
            const messages = [];
            for (const [messageId, consumer, idleTime, deliveries] of pending) {
                // 如果消息空闲时间超过60秒且投递次数小于5次，则重新获取
                if (idleTime > 60000 && deliveries < 5) {
                    const result = await this.redis.xclaim(
                        queueName, consumerGroup, consumer,
                        idleTime,
                        messageId
                    );
                    
                    if (result && result.length > 0) {
                        for (const [id, fields] of result) {
                            const message = { _id: id, _deliveries: deliveries };
                            for (let i = 0; i < fields.length; i += 2) {
                                const key = fields[i];
                                const value = fields[i + 1];
                                try {
                                    message[key] = JSON.parse(value);
                                } catch {
                                    message[key] = value;
                                }
                            }
                            messages.push(message);
                        }
                    }
                }
            }

            return messages;
        } catch (error) {
            console.error('[Queue] 获取待处理消息失败:', error);
            return [];
        }
    }

    /**
     * 获取队列长度
     * @param {string} queueName - 队列名称
     * @returns {number} 队列长度
     */
    async length(queueName) {
        if (!this.redis) return 0;

        try {
            const info = await this.redis.xinfo('STREAM', queueName);
            return info[1] || 0; // length是第二个元素
        } catch (error) {
            return 0;
        }
    }

    /**
     * 发布开奖结算任务
     * @param {object} drawInfo - 开奖信息
     */
    async publishDrawSettlement(drawInfo) {
        return await this.publish(QUEUE_NAMES.DRAW_SETTLEMENT, {
            type: 'draw_settlement',
            date: drawInfo.date,
            interval: drawInfo.interval,
            period: drawInfo.period,
            result: drawInfo.result,
            timestamp: Date.now()
        });
    }

    /**
     * 发布通知任务
     * @param {object} notification - 通知信息
     */
    async publishNotification(notification) {
        return await this.publish(QUEUE_NAMES.NOTIFICATION, {
            type: notification.type,
            userId: notification.userId,
            title: notification.title,
            content: notification.content,
            timestamp: Date.now()
        });
    }

    /**
     * 发布补偿任务
     * @param {object} compensation - 补偿信息
     */
    async publishCompensation(compensation) {
        return await this.publish(QUEUE_NAMES.COMPENSATION, {
            type: compensation.type,
            date: compensation.date,
            interval: compensation.interval,
            period: compensation.period,
            reason: compensation.reason,
            timestamp: Date.now()
        });
    }
}

// 导出单例
const queue = new MessageQueue();

module.exports = {
    queue,
    QUEUE_NAMES,
    CONSUMER_GROUPS
};
