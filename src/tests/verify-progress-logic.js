import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Course from '../models/Course.js';
import Progress from '../models/Progress.js';
import User from '../models/User.js';
import Tutor from '../models/Tutor.js';

dotenv.config();

const testProgress = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Create a dummy tutor and course
    const user = await User.create({
      name: 'Test Tutor',
      email: `tutor-${Date.now()}@test.com`,
      password: 'password123',
      role: 'tutor'
    });

    const tutor = await Tutor.create({
      userId: user._id,
      subjects: ['Math'],
      hourlyRate: 30
    });

    const course = await Course.create({
      title: 'Test Course',
      tutorId: tutor._id,
      price: 100,
      modules: ['Module 1', 'Module 2', 'Module 3', 'Module 4'],
      published: true
    });

    console.log('Created course with 4 modules');

    // 2. Create a dummy learner and progress
    const learner = await User.create({
      name: 'Test Learner',
      email: `learner-${Date.now()}@test.com`,
      password: 'password123',
      role: 'student'
    });

    let progress = await Progress.create({
      learnerId: learner._id,
      courseId: course._id,
      completedModules: []
    });

    console.log('Created initial progress (0%)');

    // 3. Simulate module completion (Logic from controller)
    const updateProgressLogic = async (prog, moduleId) => {
      const p = await Progress.findById(prog._id).populate('courseId');
      if (!p.completedModules.includes(moduleId)) {
        p.completedModules.push(moduleId);
      }
      const totalModules = p.courseId?.modules?.length || 0;
      if (totalModules > 0) {
        p.completionPercentage = Math.round((p.completedModules.length / totalModules) * 100);
      }
      await p.save();
      return p;
    };

    progress = await updateProgressLogic(progress, 'Module 1');
    console.log(`Completed 1/4 modules. Percentage: ${progress.completionPercentage}%`);

    progress = await updateProgressLogic(progress, 'Module 2');
    console.log(`Completed 2/4 modules. Percentage: ${progress.completionPercentage}%`);

    // Clean up
    await Course.findByIdAndDelete(course._id);
    await Progress.findByIdAndDelete(progress._id);
    await Tutor.findByIdAndDelete(tutor._id);
    await User.findByIdAndDelete(user._id);
    await User.findByIdAndDelete(learner._id);

    console.log('Test completed successfully and data cleaned up.');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
};

testProgress();
