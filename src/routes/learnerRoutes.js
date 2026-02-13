import express from 'express';
import { registerLearner, loginLearner, logoutLearner } from '../controllers/learnerAuthController.js';
import { 
  getMyProfile,
  getCourses, 
  enrollInCourse, 
  getMyProgress, 
  updateProgress, 
  getAssessmentDetails, 
  submitAssessment,
  getPeers,
  sendMessage
} from '../controllers/learnerController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/auth/register', registerLearner);
router.post('/auth/login', loginLearner);
router.post('/auth/logout', logoutLearner);

// Course discovery (can be public or protected)
router.get('/courses', getCourses);

// Protected routes
router.use(protect);

// Auth Me route
router.get('/auth/me', getMyProfile);

// Enrollment
router.post('/courses/:id/enroll', enrollInCourse);

// Progress
router.get('/me/progress', getMyProgress);
router.patch('/me/progress/:courseId', updateProgress);

// Assessments
router.get('/assessments/:id', getAssessmentDetails);
router.post('/assessments/:id/submit', submitAssessment);

// Peer Interaction
router.get('/peers', getPeers);
router.post('/messages', sendMessage);

export default router;
