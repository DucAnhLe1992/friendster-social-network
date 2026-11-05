import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '../types';

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    handle: {
      type: String,
      required: [true, 'Handle is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Handle must be at least 3 characters'],
      maxlength: [30, 'Handle must be at most 30 characters'],
      match: [/^[a-zA-Z0-9_]+$/, 'Handle can only contain letters, numbers, and underscores'],
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      maxlength: [50, 'Display name must be at most 50 characters'],
    },
    bio: {
      type: String,
      default: '',
      maxlength: [160, 'Bio must be at most 160 characters'],
    },
    avatar: {
      type: String,
      default: '',
    },
    coverImage: {
      type: String,
      default: '',
    },
    location: {
      type: String,
      default: '',
      maxlength: [30, 'Location must be at most 30 characters'],
    },
    website: {
      type: String,
      default: '',
      maxlength: [100, 'Website must be at most 100 characters'],
    },
    followers: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
    }],
    following: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
    }],
    isVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
userSchema.index({ handle: 1 });
userSchema.index({ email: 1 });
userSchema.index({ displayName: 'text', handle: 'text' });

// Virtual fields
userSchema.virtual('followerCount').get(function() {
  return this.followers?.length || 0;
});

userSchema.virtual('followingCount').get(function() {
  return this.following?.length || 0;
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model<IUser>('User', userSchema);
