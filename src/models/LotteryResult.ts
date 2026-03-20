import mongoose from 'mongoose'

const LotteryResultSchema = new mongoose.Schema({
  period: {
    type: String,
    required: true,
    unique: true,
  },
  cycle: {
    type: Number,
    required: true,
    enum: [5, 10, 15],
  },
  date: {
    type: String,
    required: true,
  },
  results: [{
    energyType: {
      type: String,
      required: true,
    },
    province: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
  }],
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'completed'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

// Index for efficient queries
LotteryResultSchema.index({ date: 1, cycle: 1 })

export default mongoose.models.LotteryResult || mongoose.model('LotteryResult', LotteryResultSchema)
