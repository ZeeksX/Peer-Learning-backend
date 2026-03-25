// src/models/Session.js
import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: { type: String, required: true },
  description: { type: String, default: '' },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  // tutorId references the Tutor document (NOT User) — important for auth checks
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', required: true },
  // studentIds references User documents
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  status: {
    type: String,
    enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  meetingLink: { type: String },
  // FIX: Added meetingProvider and meetingId — were being sent from frontend but not saved
  meetingProvider: { type: String, enum: ['google_meet', 'zoom', 'teams', 'jitsi_meet', null], default: null },
  meetingId: { type: String },
  maxParticipants: { type: Number, default: 1 }
}, { timestamps: true });

const Session = mongoose.model('Session', sessionSchema);
export default Session;