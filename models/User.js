const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 50
    },
    password: { 
        type: String, 
        required: true 
    },
    role: { 
        type: String, 
        enum: ['admin', 'user'], 
        default: 'user' 
    },
    balance: { 
        type: Number, 
        default: 0,
        min: 0
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// 索引
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema);
