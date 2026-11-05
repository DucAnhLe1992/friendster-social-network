import mongoose, { Schema, Types } from 'mongoose';

export interface IRefreshSession {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  jti: string;
  expiresAt: Date;
  rotatedAt: Date | null;
}

const refreshSessionSchema = new Schema<IRefreshSession>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    rotatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSession = mongoose.model<IRefreshSession>('RefreshSession', refreshSessionSchema);
