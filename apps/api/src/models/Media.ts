import mongoose, { Schema, Types } from 'mongoose';

export interface IMedia {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  path: string;
  post: Types.ObjectId | null;
  createdAt: Date;
}

// One record per uploaded post image; `post` is set once, when a single post claims it.
const mediaSchema = new Schema<IMedia>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    path: { type: String, required: true, unique: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

mediaSchema.index({ post: 1, createdAt: 1 });

export const Media = mongoose.model<IMedia>('Media', mediaSchema);
