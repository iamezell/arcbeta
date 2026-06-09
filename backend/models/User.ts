import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  socketId: string;
  name: string;
  role: 'Director' | 'Actor' | 'Audience';
  roomId?: string;
  // false = waiting on the lobby page, true = already inside the 3D scene
  inScene: boolean;
  createdAt: Date;
}

const UserSchema: Schema = new Schema({
  socketId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['Director', 'Actor', 'Audience'], required: true },
  roomId: { type: String },
  inScene: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IUser>('User', UserSchema);

