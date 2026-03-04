// src/controllers/googleMeetController.js
import {
  createGoogleMeetMeeting,
  getOrCreatePermanentGoogleMeetLink,
  getGoogleOAuthUrl,
  getGoogleOAuthStatus,
  refreshGoogleOAuth,
  revokeGoogleOAuth,
  handleOAuthCallback,
  generateSimpleMeetLink,
  generateInstantMeetLink
} from '../services/googleMeetService.js';
import { sendSuccess, sendError } from '../middleware/responseHandler.js';

/**
 * POST /v1/tutor/google-meet/simple
 * Generate a simple meet link without OAuth (no Google account connection needed).
 */
export const createSimpleMeetLink = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const tutorId = req.tutor?._id;

    if (!tutorId) {
      return sendError(res, 'Tutor authentication required', 'AUTH_REQUIRED', 401);
    }

    const meeting = generateSimpleMeetLink({ 
      tutorId, 
      sessionId,
      prefix: 'tutor'
    });

    return sendSuccess(res, meeting, 201);
  } catch (error) {
    return sendError(res, error.message, error.code || 'GOOGLE_MEET_FAILED', error.status || 500);
  }
};

/**
 * POST /v1/tutor/google-meet/instant
 * Generate an instant meet.new link (creates random meeting when visited).
 */
export const createInstantMeetLink = async (req, res) => {
  try {
    const meeting = generateInstantMeetLink();
    return sendSuccess(res, meeting, 201);
  } catch (error) {
    return sendError(res, error.message, error.code || 'GOOGLE_MEET_FAILED', error.status || 500);
  }
};

export const createMeeting = async (req, res) => {
  try {
    const { tutorId, studentId, scheduledTime, meetingTitle, durationMinutes } = req.body;
    const missingFields = ['tutorId', 'studentId', 'scheduledTime', 'meetingTitle'].filter(
      (field) => !req.body[field]
    );

    if (missingFields.length > 0) {
      return sendError(res, `Missing required fields: ${missingFields.join(', ')}`, 'MISSING_FIELDS', 400);
    }

    if (req.tutor && String(req.tutor._id) !== String(tutorId)) {
      return sendError(res, 'Tutor does not match authenticated user', 'TUTOR_MISMATCH', 403);
    }

    const meeting = await createGoogleMeetMeeting({
      tutorId,
      studentId,
      scheduledTime,
      meetingTitle,
      durationMinutes
    });

    return sendSuccess(res, meeting, 201);
  } catch (error) {
    return sendError(res, error.message, error.code || 'GOOGLE_MEET_FAILED', error.status || 500);
  }
};

export const getPermanentLink = async (req, res) => {
  try {
    const {
      tutorId,
      scheduledTime,
      meetingTitle,
      durationMinutes,
      forceNew
    } = req.body;

    const resolvedTutorId = tutorId || req.tutor?._id;
    const missingFields = ['tutorId'].filter((field) => !resolvedTutorId);

    if (missingFields.length > 0) {
      return sendError(res, 'Missing required fields: tutorId', 'MISSING_FIELDS', 400);
    }

    if (req.tutor && String(req.tutor._id) !== String(resolvedTutorId)) {
      return sendError(res, 'Tutor does not match authenticated user', 'TUTOR_MISMATCH', 403);
    }

    const meeting = await getOrCreatePermanentGoogleMeetLink({
      tutorId: resolvedTutorId,
      meetingTitle: meetingTitle || 'Permanent Tutor Room',
      scheduledTime,
      durationMinutes,
      forceNew: Boolean(forceNew)
    });

    return sendSuccess(res, meeting, 201);
  } catch (error) {
    return sendError(res, error.message, error.code || 'GOOGLE_MEET_FAILED', error.status || 500);
  }
};

export const startOAuth = async (req, res) => {
  try {
    const { redirect } = req.query;
    const payload = getGoogleOAuthUrl({ redirect, tutorId: req.tutor?._id });
    return sendSuccess(res, payload);
  } catch (error) {
    return sendError(res, error.message, error.code || 'GOOGLE_OAUTH_FAILED', error.status || 500);
  }
};

export const oauthStatus = async (req, res) => {
  try {
    const payload = await getGoogleOAuthStatus({ tutorId: req.tutor?._id });
    return sendSuccess(res, payload);
  } catch (error) {
    return sendError(res, error.message, error.code || 'GOOGLE_OAUTH_FAILED', error.status || 500);
  }
};

export const refreshOAuth = async (req, res) => {
  try {
    const payload = await refreshGoogleOAuth({ tutorId: req.tutor?._id });
    return sendSuccess(res, payload);
  } catch (error) {
    return sendError(res, error.message, error.code || 'GOOGLE_OAUTH_FAILED', error.status || 500);
  }
};

export const revokeOAuth = async (req, res) => {
  try {
    const payload = await revokeGoogleOAuth({ tutorId: req.tutor?._id });
    return sendSuccess(res, payload);
  } catch (error) {
    return sendError(res, error.message, error.code || 'GOOGLE_OAUTH_FAILED', error.status || 500);
  }
};

export const oauthCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const payload = await handleOAuthCallback({ code, state });
    return res.redirect(payload.redirectUrl);
  } catch (error) {
    return sendError(res, error.message, error.code || 'GOOGLE_OAUTH_FAILED', error.status || 500);
  }
};
