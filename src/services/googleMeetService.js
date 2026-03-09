// src/services/googleMeetService.js
import { google } from 'googleapis';
import crypto from 'crypto';
import GoogleMeetMeeting from '../models/GoogleMeetMeeting.js';
import Tutor from '../models/Tutor.js';

/**
 * Generate a simple Google Meet link without OAuth.
 * Uses Google's official quick-create URL instead of fabricated meeting codes.
 */
export const generateSimpleMeetLink = ({ tutorId, sessionId = null } = {}) => {
  // Generate stable meeting room code from tutorId or sessionId
  // Format: 3 groups of 3 lowercase letters/digits (e.g., abc-def-ghi)
  // Google Meet accepts: https://meet.google.com/[room-code]
  const baseId = sessionId ? sessionId.toString() : (tutorId ? tutorId.toString() : 'generic');
  const hash = crypto.createHash('sha256').update(baseId).digest();
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let roomCode = '';
  for (let i = 0; i < 9; i++) {
    roomCode += characters[hash[i] % 36];
    if (i === 2 || i === 5) roomCode += '-';
  }

  return {
    joinUrl: `https://meet.google.com/${roomCode}`,
    meetingId: roomCode,
    provider: 'google_meet',
    requiresOAuth: false,
    note: 'Stable Meet room code - same link for all participants without OAuth. Format: https://meet.google.com/xxx-xxx-xxx'
  };
};

/**
 * Generate an instant meet.new redirect link.
 * This will create a new random meeting when the user visits the link.
 */
export const generateInstantMeetLink = () => {
  return {
    joinUrl: 'https://meet.google.com/new',
    meetingId: `instant-${Date.now()}`,
    provider: 'google_meet',
    requiresOAuth: false,
    note: 'Instant meet link - creates a new random meeting when visited'
  };
};

// FIX 1: Removed GOOGLE_REFRESH_TOKEN from env — each tutor uses their own stored token.
// requireRefreshToken only validates the client credentials, NOT a system-level token.
const getOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const error = new Error('Google OAuth credentials are not configured');
    error.code = 'AUTH_CONFIGURATION_MISSING';
    error.status = 500;
    throw error;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const mapGoogleError = (error) => {
  const status = error?.response?.status;
  const reason = error?.response?.data?.error?.errors?.[0]?.reason;
  const oauthError = error?.response?.data?.error;
  const message =
    error?.response?.data?.error?.message ||
    error?.response?.data?.error_description ||
    error.message;

  if (oauthError === 'invalid_grant') return { status: 401, code: 'AUTH_FAILED', message };
  if (status === 401) return { status: 401, code: 'AUTH_FAILED', message };
  if (status === 403 && reason === 'quotaExceeded') return { status: 429, code: 'QUOTA_EXCEEDED', message };
  if (status === 403) return { status: 403, code: 'PERMISSION_DENIED', message };
  return { status: status || 500, code: 'GOOGLE_API_ERROR', message };
};

const throwMapped = (error) => {
  if (error?.code && error?.status) throw error;
  const mapped = mapGoogleError(error);
  const err = new Error(mapped.message);
  err.code = mapped.code;
  err.status = mapped.status;
  throw err;
};

const validateTimeSlot = (scheduledTime, durationMinutes) => {
  const startTime = new Date(scheduledTime);
  if (Number.isNaN(startTime.getTime())) {
    const error = new Error('Invalid scheduledTime');
    error.code = 'INVALID_TIME_SLOT';
    error.status = 400;
    throw error;
  }
  if (!durationMinutes || Number(durationMinutes) <= 0) {
    const error = new Error('Invalid durationMinutes');
    error.code = 'INVALID_TIME_SLOT';
    error.status = 400;
    throw error;
  }
  const endTime = new Date(startTime.getTime() + Number(durationMinutes) * 60000);
  if (endTime <= startTime) {
    const error = new Error('Invalid time range');
    error.code = 'INVALID_TIME_SLOT';
    error.status = 400;
    throw error;
  }
  // FIX 2: Allow a 30-second grace period to account for server processing delays
  if (startTime <= new Date(Date.now() - 30000)) {
    const error = new Error('Scheduled time must be in the future');
    error.code = 'INVALID_TIME_SLOT';
    error.status = 400;
    throw error;
  }
  return { startTime, endTime };
};

