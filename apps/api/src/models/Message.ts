import mongoose, { Schema } from 'mongoose';
import { IMessage, IConversation } from '../types';

const messageSchema = new Schema<IMessage>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'Conversation is required'],
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required'],
    },
    content: {
      type: String,
      required: [true, 'Content is required'],
      maxlength: [1000, 'Message must be at most 1000 characters'],
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    clientId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
messageSchema.index({ conversation: 1, createdAt: -1, _id: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ conversation: 1, isRead: 1, sender: 1 });
messageSchema.index(
  { conversation: 1, sender: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);

export const Message = mongoose.model<IMessage>('Message', messageSchema);

const conversationSchema = new Schema<IConversation>(
  {
    participants: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Participants are required'],
    }],
    pairKey: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
conversationSchema.index({ participants: 1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ pairKey: 1 }, { unique: true, sparse: true });

export const Conversation = mongoose.model<IConversation>('Conversation', conversationSchema);
