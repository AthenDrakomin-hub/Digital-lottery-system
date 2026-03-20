import mongoose from 'mongoose'

// 银行卡接口
export interface IBankCard {
  _id: string
  bankName: string
  cardNumber: string
  cardHolder: string
  bankBranch?: string
  isDefault: boolean
  createdAt: Date
}

// 用户接口
export interface IUser {
  _id: string
  username: string
  password: string
  role: 'admin' | 'user'
  balance: number
  isActive: boolean
  realName?: string
  phone?: string
  idCard?: string
  email?: string
  bankCards: IBankCard[]
  ipWhitelist: string[]
  ipWhitelistEnabled: boolean
  lastLoginIp?: string
  lastLoginAt?: Date
  lastActiveAt?: Date
  deletedAt?: Date
  createdAt: Date
  updatedAt: Date
}

// 银行卡Schema
const bankCardSchema = new mongoose.Schema({
  bankName: { type: String, required: true, trim: true },
  cardNumber: { type: String, required: true, trim: true },
  cardHolder: { type: String, required: true, trim: true },
  bankBranch: { type: String, trim: true },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { _id: true })

// 用户Schema
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  balance: { type: Number, default: 0, min: 0 },
  isActive: { type: Boolean, default: true },
  
  realName: { type: String, trim: true, maxlength: 50 },
  phone: { 
    type: String, 
    trim: true,
    validate: {
      validator: (v: string) => !v || /^1[3-9]\d{9}$/.test(v),
      message: '手机号格式不正确'
    }
  },
  idCard: { 
    type: String, 
    trim: true,
    validate: {
      validator: (v: string) => !v || /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(v),
      message: '身份证号格式不正确'
    }
  },
  email: { 
    type: String, 
    trim: true, 
    lowercase: true,
    validate: {
      validator: (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: '邮箱格式不正确'
    }
  },
  
  bankCards: [bankCardSchema],
  
  ipWhitelist: { type: [String], default: [] },
  ipWhitelistEnabled: { type: Boolean, default: false },
  
  lastLoginIp: { type: String },
  lastLoginAt: { type: Date },
  lastActiveAt: { type: Date, default: Date.now },
  
  deletedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

// 索引
userSchema.index({ createdAt: -1 })
userSchema.index({ role: 1, isActive: 1 })
userSchema.index({ balance: -1 })

// 更新时间中间件
userSchema.pre('save', function(next) {
  this.updatedAt = new Date()
  next()
})

export default mongoose.models.User || mongoose.model<IUser>('User', userSchema)
