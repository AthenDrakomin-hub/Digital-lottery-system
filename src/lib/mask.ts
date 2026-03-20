/**
 * 敏感信息脱敏工具
 */

// 手机号脱敏
export function maskPhone(phone: string): string {
  if (!phone) return ''
  if (phone.length !== 11) return phone
  return phone.slice(0, 3) + '****' + phone.slice(7)
}

// 身份证号脱敏
export function maskIdCard(idCard: string): string {
  if (!idCard) return ''
  if (idCard.length < 10) return idCard
  const len = idCard.length
  return idCard.slice(0, 6) + '*'.repeat(len - 10) + idCard.slice(-4)
}

// 银行卡号脱敏
export function maskBankCard(cardNumber: string): string {
  if (!cardNumber) return ''
  if (cardNumber.length < 8) return cardNumber
  return cardNumber.slice(0, 4) + '****' + cardNumber.slice(-4)
}

// 用户信息脱敏
export function maskUserInfo(user: any, options: { maskName?: boolean } = {}) {
  const result = { ...user }

  if (result.phone) {
    result.phone = maskPhone(result.phone)
  }

  if (result.idCard) {
    result.idCard = maskIdCard(result.idCard)
  }

  if (options.maskName && result.realName) {
    result.realName = result.realName[0] + '*'.repeat(result.realName.length - 1)
  }

  if (result.bankCards && result.bankCards.length > 0) {
    result.bankCards = result.bankCards.map((card: any) => ({
      ...card,
      cardNumber: maskBankCard(card.cardNumber)
    }))
  }

  return result
}
