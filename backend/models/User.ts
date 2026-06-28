import mongoose, { Schema, Document } from 'mongoose';

export type DeviceType = 'phone' | 'desktop' | 'headset' | 'unknown';

export interface IUser extends Document {
  socketId: string;
  name: string;
  role: 'Director' | 'Actor' | 'Audience';
  roomId?: string;
  // false = waiting on the lobby page, true = already inside the 3D scene
  inScene: boolean;
  /** Rehearsal show/session code this participant joined under. */
  showCode?: string;
  /** Best-effort device class detected from the user agent. */
  deviceType?: DeviceType;
  joinedAt: Date;
  createdAt: Date;
}

const UserSchema: Schema = new Schema({
  socketId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['Director', 'Actor', 'Audience'], required: true },
  roomId: { type: String },
  inScene: { type: Boolean, default: false },
  showCode: { type: String },
  deviceType: { type: String, enum: ['phone', 'desktop', 'headset', 'unknown'], default: 'unknown' },
  joinedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IUser>('User', UserSchema);

