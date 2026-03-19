/**
 * 提现自动处理接口
 * 对接第三方代付平台（支付宝/微信/银行卡）
 */

const crypto = require('crypto');
const dbConnect = require('../../../lib/db');
const User = require('../../../models/User');
const Transaction = require('../../../models/Transaction');
const { checkWithdrawRisk } = require('../../../lib/riskControl');

// 代付配置
const PAYOUT_CONFIG = {
    // 支付宝代付配置
    alipay: {
        enabled: process.env.ALIPAY_PAYOUT_ENABLED === 'true',
        apiUrl: process.env.ALIPAY_PAYOUT_API_URL,
        appId: process.env.ALIPAY_APP_ID,
        privateKey: process.env.ALIPAY_PRIVATE_KEY,
        publicKey: process.env.ALIPAY_PUBLIC_KEY
    },
    // 微信代付配置
    wechat: {
        enabled: process.env.WECHAT_PAYOUT_ENABLED === 'true',
        apiUrl: process.env.WECHAT_PAYOUT_API_URL,
        appId: process.env.WECHAT_APP_ID,
        mchId: process.env.WECHAT_MCH_ID,
        apiKey: process.env.WECHAT_API_KEY,
        certPath: process.env.WECHAT_CERT_PATH
    },
    // 银行卡代付配置（示例）
    bank: {
        enabled: process.env.BANK_PAYOUT_ENABLED === 'true',
        apiUrl: process.env.BANK_PAYOUT_API_URL,
        apiKey: process.env.BANK_PAYOUT_API_KEY,
        merchantId: process.env.BANK_MERCHANT_ID
    }
};

/**
 * 生成支付宝代付签名
 */
