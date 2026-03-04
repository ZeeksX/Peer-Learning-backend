// src/routes/tutorRoutes.js
import express from 'express';
import { registerTutor, loginTutor, logoutTutor } from '../controllers/tutorAuthController.js';
import {
  getMyProfile,
  updateMyProfile,
  createSession,
  getSessions,
  getSession,
  updateSession,
  deleteSession,
  getSessionRequests,
  approveSessionRequest,
  rejectSessionRequest,
  getMessages,
  getConversations,
  sendMessage,
  getSessionChat,
  sendSessionChat,
  getMyStudents,
  searchStudents,
  addStudent,
  addStudentToSession,
  removeStudentFromSession,
  getStudentProgress,
  getAnalyticsOverview,
  getEarningsAnalytics,
  getReviews,
  respondToReview,
  getReviewAnalytics
} from '../controllers/tutorController.js';
import {
  createMeeting,
  getPermanentLink,
  createSimpleMeetLink,
  createInstantMeetLink,
  startOAuth,
  oauthStatus,
  refreshOAuth,
  revokeOAuth,
  oauthCallback
} from '../controllers/googleMeetController.js';
import {
  uploadMaterialFile,
  getTutorMaterials,
  deleteMaterial
} from '../controllers/materialController.js';

import { getNotifications, clearNotifications } from '../controllers/notificationController.js';
import { protect, tutorOnly } from '../middleware/authMiddleware.js';
import { uploadSingleMaterial } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// --- Public Routes ---
router.post('/auth/register', registerTutor);
router.post('/auth/login', loginTutor);
router.post('/auth/logout', logoutTutor);

router.get('/google-meet/oauth/callback', oauthCallback);

// --- Protected Routes (Must be Logged In) ---
router.use(protect);

// Messaging
router.route('/messages')
  .get(getConversations)
  .post(sendMessage);
router.route('/messages/:userId')
  .get(getMessages);

// Notifications
router.route('/notifications')
  .get(getNotifications)
  .delete(clearNotifications);

// --- Tutor Exclusive Routes ---
router.use(tutorOnly);

// Simple meet links (no OAuth required)
router.post('/google-meet/simple', createSimpleMeetLink);
router.post('/google-meet/instant', createInstantMeetLink);

// OAuth-based meet links (requires Google account connection)
router.post('/google-meet/create-meeting', createMeeting);
router.post('/google-meet/permanent-link', getPermanentLink);
router.get('/google-meet/oauth/start', startOAuth);
router.get('/google-meet/oauth/status', oauthStatus);
router.post('/google-meet/oauth/refresh', refreshOAuth);
router.post('/google-meet/oauth/revoke', revokeOAuth);

// Profile
router.route('/me')
  .get(getMyProfile)
  .patch(updateMyProfile);

// Sessions
router.route('/sessions')
  .get(getSessions)
  .post(createSession);

// Session Chat — must be defined EARLY, before /sessions/:id pattern
router.route('/sessions/:sessionId/chat')
  .get(getSessionChat);

// Join Requests review for tutors
// MUST be defined before /sessions/:id (with :paramId)
router.route('/sessions/requests')
  .get(getSessionRequests);

// Support both /sessions/requests/:id and /sessions/:sid/requests/:id
router.post('/sessions/requests/:requestId/approve', approveSessionRequest);
router.post('/sessions/requests/:requestId/reject', rejectSessionRequest);

// Fallback routes tried by frontend
router.post('/requests/:requestId/approve', approveSessionRequest);
router.post('/requests/:requestId/reject', rejectSessionRequest);
router.post('/enrollments/requests/:requestId/approve', approveSessionRequest);
router.post('/enrollments/requests/:requestId/reject', rejectSessionRequest);

router.route('/sessions/:sessionId/requests')
  .get(getSessionRequests);

router.route('/sessions/:sessionId/requests/:requestId/approve')
  .post(approveSessionRequest);

router.route('/sessions/:sessionId/requests/:requestId/reject')
  .post(rejectSessionRequest);

router.post('/sessions/:sessionId/students', addStudentToSession);
router.post('/sessions/:sessionId/students/add', addStudentToSession);
router.post('/sessions/:sessionId/students/:studentId', addStudentToSession);
router.post('/sessions/:sessionId/enroll', addStudentToSession);
router.delete('/sessions/:sessionId/students/:studentId', removeStudentFromSession);
router.delete('/sessions/:sessionId/students/remove/:studentId', removeStudentFromSession);
router.delete('/sessions/:sessionId/enroll/:studentId', removeStudentFromSession);

// Single session route (comes after /chat route to avoid conflicts)
router.route('/sessions/:id')
  .get(getSession)
  .patch(updateSession)
  .delete(deleteSession);

// Materials
router.route('/materials')
  .get(getTutorMaterials)
  .post(uploadSingleMaterial, uploadMaterialFile);
router.route('/materials/:id')
  .delete(deleteMaterial);

// Students
router.route('/students/search')
  .get(searchStudents);

router.route('/students/add')
  .post(addStudent);

router.route('/students')
  .get(getMyStudents);
router.route('/students/:studentId/progress')
  .get(getStudentProgress);

// Analytics
router.route('/analytics/overview')
  .get(getAnalyticsOverview);
router.route('/analytics/earnings')
  .get(getEarningsAnalytics);
router.route('/analytics/reviews')
  .get(getReviewAnalytics);

// Reviews
router.route('/reviews')
  .get(getReviews);
router.route('/reviews/:id/respond')
  .post(respondToReview);

export default router;
