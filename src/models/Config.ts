import mongoose from 'mongoose'

// 定义配置接口
interface IConfig {
  energyTypes: string[]
  provinces: string[]
  betAmounts: number[]
  odds: {
    energyType: number
    province: number
    amount: number
  }
}

// 定义文档接口
interface ConfigDocument extends mongoose.Document, IConfig {}

// 定义模型接口
interface IConfigModel extends mongoose.Model<ConfigDocument> {}

const configSchema = new mongoose.Schema({
  energyTypes: {
    type: [String],
    default: ['核能', '氫能', '電能', '風能', '水能', '太陽能', '地熱能', '洋流能', '波浪能', '潮汐能'],
  },
  provinces: {
    type: [String],
    default: ['北京', '上海', '廣東', '江蘇', '浙江', '山東', '四川', '湖北', '河南', '福建'],
  },
  betAmounts: {
    type: [Number],
    default: [100, 500, 1000, 5000, 10000],
  },
  odds: {
    energyType: { type: Number, default: 1.8 },
    province: { type: Number, default: 2.5 },
    amount: { type: Number, default: 3.0 },
  },
})

// 防止模型重复编译
const Config = (mongoose.models.Config as IConfigModel) || mongoose.model<ConfigDocument, IConfigModel>('Config', configSchema)

export default Config
export type { IConfig, ConfigDocument }
