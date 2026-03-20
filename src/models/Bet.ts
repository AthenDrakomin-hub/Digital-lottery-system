import mongoose from 'mongoose'

// 投注状态
export type BetStatus = 'pending' | 'won' | 'lost' | 'cancelled'

// 投注接口
export interface IBet {
  _id: string
  userId: mongoose.Types.ObjectId
  period: string           // 开奖期号
  cycle: 5 | 10 | 15       // 周期（分钟）
  province: string         // 投注省份
  energyType: string       // 投注能源类型
  quantity: number         // 投注股数
  unitPrice: number        // 单价
  totalAmount: number      // 总金额
  status: BetStatus        // 状态
  winAmount?: number       // 中奖金额
  resultId?: mongoose.Types.ObjectId  // 关联的开奖结果ID
  createdAt: Date
  updatedAt: Date
}

const betSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  period: {
    type: String,
    required: true,
    index: true,
  },
  cycle: {
    type: Number,
    required: true,
    enum: [5, 10, 15],
  },
  province: {
    type: String,
    required: true,
    trim: true,
  },
  energyType: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
    default: 2,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'won', 'lost', 'cancelled'],
    default: 'pending',
    index: true,
  },
  winAmount: {
    type: Number,
    default: 0,
  },
  resultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Draw',
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

// 复合索引：用户+日期+状态
betSchema.index({ userId: 1, createdAt: -1, status: 1 })

// 更新时间中间件
betSchema.pre('save', function(next) {
  this.updatedAt = new Date()
  next()
})

export default mongoose.models.Bet || mongoose.model<IBet>('Bet', betSchema)
