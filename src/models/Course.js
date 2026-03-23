import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', required: true },
  price: { type: Number, required: true },
  tags: [String],
  level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'] },
  modules: [{ type: String }], // Array of module titles or identifiers
  published: { type: Boolean, default: false }
}, { timestamps: true });

const Course = mongoose.model('Course', courseSchema);
export default Course;
