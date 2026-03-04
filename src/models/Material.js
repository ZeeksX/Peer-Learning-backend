import mongoose from 'mongoose';

const materialSchema = new mongoose.Schema({
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  originalName: { type: String, required: true },
  storedName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  filePath: { type: String, required: true },
  fileUrl: { type: String, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

materialSchema.index({ tutorId: 1, createdAt: -1 });
materialSchema.index({ sessionId: 1, createdAt: -1 });

const Material = mongoose.model('Material', materialSchema);
export default Material;