function signAlipayPayout(params, privateKey) {
    const sortedParams = Object.keys(params)
        .filter(key => params[key] !== undefined && params[key] !== '')
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');
    
    const sign = crypto.createSign('RSA-SA256');
    sign.update(sortedParams);
    
    const formattedKey = privateKey.includes('-----BEGIN')
        ? privateKey
        : `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
    
    return sign.sign(formattedKey, 'base64');
}

/**
 * 支付宝代付请求
 */
async function requestAlipayPayout(transaction) {
    const config = PAYOUT_CONFIG.alipay;
    
    if (!config.enabled) {
        throw new Error('支付宝代付未启用');
    }
    
    const params = {
        app_id: config.appId,
        method: 'alipay.fund.trans.uni.transfer',
        charset: 'UTF-8',
        sign_type: 'RSA2',
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        version: '1.0',
        biz_content: JSON.stringify({
            out_biz_no: transaction._id.toString(),
            trans_amount: transaction.amount.toFixed(2),
            product_code: 'TRANS_ACCOUNT_NO_PWD',
            biz_scene: 'DIRECT_TRANSFER',
            payee_info: {
                identity: transaction.withdrawInfo?.alipayAccount || '',
                identity_type: 'ALIPAY_LOGON_ID',
                name: transaction.withdrawInfo?.realName || ''
            },
            remark: '提现'
        })
    };
    
    params.sign = signAlipayPayout(params, config.privateKey);
    
    try {
        // 构建URL参数
        const queryString = Object.keys(params)
            .map(key => `${key}=${encodeURIComponent(params[key])}`)
            .join('&');
        
        const response = await fetch(`${config.apiUrl}?${queryString}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        return {
            success: data.alipay_fund_trans_uni_transfer_response?.code === '10000',
            data: data,
            orderId: data.alipay_fund_trans_uni_transfer_response?.order_id
        };
    } catch (error) {
        console.error('支付宝代付请求失败:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 微信代付请求
 */
async function requestWechatPayout(transaction) {
    const config = PAYOUT_CONFIG.wechat;
    
    if (!config.enabled) {
        throw new Error('微信代付未启用');
    }
    
    const params = {
        mch_appid: config.appId,
        mchid: config.mchId,
        nonce_str: crypto.randomBytes(16).toString('hex'),
        partner_trade_no: transaction._id.toString(),
        openid: transaction.withdrawInfo?.openid || '',
        check_name: 'FORCE_CHECK',
        re_user_name: transaction.withdrawInfo?.realName || '',
        amount: Math.round(transaction.amount * 100), // 转为分
        desc: '提现',
        spbill_create_ip: '127.0.0.1'
    };
    
    // 生成签名
    const stringA = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');
    params.sign = crypto.createHash('md5')
        .update(`${stringA}&key=${config.apiKey}`)
        .digest('hex')
        .toUpperCase();
    
    // 构建XML
    const xml = `<xml>
        ${Object.entries(params).map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`).join('\n')}
    </xml>`;
    
    try {
        const response = await fetch(config.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml' },
            body: xml
        });
        const responseText = await response.text();
        
        // 解析XML响应
        const result = {};
        const regex = /<(\w+)>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/\1>/g;
        let match;
        while ((match = regex.exec(responseText)) !== null) {
            result[match[1]] = match[2] || match[3] || '';
        }
        
        return {
            success: result.result_code === 'SUCCESS',
            data: result,
            orderId: result.payment_no
        };
    } catch (error) {
        console.error('微信代付请求失败:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 银行卡代付请求
 */
async function requestBankPayout(transaction) {
    const config = PAYOUT_CONFIG.bank;
    
    if (!config.enabled) {
        throw new Error('银行卡代付未启用');
    }
    
    const params = {
        merchantId: config.merchantId,
        orderId: transaction._id.toString(),
        amount: transaction.amount.toFixed(2),
        bankCode: transaction.withdrawInfo?.bankCode || '',
        bankAccount: transaction.withdrawInfo?.bankAccount || '',
        accountName: transaction.withdrawInfo?.realName || '',
        timestamp: Date.now()
    };
    
    // 生成签名
    const signStr = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');
    params.sign = crypto.createHmac('sha256', config.apiKey)
        .update(signStr)
        .digest('hex');
    
    try {
        const response = await fetch(config.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        const data = await response.json();
        
        return {
            success: data.code === 0,
            data: data,
            orderId: data.orderId
        };
    } catch (error) {
        console.error('银行卡代付请求失败:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 提现自动处理主函数
 * POST /api/payment/payout/process
 */
module.exports = async (req, res) => {
    const { transactionId, channel } = req.body;
    
    try {
        await dbConnect();
        
        // 查找交易记录
        const transaction = await Transaction.findById(transactionId);
        
        if (!transaction) {
            return res.status(404).json({ error: '交易记录不存在' });
        }
        
        if (transaction.type !== 'withdraw') {
            return res.status(400).json({ error: '非提现交易' });
        }
        
        if (transaction.status !== 'approved') {
            return res.status(400).json({ error: '交易未审核或已处理' });
        }
        
        // 风控检查
        const riskResult = await checkWithdrawRisk({
            userId: transaction.userId,
            amount: transaction.amount,
            date: new Date().toISOString().slice(0, 10)
        });
        
        if (!riskResult.allowed) {
            transaction.status = 'rejected';
            transaction.rejectReason = '风控拦截: ' + riskResult.risks.map(r => r.message).join('; ');
            await transaction.save();
            
            // 退款到用户余额
            await User.findByIdAndUpdate(transaction.userId, {
                $inc: { balance: transaction.amount }
            });
            
            return res.status(400).json({ 
                error: '风控拦截',
                risks: riskResult.risks
            });
        }
        
        // 确定代付渠道
        const payoutChannel = channel || transaction.withdrawInfo?.channel || 'alipay';
        
        // 调用代付接口
        let payoutResult;
        
        switch (payoutChannel) {
            case 'alipay':
                payoutResult = await requestAlipayPayout(transaction);
                break;
            case 'wechat':
                payoutResult = await requestWechatPayout(transaction);
                break;
            case 'bank':
                payoutResult = await requestBankPayout(transaction);
                break;
            default:
                return res.status(400).json({ error: '不支持的代付渠道' });
        }
        
        // 更新交易状态
        if (payoutResult.success) {
            transaction.status = 'processing';
            transaction.payoutInfo = {
                channel: payoutChannel,
                orderId: payoutResult.orderId,
                requestedAt: new Date(),
                rawData: payoutResult.data
            };
        } else {
            transaction.status = 'failed';
            transaction.failReason = payoutResult.error || '代付请求失败';
            
            // 退款到用户余额
            await User.findByIdAndUpdate(transaction.userId, {
                $inc: { balance: transaction.amount }
            });
        }
        
        await transaction.save();
        
        res.json({
            success: payoutResult.success,
            transaction: {
                id: transaction._id,
                status: transaction.status,
                payoutInfo: transaction.payoutInfo
            }
        });
        
    } catch (error) {
        console.error('提现处理失败:', error);
        res.status(500).json({ error: error.message });
    }
};
