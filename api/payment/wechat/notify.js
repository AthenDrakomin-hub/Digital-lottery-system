/**
 * 微信支付回调接口
 * POST /api/payment/wechat/notify
 */

const crypto = require('crypto');
const dbConnect = require('../../../lib/db');
const User = require('../../../models/User');
const Transaction = require('../../../models/Transaction');
const { checkDepositRisk } = require('../../../lib/riskControl');

// 微信支付配置
const WECHAT_CONFIG = {
    appId: process.env.WECHAT_APP_ID,
    mchId: process.env.WECHAT_MCH_ID,
    apiKey: process.env.WECHAT_API_KEY,  // V2 API密钥
    apiV3Key: process.env.WECHAT_API_V3_KEY,  // V3 API密钥
};

/**
 * 解析XML
 */
function parseXML(xml) {
    const result = {};
    const regex = /<(\w+)>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/\1>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
        result[match[1]] = match[2] || match[3] || '';
    }
    return result;
}

/**
 * 生成XML响应
 */
function buildXMLResponse(returnCode, returnMsg = 'OK') {
    return `<xml>
        <return_code><![CDATA[${returnCode}]]></return_code>
        <return_msg><![CDATA[${returnMsg}]]></return_msg>
    </xml>`;
}

/**
 * 验证微信支付签名
 */
function verifyWechatSign(params, apiKey) {
    try {
        const sign = params.sign;
        if (!sign) {
            return false;
        }
        
        // 移除sign字段
        const signParams = { ...params };
        delete signParams.sign;
        
        // 按字母顺序排序并拼接
        const stringA = Object.keys(signParams)
            .filter(key => signParams[key] !== undefined && signParams[key] !== '')
            .sort()
            .map(key => `${key}=${signParams[key]}`)
            .join('&');
        
        // 拼接API密钥
        const stringSignTemp = `${stringA}&key=${apiKey}`;
        
        // MD5签名
        const calculatedSign = crypto.createHash('md5')
            .update(stringSignTemp)
            .digest('hex')
            .toUpperCase();
        
        return calculatedSign === sign;
    } catch (error) {
        console.error('微信签名验证失败:', error);
        return false;
    }
}

/**
 * 处理微信支付回调
 */
module.exports = async (req, res) => {
    try {
        // 1. 解析XML请求体
        let xmlBody = req.body;
        if (typeof xmlBody !== 'string') {
            xmlBody = JSON.stringify(req.body);
        }
        
        const params = parseXML(xmlBody);
        
        console.log('微信支付回调:', {
            transaction_id: params.transaction_id,
            out_trade_no: params.out_trade_no,
            result_code: params.result_code
        });
        
        // 2. 验证签名
        if (!WECHAT_CONFIG.apiKey) {
            console.error('微信API密钥未配置');
            return res.send(buildXMLResponse('FAIL', 'API密钥未配置'));
        }
        
        const isValid = verifyWechatSign(params, WECHAT_CONFIG.apiKey);
        
        if (!isValid) {
            console.error('微信签名验证失败');
            return res.send(buildXMLResponse('FAIL', '签名验证失败'));
        }
        
        // 3. 检查支付结果
        if (params.result_code !== 'SUCCESS' || params.return_code !== 'SUCCESS') {
            // 支付失败
            console.log('微信支付失败:', params.err_code, params.err_code_des);
            return res.send(buildXMLResponse('SUCCESS'));
        }
        
        // 4. 解析回调数据
        const {
            transaction_id: wechatTradeNo,    // 微信支付交易号
            out_trade_no: outTradeNo,          // 商户订单号
            total_fee: totalFee,               // 订单金额（分）
            openid,                            // 用户openid
            time_end: paymentTime,             // 支付完成时间
            attach                             // 附加数据（可包含userId）
        } = params;
        
        // 金额转换（分转元）
        const totalAmount = parseInt(totalFee) / 100;
        
        // 5. 连接数据库
        await dbConnect();
        
        // 6. 查找对应的交易记录
        let transaction = await Transaction.findOne({
            'paymentInfo.outTradeNo': outTradeNo,
            type: 'deposit',
            status: 'pending'
        });
        
        // 7. 如果没有找到交易记录，创建新的
        if (!transaction) {
            // 从附加数据中获取用户ID
            let userId = attach;
            if (!userId) {
                console.error('无法确定用户ID');
                return res.send(buildXMLResponse('FAIL', '用户ID缺失'));
            }
            
            // 检查用户是否存在
            const user = await User.findById(userId);
            if (!user) {
                console.error('用户不存在:', userId);
                return res.send(buildXMLResponse('FAIL', '用户不存在'));
            }
            
            // 风控检查
            const riskResult = await checkDepositRisk({
                userId,
                amount: totalAmount,
                date: new Date().toISOString().slice(0, 10)
            });
            
            if (!riskResult.allowed) {
                console.error('充值风控拦截:', riskResult.risks);
                return res.send(buildXMLResponse('FAIL', '风控拦截'));
            }
            
            // 创建交易记录
            transaction = new Transaction({
                userId,
                type: 'deposit',
                amount: totalAmount,
                status: 'pending',
                description: '微信充值 - 账户充值',
                paymentInfo: {
                    outTradeNo,
                    payChannel: 'wechat'
                }
            });
        }
        
        // 8. 检查是否已处理（幂等性）
        if (transaction.status !== 'pending') {
            console.log('交易已处理，跳过:', transaction._id);
            return res.send(buildXMLResponse('SUCCESS'));
        }
        
        // 9. 更新交易状态并增加用户余额
        transaction.status = 'completed';
        transaction.completedAt = new Date();
        transaction.paymentInfo = {
            ...transaction.paymentInfo,
            wechatTradeNo,
            openid,
            paymentTime: new Date(paymentTime.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1-$2-$3 $4:$5:$6')),
            rawData: params
        };
        
        await transaction.save();
        
        // 10. 增加用户余额
        await User.findByIdAndUpdate(transaction.userId, {
            $inc: { balance: transaction.amount }
        });
        
        console.log('微信充值成功:', {
            userId: transaction.userId,
            amount: transaction.amount,
            tradeNo: wechatTradeNo
        });
        
        // 11. 返回成功
        return res.send(buildXMLResponse('SUCCESS'));
        
    } catch (error) {
        console.error('处理微信支付回调失败:', error);
        return res.send(buildXMLResponse('FAIL', error.message));
    }
};
