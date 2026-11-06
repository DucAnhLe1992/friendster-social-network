import mongoose, { Schema, Types } from 'mongoose';

export type MediaState = 'unclaimed' | 'claimed' | 'attached';

export interface IMedia {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  path: string;
  post: Types.ObjectId | null;
  state: MediaState;
  claimedAt: Date | null;
  createdAt: Date;
}

// One record per uploaded post image. Lifecycle: unclaimed -> claimed (a post is being saved) -> attached.
// Records written before `state` existed have no state field; with a post set they are treated as attached.
const mediaSchema = new Schema<IMedia>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    path: { type: String, required: true, unique: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', default: null },
    state: { type: String, enum: ['unclaimed', 'claimed', 'attached'], default: 'unclaimed' },
    claimedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

mediaSchema.index({ post: 1, createdAt: 1 });
mediaSchema.index({ state: 1, claimedAt: 1 });

export const Media = mongoose.model<IMedia>('Media', mediaSchema);
