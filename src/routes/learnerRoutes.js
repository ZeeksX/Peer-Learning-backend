// src/routes/learnerRoutes.js
import express from 'express';
import { registerLearner, loginLearner, logoutLearner } from '../controllers/learnerAuthController.js';
import {
  getMyProfile,
  getCourses,
  enrollInCourse,
  getMyProgress,
  updateProgress,
  getMySessions,
  browseSessions,
  getRecommendations,
  getSessionDetails,
  joinSession,
  leaveSession,
  getAssessmentDetails,
  submitAssessment,
  getPeers,
  sendMessage,
  getMessages,
  rateSession,
  getSessionRating
} from '../controllers/learnerController.js';
import { getNotifications, clearNotifications } from '../controllers/notificationController.js';
import { protect, learnerOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// --- Public Routes ---
router.post('/auth/register', registerLearner);
router.post('/auth/login', loginLearner);
router.post('/auth/logout', logoutLearner);

// Course discovery (Keeping public as per your comment)
router.get('/courses', getCourses);

// --- Protected Routes (Login Required) ---
router.use(protect);
router.use(learnerOnly);

// Identity & Profile
router.route('/me')
  .get(getMyProfile);

router.route('/me/recommendations')
  .get(getRecommendations);

// Progress Management
router.route('/me/progress')
  .get(getMyProgress);

router.route('/me/progress/:courseId')
  .patch(updateProgress);

router.route('/sessions')
  .get(getMySessions);

router.route('/sessions/browse')
  .get(browseSessions);

// Rating must come before the generic :sessionId route so Express matches correctly
router.route('/sessions/:sessionId/rate')
  .get(getSessionRating)
  .post(rateSession);

router.route('/sessions/:sessionId')
  .get(getSessionDetails);

router.route('/sessions/:sessionId/join')
  .post(joinSession);

router.route('/sessions/:sessionId/leave')
  .post(leaveSession);

// Course Interactions
router.route('/courses/:id/enroll')
  .post(enrollInCourse);

// Assessments
router.route('/assessments/:id')
  .get(getAssessmentDetails)
  .post(submitAssessment); // Using .post() for submissions on the same ID path

// Notifications
router.route('/notifications')
  .get(getNotifications)
  .delete(clearNotifications);

// Peer Interaction & Messaging
router.route('/peers')
  .get(getPeers);
router.route('/messages')
  .post(sendMessage);
router.route('/messages/:userId')
  .get(getMessages);

export default router;