const buildCalendarClient = (refreshToken) => {
  const auth = getOAuthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: 'v3', auth });
};

const getOAuthScopes = () => {
  const rawScopes = process.env.GOOGLE_OAUTH_SCOPES;
  if (rawScopes) {
    return rawScopes.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return ['https://www.googleapis.com/auth/calendar.events'];
};

const encodeState = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');
const decodeState = (value) => {
  if (!value) return {};
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf-8'));
  } catch {
    return {};
  }
};

const createCalendarEventWithMeet = async ({ summary, startTime, endTime, refreshToken }) => {
  if (!refreshToken) {
    const error = new Error('Google account is not connected. Please connect your Google account first.');
    error.code = 'AUTH_FAILED';
    error.status = 401;
    throw error;
  }

  const calendar = buildCalendarClient(refreshToken);
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const requestId = crypto.randomUUID();

  try {
    const event = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      requestBody: {
        summary,
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    });

    const eventData = event?.data;
    const joinUrl =
      eventData?.hangoutLink || eventData?.conferenceData?.entryPoints?.[0]?.uri;
    const meetingId = eventData?.conferenceData?.conferenceId || eventData?.id;

    if (!joinUrl || !meetingId || !eventData?.id) {
      const error = new Error('Failed to generate meeting link');
      error.code = 'MEETING_LINK_FAILED';
      error.status = 500;
      throw error;
    }

    return { joinUrl, meetingId, calendarEventId: eventData.id };
  } catch (error) {
    throwMapped(error);
  }
};

const validatePermanentLink = async ({ calendarEventId, refreshToken }) => {
  if (!refreshToken) {
    return { valid: false, reason: 'MEETING_LINK_INVALID' };
  }
  const calendar = buildCalendarClient(refreshToken);
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  try {
    const event = await calendar.events.get({ calendarId, eventId: calendarEventId });
    const eventData = event?.data;
    if (!eventData || eventData.status === 'cancelled') {
      return { valid: false, reason: 'MEETING_LINK_INVALID' };
    }
    const joinUrl =
      eventData?.hangoutLink || eventData?.conferenceData?.entryPoints?.[0]?.uri;
    if (!joinUrl) {
      return { valid: false, reason: 'MEETING_LINK_INVALID' };
    }
    return { valid: true, joinUrl };
  } catch (error) {
    const status = error?.response?.status;
    if (status === 404 || status === 410) {
      return { valid: false, reason: 'MEETING_LINK_INVALID' };
    }
    throwMapped(error);
  }
};

export const createGoogleMeetMeeting = async ({
  tutorId,
  studentId,
  scheduledTime,
  meetingTitle,
  durationMinutes = 60,
}) => {
  const { startTime, endTime } = validateTimeSlot(scheduledTime, durationMinutes);

  try {
    const tutor = await Tutor.findById(tutorId);
    if (!tutor || !tutor.googleOAuthRefreshToken) {
      const error = new Error('Google account is not connected. Please connect your Google account first.');
      error.code = 'AUTH_FAILED';
      error.status = 401;
      throw error;
    }

    const { joinUrl, meetingId, calendarEventId } = await createCalendarEventWithMeet({
      summary: meetingTitle,
      startTime,
      endTime,
      refreshToken: tutor.googleOAuthRefreshToken,
    });

    const meetingDoc = await GoogleMeetMeeting.create({
      tutorId,
      studentId,
      meetingId,
      calendarEventId,
      joinUrl,
      title: meetingTitle,
      startTime,
      endTime,
    });

    return {
      meetingId: meetingDoc.meetingId,
      joinUrl: meetingDoc.joinUrl,
      startTime: meetingDoc.startTime,
      endTime: meetingDoc.endTime,
    };
  } catch (error) {
    throwMapped(error);
  }
};

