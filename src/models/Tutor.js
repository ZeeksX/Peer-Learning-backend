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
  hourlyRate: { type: Number, default: 0 },
  verified: { type: Boolean, default: false }
}, { timestamps: true });

const Tutor = mongoose.model('Tutor', tutorSchema);
export default Tutor;
