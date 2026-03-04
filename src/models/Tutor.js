// src/models/Tutor.js
import mongoose from 'mongoose';

const tutorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bio: { type: String, default: '' },
  subjects: [{ type: String }],
  rating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  earnings: { type: Number, default: 0 },
  availability: [{
    day: { type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
    slots: [{ startTime: String, endTime: String }]
  }],
  permanentMeetLink: { type: String },
  permanentMeetMeetingId: { type: String },
  permanentMeetCalendarEventId: { type: String },
  permanentMeetLinkCreatedAt: { type: Date },
  permanentMeetLastUsedAt: { type: Date },
  permanentMeetUsageCount: { type: Number, default: 0 },
  permanentMeetInvalidatedAt: { type: Date },
  googleOAuthRefreshToken: { type: String },
  googleOAuthScopes: [{ type: String }],
  googleOAuthExpiresAt: { type: Number },
  googleOAuthConnectedAt: { type: Date },
  googleOAuthRevokedAt: { type: Date },
  hourlyRate: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

const Tutor = mongoose.model('Tutor', tutorSchema);
export default Tutor;