export const getOrCreatePermanentGoogleMeetLink = async ({
  tutorId,
  meetingTitle,
  scheduledTime,
  durationMinutes = 60,
  forceNew = false,
}) => {
  const tutor = await Tutor.findById(tutorId);
  if (!tutor) {
    const error = new Error('Tutor not found');
    error.code = 'TUTOR_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  const now = new Date();
  const hadExisting = Boolean(tutor.permanentMeetLink);

  if (!forceNew && tutor.permanentMeetLink && tutor.permanentMeetCalendarEventId && !tutor.permanentMeetInvalidatedAt) {
    const validation = await validatePermanentLink({
      calendarEventId: tutor.permanentMeetCalendarEventId,
      refreshToken: tutor.googleOAuthRefreshToken,
    });

    if (validation.valid) {
      await Tutor.updateOne(
        { _id: tutor._id },
        { $inc: { permanentMeetUsageCount: 1 }, $set: { permanentMeetLastUsedAt: now } }
      );
      console.log(JSON.stringify({
        event: 'google_meet_permanent_link_reused',
        tutorId: String(tutor._id),
        calendarEventId: tutor.permanentMeetCalendarEventId,
        meetingId: tutor.permanentMeetMeetingId,
      }));
      const updatedTutor = await Tutor.findById(tutor._id);
      return formatPermanentLinkResponse(updatedTutor);
    }

    await Tutor.updateOne({ _id: tutor._id }, { $set: { permanentMeetInvalidatedAt: now } });
    console.log(JSON.stringify({
      event: 'google_meet_permanent_link_invalidated',
      tutorId: String(tutor._id),
      calendarEventId: tutor.permanentMeetCalendarEventId,
    }));
  }

  // FIX 2: Use 2 minutes from now as default, with the grace period in validateTimeSlot
  const defaultScheduledTime = new Date(Date.now() + 2 * 60000).toISOString();
  const { startTime, endTime } = validateTimeSlot(
    scheduledTime || defaultScheduledTime,
    durationMinutes
  );

  try {
    const { joinUrl, meetingId, calendarEventId } = await createCalendarEventWithMeet({
      summary: meetingTitle || 'Permanent Tutor Room',
      startTime,
      endTime,
      refreshToken: tutor.googleOAuthRefreshToken,
    });

    await Tutor.updateOne(
      { _id: tutor._id },
      {
        $set: {
          permanentMeetLink: joinUrl,
          permanentMeetMeetingId: meetingId,
          permanentMeetCalendarEventId: calendarEventId,
          permanentMeetLinkCreatedAt: now,
          permanentMeetLastUsedAt: now,
          permanentMeetInvalidatedAt: null,
        },
        $inc: { permanentMeetUsageCount: 1 },
      }
    );

    console.log(JSON.stringify({
      event: hadExisting || forceNew
        ? 'google_meet_permanent_link_regenerated'
        : 'google_meet_permanent_link_assigned',
      tutorId: String(tutor._id),
      calendarEventId,
      meetingId,
    }));

    const updatedTutor = await Tutor.findById(tutor._id);
    return formatPermanentLinkResponse(updatedTutor);
  } catch (error) {
    throwMapped(error);
  }
};

const formatPermanentLinkResponse = (tutor) => ({
  meetingId: tutor.permanentMeetMeetingId,
  joinUrl: tutor.permanentMeetLink,
  startTime: tutor.permanentMeetLinkCreatedAt,
  endTime: null,
  usageCount: tutor.permanentMeetUsageCount,
  lastUsedAt: tutor.permanentMeetLastUsedAt,
  invalidatedAt: tutor.permanentMeetInvalidatedAt,
  calendarEventId: tutor.permanentMeetCalendarEventId,
});

export const getGoogleOAuthUrl = ({ redirect, tutorId } = {}) => {
  const oauth2Client = getOAuthClient();
  const scopes = getOAuthScopes();
  const state = encodeState({ redirect, tutorId });
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state,
  });
  return { url, scopes };
};

