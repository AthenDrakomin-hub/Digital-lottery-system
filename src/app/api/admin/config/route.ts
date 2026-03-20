import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import Config from '@/models/Config'
import dbConnect from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

async function verifyAdmin(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value
  if (!token) return null
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string }
    if (decoded.role !== 'admin') return null
    return decoded
  } catch {
    return null
  }
}

// GET - 获取完整配置
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    await dbConnect()

    let config = await Config.findOne()
    if (!config) {
      config = await Config.create({})
    }

    return NextResponse.json({
      success: true,
      config: {
        energyTypes: config.energyTypes,
        provinces: config.provinces,
        betAmounts: config.betAmounts,
        odds: config.odds,
        cycles: config.cycles,
        animation: config.animation,
        unitPrice: config.unitPrice,
        minQuantity: config.minQuantity,
        maxQuantity: config.maxQuantity,
      },
    })
  } catch (error) {
    console.error('Get config error:', error)
    return NextResponse.json({ success: false, error: '獲取配置失敗' }, { status: 500 })
  }
}

// PUT - 更新整体配置
export async function PUT(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    await dbConnect()

    const body = await request.json()

    const config = await Config.findOneAndUpdate(
      {},
      { $set: body },
      { new: true, upsert: true }
    )

    return NextResponse.json({
      success: true,
      config: {
        energyTypes: config.energyTypes,
        provinces: config.provinces,
        betAmounts: config.betAmounts,
        odds: config.odds,
        cycles: config.cycles,
        animation: config.animation,
        unitPrice: config.unitPrice,
        minQuantity: config.minQuantity,
        maxQuantity: config.maxQuantity,
      },
    })
  } catch (error) {
    console.error('Update config error:', error)
    return NextResponse.json({ success: false, error: '保存失敗' }, { status: 500 })
  }
}

// PATCH - 更新单项配置
export async function PATCH(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    await dbConnect()

    const body = await request.json()
    const { type, action, data, id } = body

    let config = await Config.findOne()
    if (!config) {
      config = await Config.create({})
    }

    switch (type) {
      case 'energyType':
        if (action === 'add') {
          const newId = `energy_${Date.now()}`
          config.energyTypes.push({ ...data, id: newId, sortOrder: config.energyTypes.length + 1 })
        } else if (action === 'update' && id) {
          const index = config.energyTypes.findIndex((e: { id: string }) => e.id === id)
          if (index !== -1) {
            config.energyTypes[index] = { ...config.energyTypes[index].toObject(), ...data }
          }
        } else if (action === 'delete' && id) {
          config.energyTypes = config.energyTypes.filter((e: { id: string }) => e.id !== id)
        } else if (action === 'toggle' && id) {
          const item = config.energyTypes.find((e: { id: string }) => e.id === id)
          if (item) item.enabled = !item.enabled
        } else if (action === 'reorder' && Array.isArray(data)) {
          data.forEach((item: { id: string; sortOrder: number }) => {
            const found = config.energyTypes.find((e: { id: string }) => e.id === item.id)
            if (found) found.sortOrder = item.sortOrder
          })
        }
        break

      case 'province':
        if (action === 'add') {
          const newId = `province_${Date.now()}`
          config.provinces.push({ ...data, id: newId, sortOrder: config.provinces.length + 1 })
        } else if (action === 'update' && id) {
          const index = config.provinces.findIndex((p: { id: string }) => p.id === id)
          if (index !== -1) {
            config.provinces[index] = { ...config.provinces[index].toObject(), ...data }
          }
        } else if (action === 'delete' && id) {
          config.provinces = config.provinces.filter((p: { id: string }) => p.id !== id)
        } else if (action === 'toggle' && id) {
          const item = config.provinces.find((p: { id: string }) => p.id === id)
          if (item) item.enabled = !item.enabled
        } else if (action === 'reorder' && Array.isArray(data)) {
          data.forEach((item: { id: string; sortOrder: number }) => {
            const found = config.provinces.find((p: { id: string }) => p.id === item.id)
            if (found) found.sortOrder = item.sortOrder
          })
        }
        break

      case 'betAmount':
        if (action === 'add') {
          config.betAmounts.push({ ...data, sortOrder: config.betAmounts.length + 1 })
        } else if (action === 'update' && id) {
          const index = config.betAmounts.findIndex((b: { amount: number }) => b.amount === Number(id))
          if (index !== -1) {
            config.betAmounts[index] = { ...config.betAmounts[index].toObject(), ...data }
          }
        } else if (action === 'delete' && id) {
          config.betAmounts = config.betAmounts.filter((b: { amount: number }) => b.amount !== Number(id))
        } else if (action === 'toggle' && id) {
          const item = config.betAmounts.find((b: { amount: number }) => b.amount === Number(id))
          if (item) item.enabled = !item.enabled
        }
        break

      case 'cycle':
        if (action === 'update' && id) {
          const item = config.cycles.find((c: { minutes: number }) => c.minutes === Number(id))
          if (item) {
            Object.assign(item, data)
          }
        } else if (action === 'toggle' && id) {
          const item = config.cycles.find((c: { minutes: number }) => c.minutes === Number(id))
          if (item) item.enabled = !item.enabled
        }
        break

      case 'animation':
        config.animation = { ...config.animation.toObject(), ...data }
        break

      case 'odds':
        config.odds = { ...config.odds.toObject(), ...data }
        break

      case 'basic':
        if (data.unitPrice !== undefined) config.unitPrice = data.unitPrice
        if (data.minQuantity !== undefined) config.minQuantity = data.minQuantity
        if (data.maxQuantity !== undefined) config.maxQuantity = data.maxQuantity
        break

      default:
        return NextResponse.json({ success: false, error: '無效的操作類型' }, { status: 400 })
    }

    await config.save()

    return NextResponse.json({
      success: true,
      config: {
        energyTypes: config.energyTypes,
        provinces: config.provinces,
        betAmounts: config.betAmounts,
        odds: config.odds,
        cycles: config.cycles,
        animation: config.animation,
        unitPrice: config.unitPrice,
        minQuantity: config.minQuantity,
        maxQuantity: config.maxQuantity,
      },
    })
  } catch (error) {
    console.error('Patch config error:', error)
    return NextResponse.json({ success: false, error: '操作失敗' }, { status: 500 })
  }
}
