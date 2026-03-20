import mongoose from 'mongoose'

// 结算统计接口
export interface ISettlementStats {
  totalBets: number
  wonBets: number
  lostBets: number
  totalWinAmount: number
}

// 开奖记录接口
export interface IDraw {
  _id: string
  interval: 5 | 10 | 15       // 周期（分钟）
  date: string                 // 日期 YYYY-MM-DD
  period: number               // 期号
  result: string               // 开奖结果（10位数字字符串）
  status: 'pending' | 'settled' | 'cancelled'
  settlementStats?: ISettlementStats
  updatedAt?: Date
  settledAt?: Date
}

const settlementStatsSchema = new mongoose.Schema({
  totalBets: { type: Number, default: 0 },
  wonBets: { type: Number, default: 0 },
  lostBets: { type: Number, default: 0 },
  totalWinAmount: { type: Number, default: 0 },
}, { _id: false })

const drawSchema = new mongoose.Schema({
  interval: { 
    type: Number, 
    required: true, 
    enum: [5, 10, 15] 
  },
  date: { 
    type: String, 
    required: true 
  },
  period: { 
    type: Number, 
    required: true 
  },
  result: { 
    type: String,
    validate: {
      validator: (v: string) => /^\d{10}$/.test(v),
      message: '开奖结果必须是10位数字'
    }
  },
  status: { 
    type: String, 
    enum: ['pending', 'settled', 'cancelled'],
    default: 'pending' 
  },
  settlementStats: settlementStatsSchema,
  updatedAt: { type: Date },
  settledAt: { type: Date },
})

// 复合索引：日期+周期+期号唯一
drawSchema.index({ date: 1, interval: 1, period: 1 }, { unique: true })
drawSchema.index({ date: 1, status: 1 })

// 明确指定集合名为 'draws'
export default mongoose.models.Draw || mongoose.model<IDraw>('Draw', drawSchema, 'draws')
