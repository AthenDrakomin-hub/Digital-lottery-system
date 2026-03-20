import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import Config from '@/models/Config'
import { connectDB } from '@/lib/mongodb'

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

export async function PUT(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request)
    if (!admin) {
      return NextResponse.json({ success: false, error: '未授權' }, { status: 401 })
    }

    await connectDB()

    const body = await request.json()

    // Update or create config
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
      },
    })
  } catch (error) {
    console.error('Update config error:', error)
    return NextResponse.json({ success: false, error: '保存失敗' }, { status: 500 })
  }
}
