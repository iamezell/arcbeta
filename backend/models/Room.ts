import mongoose, { Schema, Document } from 'mongoose';

export interface IRoom extends Document {
  roomId: string;
  users: string[];
  isActive: boolean;
  createdAt: Date;
  activatedAt?: Date;
}

const RoomSchema: Schema = new Schema({
  roomId: { type: String, required: true, unique: true },
  users: [{ type: String }],
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  activatedAt: { type: Date }
});

export default mongoose.model<IRoom>('Room', RoomSchema);

