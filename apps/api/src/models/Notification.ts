import mongoose, { Schema } from 'mongoose';
import { INotification } from '../types';

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient is required'],
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required'],
    },
    type: {
      type: String,
      enum: ['like', 'comment', 'reply', 'follow', 'mention'],
      required: [true, 'Type is required'],
    },
    post: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      default: null,
    },
    comment: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
