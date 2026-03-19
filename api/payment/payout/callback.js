/**
 * 代付回调接口
 * 处理第三方代付平台的通知
 * POST /api/payment/payout/callback
 */

const dbConnect = require('../../../lib/db');
const User = require('../../../models/User');
const Transaction = require('../../../models/Transaction');

/**
 * 处理代付回调
 */
module.exports = async (req, res) => {
    try {
        await dbConnect();
        
        const { channel } = req.query;
        const callbackData = req.body;
        
        console.log('代付回调:', { channel, data: callbackData });
        
        let outTradeNo;
        let status;
        let failReason;
        
        // 根据渠道解析回调数据
        switch (channel) {
            case 'alipay':
                // 支付宝代付回调
                outTradeNo = callbackData.out_biz_no;
                status = callbackData.status === 'SUCCESS' ? 'success' : 'failed';
                failReason = callbackData.fail_reason || callbackData.error_code;
                break;
                
            case 'wechat':
                // 微信代付回调（企业付款）
                outTradeNo = callbackData.partner_trade_no;
                status = callbackData.status === 'SUCCESS' ? 'success' : 'failed';
                failReason = callbackData.reason;
                break;
                
            case 'bank':
                // 银行卡代付回调
                outTradeNo = callbackData.orderId;
                status = callbackData.status === 'success' ? 'success' : 'failed';
                failReason = callbackData.message;
                break;
                
            default:
                console.error('未知的代付渠道:', channel);
                return res.status(400).json({ error: '未知的代付渠道' });
        }
        
        // 查找交易记录
        const transaction = await Transaction.findById(outTradeNo);
        
        if (!transaction) {
            console.error('交易记录不存在:', outTradeNo);
            return res.status(404).json({ error: '交易记录不存在' });
        }
        
        // 更新交易状态
        if (status === 'success') {
            transaction.status = 'completed';
            transaction.completedAt = new Date();
            transaction.payoutInfo = {
                ...transaction.payoutInfo,
                completedAt: new Date(),
                callbackData
            };
        } else {
            transaction.status = 'failed';
            transaction.failReason = failReason || '代付失败';
            transaction.payoutInfo = {
                ...transaction.payoutInfo,
                failedAt: new Date(),
                callbackData
            };
            
            // 退款到用户余额
            await User.findByIdAndUpdate(transaction.userId, {
                $inc: { balance: transaction.amount }
            });
        }
        
        await transaction.save();
        
        console.log('代付回调处理完成:', {
            transactionId: transaction._id,
            status: transaction.status
        });
        
        // 返回成功响应
        if (channel === 'wechat') {
            // 微信需要返回特定格式
            return res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');
        }
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('处理代付回调失败:', error);
        res.status(500).json({ error: error.message });
    }
};
