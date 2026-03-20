/**
 * 敏感信息脱敏工具
 * 用于在API返回时对敏感信息进行脱敏处理
 */

/**
 * 手机号脱敏
 * 保留前3位和后4位，中间用*代替
 * 示例: 13812345678 -> 138****5678
 */
function maskPhone(phone) {
    if (!phone) return '';
    if (phone.length !== 11) return phone;
    return phone.slice(0, 3) + '****' + phone.slice(7);
}

/**
 * 身份证号脱敏
 * 保留前6位和后4位，中间用*代替
 * 示例: 110101199001011234 -> 110101********1234
 */
function maskIdCard(idCard) {
    if (!idCard) return '';
    if (idCard.length < 10) return idCard;
    const len = idCard.length;
    return idCard.slice(0, 6) + '*'.repeat(len - 10) + idCard.slice(-4);
}

/**
 * 银行卡号脱敏
 * 保留前4位和后4位，中间用*代替
 * 示例: 6222021234567890123 -> 6222************123
 */
function maskBankCard(cardNumber) {
    if (!cardNumber) return '';
    if (cardNumber.length < 8) return cardNumber;
    return cardNumber.slice(0, 4) + '****' + cardNumber.slice(-4);
}

/**
 * 姓名脱敏
 * 保留第一个字，其余用*代替
 * 示例: 张三 -> 张* , 欧阳修 -> 欧**
 */
function maskName(name) {
    if (!name) return '';
    if (name.length === 1) return name;
    if (name.length === 2) return name[0] + '*';
    return name[0] + '*'.repeat(name.length - 1);
}

/**
 * 邮箱脱敏
 * 保留前2个字符和@后的域名
 * 示例: test@example.com -> te***@example.com
 */
function maskEmail(email) {
    if (!email) return '';
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const [username, domain] = parts;
    const maskedUsername = username.length > 2 
        ? username.slice(0, 2) + '***' 
        : username[0] + '***';
    return maskedUsername + '@' + domain;
}

/**
 * 用户信息脱敏
 * 对用户对象中的敏感字段进行脱敏处理
 */
function maskUserInfo(user, options = {}) {
    const {
        maskPhone: shouldMaskPhone = true,
        maskIdCard: shouldMaskIdCard = true,
        maskBankCard: shouldMaskBankCard = true,
        maskName: shouldMaskName = false, // 默认不脱敏姓名
        maskEmail: shouldMaskEmail = true
    } = options;

    const result = { ...user };

    // 手机号脱敏
    if (shouldMaskPhone && result.phone) {
        result.phone = maskPhone(result.phone);
    }

    // 身份证脱敏
    if (shouldMaskIdCard && result.idCard) {
        result.idCard = maskIdCard(result.idCard);
    }

    // 邮箱脱敏
    if (shouldMaskEmail && result.email) {
        result.email = maskEmail(result.email);
    }

    // 姓名脱敏（可选）
    if (shouldMaskName && result.realName) {
        result.realName = maskName(result.realName);
    }

    // 银行卡脱敏
    if (shouldMaskBankCard && result.bankCards && result.bankCards.length > 0) {
        result.bankCards = result.bankCards.map(card => ({
            ...card,
            cardNumber: maskBankCard(card.cardNumber),
            cardHolder: shouldMaskName ? maskName(card.cardHolder) : card.cardHolder
        }));
    }

    return result;
}

/**
 * 检查是否有权限查看完整信息
 * @param {Object} requester - 请求者信息
 * @param {string} targetUserId - 目标用户ID
 * @returns {boolean} 是否有权限
 */
function canViewFullInfo(requester, targetUserId) {
    // 管理员可以查看完整信息
    if (requester.role === 'admin') return true;
    // 用户只能查看自己的完整信息
    return requester._id.toString() === targetUserId.toString();
}

module.exports = {
    maskPhone,
    maskIdCard,
    maskBankCard,
    maskName,
    maskEmail,
    maskUserInfo,
    canViewFullInfo
};
