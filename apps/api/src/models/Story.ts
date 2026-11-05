import mongoose, { Schema } from 'mongoose';
import { IStory } from '../types';

const storySchema = new Schema<IStory>(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author is required'],
      index: true,
    },
    mediaUrl: {
      type: String,
      required: [true, 'Media URL is required'],
    },
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      default: 'image',
    },
    views: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
    }],
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
storySchema.index({ author: 1, createdAt: -1 });
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual fields
storySchema.virtual('viewCount').get(function() {
  return this.views?.length || 0;
});

export const Story = mongoose.model<IStory>('Story', storySchema);
