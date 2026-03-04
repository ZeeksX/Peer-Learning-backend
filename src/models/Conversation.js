// src/models/Conversation.js
import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
    unreadCounts: { type: Map, of: Number, default: {} }
}, { timestamps: true });

conversationSchema.index({ participants: 1 });
conversationSchema.index({ sessionId: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
