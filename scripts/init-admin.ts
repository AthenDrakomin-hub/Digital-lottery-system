import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import Admin from '@/models/Admin'
import Config from '@/models/Config'
import dbConnect from '@/lib/db'

async function initAdmin() {
  try {
    await dbConnect()

    // Check if admin exists
    const existingAdmin = await Admin.findOne({ username: 'admin' })
    
    if (existingAdmin) {
      console.log('Admin already exists')
      return
    }

    // Create default admin
    const hashedPassword = await bcrypt.hash('admin123', 10)
    
    await Admin.create({
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
    })

    console.log('Default admin created: admin / admin123')

    // Create default config
    const existingConfig = await Config.findOne()
    
    if (!existingConfig) {
      await Config.create({
        energyTypes: ['核能', '氫能', '電能', '風能', '水能', '太陽能', '地熱能', '洋流能', '波浪能', '潮汐能'],
        provinces: ['北京', '上海', '廣東', '江蘇', '浙江', '山東', '四川', '湖北', '河南', '福建'],
        betAmounts: [100, 500, 1000, 5000, 10000],
        odds: {
          energyType: 1.8,
          province: 2.5,
          amount: 3.0,
        },
      })
      console.log('Default config created')
    }

    process.exit(0)
  } catch (error) {
    console.error('Init admin error:', error)
    process.exit(1)
  }
}

initAdmin()
