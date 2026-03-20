import mongoose from 'mongoose'

// 能源类型配置
interface IEnergyTypeConfig {
  id: string
  name: string
  color: string
  enabled: boolean
  sortOrder: number
}

// 省份配置
interface IProvinceConfig {
  id: string
  name: string
  enabled: boolean
  sortOrder: number
}

// 投注档位配置
interface IBetAmountConfig {
  amount: number
  enabled: boolean
  sortOrder: number
}

// 赔率配置
interface IOddsConfig {
  energyType: number
  province: number
  amount: number
}

// 投资周期配置
interface ICycleConfig {
  minutes: number        // 周期分钟数
  enabled: boolean
  sealSeconds: number    // 封盘倒计时秒数
}

// 开奖动画配置
interface IAnimationConfig {
  duration: number       // 动画时长（秒）
  showParticles: boolean // 是否显示粒子效果
  showCountdown: boolean // 是否显示倒计时
}

// 完整配置接口
interface IConfig {
  energyTypes: IEnergyTypeConfig[]
  provinces: IProvinceConfig[]
  betAmounts: IBetAmountConfig[]
  odds: IOddsConfig
  cycles: ICycleConfig[]
  animation: IAnimationConfig
  unitPrice: number      // 单价
  minQuantity: number    // 最小购买股数
  maxQuantity: number    // 最大购买股数
}

const energyTypeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  color: { type: String, default: '#32b24a' },
  enabled: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { _id: false })

const provinceSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { _id: false })

const betAmountSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  enabled: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { _id: false })

const cycleSchema = new mongoose.Schema({
  minutes: { type: Number, required: true },
  enabled: { type: Boolean, default: true },
  sealSeconds: { type: Number, default: 30 },
}, { _id: false })

const animationSchema = new mongoose.Schema({
  duration: { type: Number, default: 10 },
  showParticles: { type: Boolean, default: true },
  showCountdown: { type: Boolean, default: true },
}, { _id: false })

const configSchema = new mongoose.Schema({
  energyTypes: {
    type: [energyTypeSchema],
    default: [
      { id: 'nuclear', name: '核能', color: '#9333ea', enabled: true, sortOrder: 1 },
      { id: 'hydrogen', name: '氫能', color: '#67e8f9', enabled: true, sortOrder: 2 },
      { id: 'electric', name: '電能', color: '#9ca3af', enabled: true, sortOrder: 3 },
      { id: 'wind', name: '風能', color: '#16a34a', enabled: true, sortOrder: 4 },
      { id: 'water', name: '水能', color: '#f97316', enabled: true, sortOrder: 5 },
      { id: 'solar', name: '太陽能', color: '#3b82f6', enabled: true, sortOrder: 6 },
      { id: 'geothermal', name: '地熱能', color: '#ca8a04', enabled: true, sortOrder: 7 },
      { id: 'ocean', name: '洋流能', color: '#06b6d4', enabled: true, sortOrder: 8 },
      { id: 'wave', name: '波浪能', color: '#ec4899', enabled: true, sortOrder: 9 },
      { id: 'tidal', name: '潮汐能', color: '#dc2626', enabled: true, sortOrder: 10 },
    ],
  },
  provinces: {
    type: [provinceSchema],
    default: [
      { id: 'zhejiang', name: '浙江', enabled: true, sortOrder: 1 },
      { id: 'hebei', name: '河北', enabled: true, sortOrder: 2 },
      { id: 'guangdong', name: '廣東', enabled: true, sortOrder: 3 },
      { id: 'anhui', name: '安徽', enabled: true, sortOrder: 4 },
      { id: 'shandong', name: '山東', enabled: true, sortOrder: 5 },
      { id: 'jiangsu', name: '江蘇', enabled: true, sortOrder: 6 },
      { id: 'mongolia', name: '蒙古', enabled: true, sortOrder: 7 },
      { id: 'henan', name: '河南', enabled: true, sortOrder: 8 },
      { id: 'xinjiang', name: '新疆', enabled: true, sortOrder: 9 },
      { id: 'sichuan', name: '四川', enabled: true, sortOrder: 10 },
    ],
  },
  betAmounts: {
    type: [betAmountSchema],
    default: [
      { amount: 100, enabled: true, sortOrder: 1 },
      { amount: 500, enabled: true, sortOrder: 2 },
      { amount: 1000, enabled: true, sortOrder: 3 },
      { amount: 5000, enabled: true, sortOrder: 4 },
      { amount: 10000, enabled: true, sortOrder: 5 },
    ],
  },
  odds: {
    energyType: { type: Number, default: 1.8 },
    province: { type: Number, default: 2.5 },
    amount: { type: Number, default: 3.0 },
  },
  cycles: {
    type: [cycleSchema],
    default: [
      { minutes: 5, enabled: true, sealSeconds: 30 },
      { minutes: 10, enabled: true, sealSeconds: 30 },
      { minutes: 15, enabled: true, sealSeconds: 30 },
    ],
  },
  animation: {
    type: animationSchema,
    default: {
      duration: 10,
      showParticles: true,
      showCountdown: true,
    },
  },
  unitPrice: { type: Number, default: 2 },
  minQuantity: { type: Number, default: 1 },
  maxQuantity: { type: Number, default: 1000 },
})

// 防止模型重复编译
const Config = mongoose.models.Config || mongoose.model('Config', configSchema)

export default Config
export type { 
  IConfig, 
  IEnergyTypeConfig, 
  IProvinceConfig, 
  IBetAmountConfig,
  IOddsConfig,
  ICycleConfig,
  IAnimationConfig 
}
