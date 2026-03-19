/**
 * 支付宝支付回调接口
 * POST /api/payment/alipay/notify
 */

const crypto = require('crypto');
const dbConnect = require('../../../lib/db');
const User = require('../../../models/User');
const Transaction = require('../../../models/Transaction');
const { checkDepositRisk, recordWithdrawBehavior } = require('../../../lib/riskControl');

// 支付宝配置（从环境变量获取）
const ALIPAY_CONFIG = {
    appId: process.env.ALIPAY_APP_ID,
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
    charset: 'UTF-8',
    signType: 'RSA2'
};

/**
 * 验证支付宝签名
 */
function verifyAlipaySign(params, publicKey) {
    try {
        // 获取签名和签名类型
        const sign = params.sign;
        const signType = params.sign_type || 'RSA2';
        
        if (!sign) {
            return false;
        }
        
        // 移除签名参数
        const signParams = { ...params };
        delete signParams.sign;
        delete signParams.sign_type;
        
        // 按字母顺序排序
        const sortedParams = Object.keys(signParams)
            .filter(key => signParams[key] !== undefined && signParams[key] !== '')
            .sort()
            .map(key => `${key}=${signParams[key]}`)
            .join('&');
        
        // 验证签名
        const verify = crypto.createVerify('RSA-SHA256');
        verify.update(sortedParams);
        
        // 格式化公钥
        const formattedKey = publicKey.includes('-----BEGIN')
            ? publicKey
            : `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
        
        return verify.verify(formattedKey, sign, 'base64');
    } catch (error) {
        console.error('支付宝签名验证失败:', error);
        return false;
    }
}

/**
 * 处理支付宝回调
 */
module.exports = async (req, res) => {
    // 支付宝使用 form-urlencoded 格式
    const params = req.body || {};
    
    try {
        // 1. 验证签名
        if (!ALIPAY_CONFIG.alipayPublicKey) {
            console.error('支付宝公钥未配置');
            return res.send('failure');
        }
        
        const isValid = verifyAlipaySign(params, ALIPAY_CONFIG.alipayPublicKey);
        
        if (!isValid) {
            console.error('支付宝签名验证失败');
            return res.send('failure');
        }
        
        // 2. 解析回调数据
        const {
            trade_no: alipayTradeNo,        // 支付宝交易号
            out_trade_no: outTradeNo,        // 商户订单号
            trade_status: tradeStatus,       // 交易状态
            total_amount: totalAmount,       // 订单金额
            buyer_id: buyerId,               // 买家支付宝用户ID
            gmt_payment: paymentTime,        // 付款时间
            subject: subject,                // 订单标题
            passback_params: passbackParams  // 回传参数（可包含userId）
        } = params;
        
        console.log('支付宝回调:', {
            tradeNo: alipayTradeNo,
            outTradeNo,
            tradeStatus,
            totalAmount
        });
        
        // 3. 检查交易状态
        if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
            // 不是成功的交易，直接返回成功
            return res.send('success');
        }
        
        // 4. 连接数据库
        await dbConnect();
        
        // 5. 查找对应的交易记录
        let transaction = await Transaction.findOne({
            'paymentInfo.outTradeNo': outTradeNo,
            type: 'deposit',
            status: 'pending'
        });
        
        // 6. 如果没有找到交易记录，创建新的
        if (!transaction) {
            // 从回传参数中获取用户ID
            let userId = passbackParams;
            if (!userId) {
                console.error('无法确定用户ID');
                return res.send('failure');
            }
            
            // 检查用户是否存在
            const user = await User.findById(userId);
            if (!user) {
                console.error('用户不存在:', userId);
                return res.send('failure');
            }
            
            // 风控检查
            const riskResult = await checkDepositRisk({
                userId,
                amount: parseFloat(totalAmount),
                date: new Date().toISOString().slice(0, 10)
            });
            
            if (!riskResult.allowed) {
                console.error('充值风控拦截:', riskResult.risks);
                return res.send('failure');
            }
            
            // 创建交易记录
            transaction = new Transaction({
                userId,
                type: 'deposit',
                amount: parseFloat(totalAmount),
                status: 'pending',
                description: `支付宝充值 - ${subject || '账户充值'}`,
                paymentInfo: {
                    outTradeNo,
                    payChannel: 'alipay'
                }
            });
        }
        
        // 7. 检查是否已处理（幂等性）
        if (transaction.status !== 'pending') {
            console.log('交易已处理，跳过:', transaction._id);
            return res.send('success');
        }
        
        // 8. 更新交易状态并增加用户余额
        transaction.status = 'completed';
        transaction.completedAt = new Date();
        transaction.paymentInfo = {
            ...transaction.paymentInfo,
            alipayTradeNo,
            buyerId,
            paymentTime: new Date(gmt_payment),
            rawData: params
        };
        
        await transaction.save();
        
        // 9. 增加用户余额
        await User.findByIdAndUpdate(transaction.userId, {
            $inc: { balance: transaction.amount }
        });
        
        console.log('支付宝充值成功:', {
            userId: transaction.userId,
            amount: transaction.amount,
            tradeNo: alipayTradeNo
        });
        
        // 10. 返回成功
        return res.send('success');
        
    } catch (error) {
        console.error('处理支付宝回调失败:', error);
        return res.send('failure');
    }
};