export const getGoogleOAuthStatus = async ({ tutorId }) => {
  const tutor = await Tutor.findById(tutorId);
  const refreshToken = tutor?.googleOAuthRefreshToken;
  if (!refreshToken) {
    return { connected: false, expiresAt: null, scopes: [], status: 'missing_token' };
  }
  try {
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const accessTokenResponse = await oauth2Client.getAccessToken();
    const accessToken = accessTokenResponse?.token;
    if (!accessToken) {
      return { connected: false, expiresAt: null, scopes: [], status: 'token_error' };
    }
    const tokenInfo = await oauth2Client.getTokenInfo(accessToken);
    return {
      connected: true,
      expiresAt: tokenInfo?.expiry_date || null,
      scopes: tokenInfo?.scopes || [],
      status: 'connected',
    };
  } catch (error) {
    const mapped = mapGoogleError(error);
    if (mapped.code === 'AUTH_FAILED') {
      return { connected: false, expiresAt: null, scopes: [], status: 'invalid_grant' };
    }
    throwMapped(error);
  }
};

export const refreshGoogleOAuth = async ({ tutorId }) => {
  try {
    const tutor = await Tutor.findById(tutorId);
    if (!tutor?.googleOAuthRefreshToken) {
      const error = new Error('Google account is not connected');
      error.code = 'AUTH_FAILED';
      error.status = 401;
      throw error;
    }
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: tutor.googleOAuthRefreshToken });
    const accessTokenResponse = await oauth2Client.getAccessToken();
    const accessToken = accessTokenResponse?.token;
    if (!accessToken) {
      const error = new Error('Failed to refresh access token');
      error.code = 'AUTH_FAILED';
      error.status = 401;
      throw error;
    }
    const tokenInfo = await oauth2Client.getTokenInfo(accessToken);
    await Tutor.updateOne(
      { _id: tutor._id },
      { $set: { googleOAuthExpiresAt: tokenInfo?.expiry_date || null, googleOAuthRevokedAt: null } }
    );
    return {
      connected: true,
      expiresAt: tokenInfo?.expiry_date || null,
      scopes: tokenInfo?.scopes || [],
      status: 'refreshed',
    };
  } catch (error) {
    throwMapped(error);
  }
};

export const revokeGoogleOAuth = async ({ tutorId }) => {
  try {
    const tutor = await Tutor.findById(tutorId);
    if (!tutor?.googleOAuthRefreshToken) {
      return { revoked: true };
    }
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: tutor.googleOAuthRefreshToken });
    await oauth2Client.revokeCredentials();
    await Tutor.updateOne(
      { _id: tutor._id },
      {
        $set: {
          googleOAuthRefreshToken: null,
          googleOAuthScopes: [],
          googleOAuthExpiresAt: null,
          googleOAuthRevokedAt: new Date(),
        },
      }
    );
    return { revoked: true };
  } catch (error) {
    throwMapped(error);
  }
};

export const handleOAuthCallback = async ({ code, state }) => {
  if (!code) {
    const error = new Error('Missing authorization code');
    error.code = 'AUTH_FAILED';
    error.status = 400;
    throw error;
  }

  const { tutorId, redirect } = decodeState(state);
  if (!tutorId) {
    const error = new Error('Missing tutor identity in OAuth state. Please start the OAuth flow again.');
    error.code = 'AUTH_FAILED';
    error.status = 400;
    throw error;
  }

  const tutor = await Tutor.findById(tutorId);
  if (!tutor) {
    const error = new Error('Tutor not found');
    error.code = 'TUTOR_NOT_FOUND';
    error.status = 404;
    throw error;
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens?.refresh_token || tutor.googleOAuthRefreshToken;
    if (!refreshToken) {
      const error = new Error('Refresh token not received. Please revoke access and reconnect.');
      error.code = 'AUTH_FAILED';
      error.status = 401;
      throw error;
    }

    await Tutor.updateOne(
      { _id: tutor._id },
      {
        $set: {
          googleOAuthRefreshToken: refreshToken,
          googleOAuthScopes: tokens?.scope ? tokens.scope.split(' ') : tutor.googleOAuthScopes,
          googleOAuthExpiresAt: tokens?.expiry_date || tutor.googleOAuthExpiresAt || null,
          googleOAuthConnectedAt: new Date(),
          googleOAuthRevokedAt: null,
        },
      }
    );

    return { redirectUrl: redirect || process.env.FRONTEND_URL || '/' };
  } catch (error) {
    throwMapped(error);
  }
};