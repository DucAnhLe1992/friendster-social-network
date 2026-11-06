import mongoose, { Schema, Types } from 'mongoose';

export interface IRefreshSession {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  jti: string;
  family: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  issuedAt?: number;
  successorJti?: string;
}

const refreshSessionSchema = new Schema<IRefreshSession>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true },
    // Stable id shared by every token rotated from the same sign-in
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    rotatedAt: { type: Date, default: null },
    issuedAt: { type: Number },
    successorJti: { type: String },
  },
  { timestamps: true }
);

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSession = mongoose.model<IRefreshSession>('RefreshSession', refreshSessionSchema);
