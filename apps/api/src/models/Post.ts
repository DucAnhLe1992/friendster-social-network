import mongoose, { Query, Schema } from 'mongoose';
import { IPost } from '../types';

const postSchema = new Schema<IPost>(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Author is required'],
      index: true,
    },
    content: {
      type: String,
      default: '',
      trim: true,
      maxlength: [280, 'Post must be at most 280 characters'],
    },
    images: [{
      type: String,
    }],
    likes: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
    }],
    commentsCount: {
      type: Number,
      default: 0,
    },
    sharesCount: {
      type: Number,
      default: 0,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['pending', 'published'],
      default: 'published',
    },
    clientId: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ content: 'text' });
postSchema.index(
  { author: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } }
);
postSchema.index({ status: 1, createdAt: 1 });

// Pending posts must never leak into feeds, profiles, search, counts or populated references. Posts saved before
// this field existed have no status and count as published, hence `$ne` rather than an equality match.
const PUBLIC_QUERIES = /^(find|findOne|findOneAndUpdate|findOneAndDelete|countDocuments|updateOne)$/;
postSchema.pre(PUBLIC_QUERIES, function (this: Query<unknown, IPost>) {
  if (this.getOptions().includePending || this.getFilter().status !== undefined) return;
  this.where({ status: { $ne: 'pending' } });
});

// Virtual fields
postSchema.virtual('likeCount').get(function() {
  return this.likes?.length || 0;
});

// Pre-remove middleware to clean up comments
postSchema.pre('deleteOne', { document: true }, async function(next) {
  try {
    await mongoose.model('Comment').deleteMany({ post: this._id });
    next();
  } catch (error) {
    next(error as Error);
  }
});

export const Post = mongoose.model<IPost>('Post', postSchema);
