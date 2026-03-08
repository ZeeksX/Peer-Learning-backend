import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'MESSAGE', 'SESSION'], default: 'INFO' },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    data: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });

notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
