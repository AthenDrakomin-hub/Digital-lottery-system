import mongoose from 'mongoose'

// 默认字段映射配置
export const DEFAULT_FIELD_MAPPING = {
  energyTypes: [
    { id: 'nuclear', name: '核能', color: '#a855f7', enabled: true },
    { id: 'hydrogen', name: '氫能', color: '#93c5fd', enabled: true },
    { id: 'electric', name: '電能', color: '#9ca3af', enabled: true },
    { id: 'wind', name: '風能', color: '#16a34a', enabled: true },
    { id: 'water', name: '水能', color: '#f97316', enabled: true },
    { id: 'solar', name: '太陽能', color: '#3b82f6', enabled: true },
    { id: 'geothermal', name: '地熱能', color: '#ca8a04', enabled: true },
    { id: 'ocean', name: '洋流能', color: '#06b6d4', enabled: true },
    { id: 'wave', name: '波浪能', color: '#ec4899', enabled: true },
    { id: 'tidal', name: '潮汐能', color: '#dc2626', enabled: true }
  ],
  provinces: [
    { id: 'zhejiang', name: '浙江', enabled: true },
    { id: 'hebei', name: '河北', enabled: true },
    { id: 'guangdong', name: '廣東', enabled: true },
    { id: 'anhui', name: '安徽', enabled: true },
    { id: 'shandong', name: '山東', enabled: true },
    { id: 'jiangsu', name: '江蘇', enabled: true },
    { id: 'neimenggu', name: '蒙古', enabled: true },
    { id: 'henan', name: '河南', enabled: true },
    { id: 'xinjiang', name: '新疆', enabled: true },
    { id: 'sichuan', name: '四川', enabled: true }
  ],
  betConfig: {
    minAmount: 2,
    maxAmount: 50000,
    unitPrice: 2
  }
}

const configSchema = new mongoose.Schema({
  key: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true
  },
  value: { 
    type: mongoose.Schema.Types.Mixed, 
    required: true 
  },
  description: { 
    type: String, 
    trim: true 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
})

// 静态方法
configSchema.statics.get = async function(key: string, defaultValue: any = null) {
  const config = await this.findOne({ key })
  return config ? config.value : defaultValue
}

configSchema.statics.set = async function(key: string, value: any) {
  return this.findOneAndUpdate(
    { key },
    { value, updatedAt: new Date() },
    { upsert: true, new: true }
  )
}

configSchema.statics.initDefaults = async function() {
  const existing = await this.findOne({ key: 'fieldMapping' })
  if (!existing) {
    await this.create({
      key: 'fieldMapping',
      value: DEFAULT_FIELD_MAPPING,
      description: '字段映射配置（能源类型、省份等）'
    })
    console.log('✅ 字段映射配置已初始化')
  }
}

// 防止模型重复编译
const Config = mongoose.models.Config || mongoose.model('Config', configSchema)

export default Config
