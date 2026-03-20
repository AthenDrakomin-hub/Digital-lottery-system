import mongoose from 'mongoose'

const AdminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    default: 'admin',
    enum: ['admin', 'superadmin'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

export default mongoose.models.Admin || mongoose.model('Admin', AdminSchema)
