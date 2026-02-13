import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import Progress from '../models/Progress.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import LearnerProfile from '../models/LearnerProfile.js';
import { sendSuccess, sendError } from '../middleware/responseHandler.js';

// --- Profile Management ---
export const getMyProfile = async (req, res) => {
  try {
    const profile = await LearnerProfile.findOne({ userId: req.user._id }).populate('userId', 'name email role');
    return sendSuccess(res, profile);
  } catch (error) {
    return sendError(res, error.message, 'FETCH_PROFILE_FAILED', 500);
  }
};

// --- Course Enrollment & Discovery ---
export const getCourses = async (req, res) => {
  try {
    const { subject, level, tutor } = req.query;
    let query = { published: true };

    if (subject) query.tags = { $in: [subject] };
    if (level) query.level = level;
    if (tutor) query.tutorId = tutor;

    const courses = await Course.find(query).populate('tutorId', 'name email');
    return sendSuccess(res, courses);
  } catch (error) {
    return sendError(res, error.message, 'FETCH_COURSES_FAILED', 500);
  }
};

export const enrollInCourse = async (req, res) => {
  try {
    const { id: courseId } = req.params;
    const learnerId = req.user._id;

    // Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({ learnerId, courseId });
    if (existingEnrollment) {
      return sendError(res, 'Learner is already enrolled in this session', 'LEARNER_ENROLLMENT_DENIED', 400);
    }

    const enrollment = await Enrollment.create({ learnerId, courseId });
    
    // Create initial progress
    await Progress.create({ learnerId, courseId });

    // Update LearnerProfile
    await LearnerProfile.findOneAndUpdate(
      { userId: learnerId },
      { $addToSet: { enrolledCourses: courseId } }
    );

    return sendSuccess(res, enrollment, 201);
  } catch (error) {
    return sendError(res, error.message, 'ENROLLMENT_FAILED', 500);
  }
};

// --- Progress & Learning ---
export const getMyProgress = async (req, res) => {
  try {
    const progress = await Progress.find({ learnerId: req.user._id }).populate('courseId');
    return sendSuccess(res, progress);
  } catch (error) {
    return sendError(res, error.message, 'FETCH_PROGRESS_FAILED', 500);
  }
};

export const updateProgress = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { moduleId } = req.body;
    
    const progress = await Progress.findOneAndUpdate(
      { learnerId: req.user._id, courseId },
      { 
        $addToSet: { completedModules: moduleId },
        lastAccessed: new Date()
      },
      { new: true }
    );

    if (!progress) return sendError(res, 'Progress record not found', 'PROGRESS_NOT_FOUND', 404);
    
    return sendSuccess(res, progress);
  } catch (error) {
    return sendError(res, error.message, 'UPDATE_PROGRESS_FAILED', 500);
  }
};

// --- Assessment Submissions ---
export const getAssessmentDetails = async (req, res) => {
  try {
    // In a real app, you'd have an Assessment model. For now, we return mock/params
    return sendSuccess(res, { assessmentId: req.params.id, title: 'Sample Assessment' });
  } catch (error) {
    return sendError(res, error.message, 'FETCH_ASSESSMENT_FAILED', 500);
  }
};

export const submitAssessment = async (req, res) => {
  try {
    const { id: assessmentId } = req.params;
    const { submissionUrl } = req.body;

    const submission = await AssessmentSubmission.create({
      assessmentId,
      learnerId: req.user._id,
      submissionUrl
    });

    return sendSuccess(res, submission, 201);
  } catch (error) {
    return sendError(res, error.message, 'SUBMISSION_FAILED', 500);
  }
};

// --- Peer Interaction ---
export const getPeers = async (req, res) => {
  try {
    const myProfile = await LearnerProfile.findOne({ userId: req.user._id });
    const peers = await LearnerProfile.find({
      userId: { $ne: req.user._id },
      enrolledCourses: { $in: myProfile.enrolledCourses }
    }).populate('userId', 'name email');

    return sendSuccess(res, peers.map(p => p.userId));
  } catch (error) {
    return sendError(res, error.message, 'FETCH_PEERS_FAILED', 500);
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    const newMessage = await Message.create({
      senderId: req.user._id,
      receiverId,
      message
    });

    return sendSuccess(res, newMessage, 201);
  } catch (error) {
    return sendError(res, error.message, 'SEND_MESSAGE_FAILED', 500);
  }
};
