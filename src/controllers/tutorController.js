// src/controllers/tutorController.js
import Tutor from '../models/Tutor.js';
import Session from '../models/Session.js';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import Review from '../models/Review.js';
import Message from '../models/Message.js';
import SessionJoinRequest from '../models/SessionJoinRequest.js';
import ChatMessage from '../models/ChatMessage.js';
import Conversation from '../models/Conversation.js';
import { sendSuccess, sendError } from '../middleware/responseHandler.js';
import { getOrCreatePermanentGoogleMeetLink, generateSimpleMeetLink } from '../services/googleMeetService.js';
import { emitToConversation, broadcast } from '../services/wsService.js';

// --- Profile Management ---
export const getMyProfile = async (req, res) => {
  try {
    const tutor = await Tutor.findOne({ userId: req.user._id }).populate('userId', 'name email role');
    return sendSuccess(res, tutor);
  } catch (error) {
    return sendError(res, error.message, 'FETCH_PROFILE_FAILED', 500);
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    const { bio, subjects, hourlyRate, availability } = req.body;
    const tutor = await Tutor.findOneAndUpdate(
      { userId: req.user._id },
      { bio, subjects, hourlyRate, availability },
      { new: true, runValidators: true }
    );
    return sendSuccess(res, tutor);
  } catch (error) {
    return sendError(res, error.message, 'UPDATE_PROFILE_FAILED', 500);
  }
};

// --- Session Scheduling ---
export const createSession = async (req, res) => {
  try {
    // Validate tutor authentication
    if (!req.tutor) {
      return sendError(res, 'Tutor profile not found', 'TUTOR_NOT_FOUND', 404);
    }

    const {
      title,
      subject,
      description,
      courseId,
      startTime,
      endTime,
      maxParticipants,
      meetingLink: clientMeetingLink,
      meetingProvider,
      meetingId: clientMeetingId,
      autoGenerateMeet = true, // New option to control auto-generation
    } = req.body;

    // Validate required fields
    if (!title || !subject || !startTime || !endTime) {
      return sendError(
        res,
        'Missing required fields: title, subject, startTime, endTime',
        'MISSING_FIELDS',
        400
      );
    }

    // Validate date/time values
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return sendError(res, 'Invalid startTime or endTime format', 'INVALID_DATE', 400);
    }
    if (end <= start) {
      return sendError(res, 'endTime must be after startTime', 'INVALID_DATE_RANGE', 400);
    }

    let meetingLink = clientMeetingLink || null;
    let meetingId = clientMeetingId || null;
    let meetingProvider_final = meetingProvider || 'google_meet';

    // Auto-generate meet link if not provided
    if (!meetingLink && autoGenerateMeet !== false) {
      try {
        // Strategy 1: Try OAuth-based permanent link if tutor has connected Google
        if (req.tutor?.googleOAuthRefreshToken) {
          const durationMinutes = startTime && endTime
            ? Math.max(1, Math.ceil((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000))
            : 60;

          const permanentLink = await getOrCreatePermanentGoogleMeetLink({
            tutorId: req.tutor._id,
            meetingTitle: title || subject || 'Tutor Session',
            scheduledTime: startTime,
            durationMinutes
          });

          meetingLink = permanentLink.joinUrl || null;
          meetingId = permanentLink.meetingId || null;
        } else {
          // Strategy 2: Use simple meet link (no OAuth required)
          const simpleMeet = generateSimpleMeetLink({
            tutorId: req.tutor._id,
            sessionId: null,
            prefix: 'session'
          });
          
          meetingLink = simpleMeet.joinUrl;
          meetingId = simpleMeet.meetingId;
          console.log('Generated simple meet link (no OAuth):', meetingLink);
        }
      } catch (meetErr) {
        // Fallback: If OAuth fails, use simple meet link
        console.error('OAuth-based meet generation failed, falling back to simple link:', meetErr.message);
        const simpleMeet = generateSimpleMeetLink({
          tutorId: req.tutor._id,
          sessionId: null,
          prefix: 'session'
        });
        meetingLink = simpleMeet.joinUrl;
        meetingId = simpleMeet.meetingId;
      }
    }

    const session = await Session.create({
      title,
      subject,
      description: description || '',
      courseId: courseId || undefined,
      tutorId: req.tutor._id,
      startTime,
      endTime,
      meetingLink: meetingLink || undefined,
      meetingProvider: meetingLink ? meetingProvider_final : undefined,
      meetingId: meetingId || undefined,
      maxParticipants: maxParticipants || 1,
    });

    // Create group conversation for this session with tutor as initial participant
    await Conversation.create({
      sessionId: session._id,
      participants: [req.user._id]
    });

    return sendSuccess(res, session, 201);
  } catch (error) {
    console.error('Error creating session:', error);
    return sendError(res, error.message, error.code || 'CREATE_SESSION_FAILED', error.status || 500);
  }
};

export const getSessions = async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    let query = { tutorId: req.tutor._id };

    if (status) query.status = status;
    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) query.startTime.$gte = new Date(startDate);
      if (endDate) query.startTime.$lte = new Date(endDate);
    }

    const sessions = await Session.find(query)
      .populate('courseId')
      .populate('studentIds', 'name email')
      .sort({ startTime: -1 });
    return sendSuccess(res, sessions);
  } catch (error) {
    return sendError(res, error.message, 'FETCH_SESSIONS_FAILED', 500);
  }
};

export const getSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, tutorId: req.tutor._id })
      .populate('courseId')
      .populate('studentIds', 'name email avatar');
    if (!session) return sendError(res, 'Session not found', 'SESSION_NOT_FOUND', 404);
    return sendSuccess(res, session);
  } catch (error) {
    return sendError(res, error.message, 'FETCH_SESSION_FAILED', 500);
  }
};

export const updateSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, tutorId: req.tutor._id });
    if (!session) return sendError(res, 'Session not found', 'SESSION_NOT_FOUND', 404);

    // Add meetingProvider and meetingId to allowedFields
    const allowedFields = ['title', 'subject', 'description', 'startTime', 'endTime', 'maxParticipants', 'meetingLink', 'meetingProvider', 'meetingId', 'status', 'courseId'];
    allowedFields.forEach(key => {
      if (req.body[key] !== undefined) {
        session[key] = req.body[key];
      }
    });

    await session.save();
    return sendSuccess(res, session);
  } catch (error) {
    return sendError(res, error.message, 'UPDATE_SESSION_FAILED', 500);
  }
};

export const deleteSession = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, tutorId: req.tutor._id });
    if (!session) return sendError(res, 'Session not found', 'SESSION_NOT_FOUND', 404);

    if (session.studentIds.length > 0) {
      return sendError(res, 'Cannot delete session with enrolled students', 'DELETE_SESSION_RESTRICTED', 400);
    }

    await session.deleteOne();
    return res.status(204).send();
  } catch (error) {
    return sendError(res, error.message, 'DELETE_SESSION_FAILED', 500);
  }
};

export const getSessionRequests = async (req, res) => {
  try {
    // If sessionId is provided, filter by it, otherwise get all requests for tutor's sessions
    const { sessionId } = req.params;
    const { status } = req.query;

    let sessionIds = [];
    if (sessionId) {
      const session = await Session.findOne({ _id: sessionId, tutorId: req.tutor._id });
      if (!session) return sendError(res, 'Session not found', 'SESSION_NOT_FOUND', 404);
      sessionIds = [session._id];
    } else {
      const sessions = await Session.find({ tutorId: req.tutor._id }).select('_id');
      sessionIds = sessions.map(s => s._id);
    }

    const query = { sessionId: { $in: sessionIds } };
    if (status) query.status = status;

    const requests = await SessionJoinRequest.find(query)
      .populate('learnerId', 'name email')
      .populate('sessionId', 'title startTime')
      .sort({ createdAt: -1 });

    const data = requests.map(request => ({
      requestId: request._id,
      sessionId: request.sessionId?._id || request.sessionId,
      sessionTitle: request.sessionId?.title,
      learnerId: request.learnerId?._id || request.learnerId,
      learnerName: request.learnerId?.name,
      status: request.status,
      createdAt: request.createdAt
    }));

    return sendSuccess(res, data);
  } catch (error) {
    return sendError(res, error.message, 'FETCH_SESSION_REQUESTS_FAILED', 500);
  }
};

export const approveSessionRequest = async (req, res) => {
  try {
    const { sessionId, requestId } = req.params;

    // 1. Find the request first to get sessionId if it's missing from params
    const request = await SessionJoinRequest.findById(requestId);
    if (!request) return sendError(res, 'Join request not found', 'REQUEST_NOT_FOUND', 404);

    // 2. Verify session ownership (either using provided sessionId or request.sessionId)
    const sid = sessionId || request.sessionId;
    const session = await Session.findOne({ _id: sid, tutorId: req.tutor._id });
    if (!session) return sendError(res, 'Session not found or access denied', 'SESSION_NOT_FOUND', 404);

    // 3. Perform business logic
    const isStudent = (session.studentIds || []).some(id => id.toString() === request.learnerId.toString());
    if (!isStudent && session.maxParticipants && session.studentIds.length >= session.maxParticipants) {
      return sendError(res, 'Session is full', 'SESSION_FULL', 409);
    }

    if (!isStudent) {
      session.studentIds = session.studentIds || [];
      session.studentIds.push(request.learnerId);
      await session.save();
    }

    request.status = 'approved';
    await request.save();

    return sendSuccess(res, { requestId: request._id, status: 'approved' });
  } catch (error) {
    return sendError(res, error.message, 'APPROVE_SESSION_REQUEST_FAILED', 500);
  }
};

export const rejectSessionRequest = async (req, res) => {
  try {
    const { sessionId, requestId } = req.params;

    // 1. Find the request
    const request = await SessionJoinRequest.findById(requestId);
    if (!request) return sendError(res, 'Join request not found', 'REQUEST_NOT_FOUND', 404);

    // 2. Verify session ownership
    const sid = sessionId || request.sessionId;
    const session = await Session.findOne({ _id: sid, tutorId: req.tutor._id });
    if (!session) return sendError(res, 'Session not found or access denied', 'SESSION_NOT_FOUND', 404);

    // 3. Remove from studentIds if they were there (just in case)
    session.studentIds = (session.studentIds || []).filter(
      id => id.toString() !== request.learnerId.toString()
    );
    await session.save();

    request.status = 'rejected';
    await request.save();

    return sendSuccess(res, { requestId: request._id, status: 'rejected' });
  } catch (error) {
    return sendError(res, error.message, 'REJECT_SESSION_REQUEST_FAILED', 500);
  }
};

// --- Student Management ---
export const getMyStudents = async (req, res) => {
  try {
    const sessions = await Session.find({ tutorId: req.tutor._id })
      .populate('studentIds', 'name email avatar')
      .populate('courseId', 'title subject level')
      .sort({ startTime: -1 });

    // Build a map: studentId -> { student info, sessions[] }
    const studentsMap = new Map();

    sessions.forEach(session => {
      const sessionSummary = {
        sessionId: session._id,
        title: session.title,
        subject: session.subject,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        meetingLink: session.meetingLink || null,
        course: session.courseId
          ? { id: session.courseId._id, title: session.courseId.title, level: session.courseId.level }
          : null
      };

      session.studentIds.forEach(student => {
        const key = student._id.toString();
        if (!studentsMap.has(key)) {
          studentsMap.set(key, {
            _id: student._id,
            name: student.name,
            email: student.email,
            avatar: student.avatar || null,
            sessions: [],
            totalSessions: 0,
            completedSessions: 0,
            upcomingSessions: 0
          });
        }
        const entry = studentsMap.get(key);
        entry.sessions.push(sessionSummary);
        entry.totalSessions += 1;
        if (session.status === 'completed') entry.completedSessions += 1;
        if (session.status === 'scheduled' || session.status === 'ongoing') entry.upcomingSessions += 1;
      });
    });

    const tutorWithStudents = await Tutor.findById(req.tutor._id)
      .populate('studentIds', 'name email avatar');

    (tutorWithStudents?.studentIds || []).forEach(student => {
      const key = student._id.toString();
      if (!studentsMap.has(key)) {
        studentsMap.set(key, {
          _id: student._id,
          name: student.name,
          email: student.email,
          avatar: student.avatar || null,
          sessions: [],
          totalSessions: 0,
          completedSessions: 0,
          upcomingSessions: 0
        });
      }
    });

    return sendSuccess(res, Array.from(studentsMap.values()));
  } catch (error) {
    return sendError(res, error.message, 'FETCH_STUDENTS_FAILED', 500);
  }
};

export const searchStudents = async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const sessionId = req.query.sessionId || null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { role: 'student' };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const [students, total] = await Promise.all([
      User.find(query)
        .select('name email role createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query)
    ]);

    // If sessionId provided, check enrollment in that specific session
    let sessionStudentIds = new Set();
    if (sessionId) {
      const session = await Session.findOne({ _id: sessionId, tutorId: req.tutor._id }).select('studentIds');
      if (session) {
        sessionStudentIds = new Set((session.studentIds || []).map(id => id.toString()));
      }
    } else {
      // Otherwise check global tutor student list
      sessionStudentIds = new Set((req.tutor.studentIds || []).map(id => id.toString()));
    }

    const results = students.map(student => ({
      _id: student._id,
      name: student.name,
      email: student.email,
      role: student.role,
      createdAt: student.createdAt,
      isAdded: sessionStudentIds.has(student._id.toString())
    }));

    return sendSuccess(res, {
      students: results,
      pagination: {
        page,
        limit,
        total,
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    return sendError(res, error.message, 'SEARCH_STUDENTS_FAILED', 500);
  }
};

export const addStudent = async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return sendError(res, 'studentId is required', 'MISSING_STUDENT_ID', 400);
    }

    const student = await User.findOne({ _id: studentId, role: 'student' }).select('name email role');
    if (!student) {
      return sendError(res, 'Student not found', 'STUDENT_NOT_FOUND', 404);
    }

    req.tutor.studentIds = req.tutor.studentIds || [];
    const alreadyAdded = req.tutor.studentIds.some(id => id.toString() === studentId.toString());

    if (!alreadyAdded) {
      req.tutor.studentIds.push(student._id);
      await req.tutor.save();
    }

    return sendSuccess(res, {
      student,
      alreadyAdded
    });
  } catch (error) {
    return sendError(res, error.message, 'ADD_STUDENT_FAILED', 500);
  }
};

export const addStudentToSession = async (req, res) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId;
    const studentId = req.body.studentId || req.params.studentId;

    if (!sessionId) {
      return sendError(res, 'sessionId is required', 'MISSING_SESSION_ID', 400);
    }

    if (!studentId) {
      return sendError(res, 'studentId is required', 'MISSING_STUDENT_ID', 400);
    }

    const [session, student] = await Promise.all([
      Session.findOne({ _id: sessionId, tutorId: req.tutor._id }),
      User.findOne({ _id: studentId, role: 'student' }).select('name email role')
    ]);

    if (!session) {
      return sendError(res, 'Session not found or access denied', 'SESSION_NOT_FOUND', 404);
    }

    if (!student) {
      return sendError(res, 'Student not found', 'STUDENT_NOT_FOUND', 404);
    }

    session.studentIds = session.studentIds || [];
    const alreadyAdded = session.studentIds.some((id) => id.toString() === student._id.toString());

    if (!alreadyAdded && session.maxParticipants && session.studentIds.length >= session.maxParticipants) {
      return sendError(res, 'Session is full', 'SESSION_FULL', 400);
    }

    if (!alreadyAdded) {
      session.studentIds.push(student._id);
      await session.save();
    }

    req.tutor.studentIds = req.tutor.studentIds || [];
    const inTutorList = req.tutor.studentIds.some((id) => id.toString() === student._id.toString());
    if (!inTutorList) {
      req.tutor.studentIds.push(student._id);
      await req.tutor.save();
    }

    const updatedSession = await Session.findById(session._id).populate('studentIds', 'name email avatar');

    if (!alreadyAdded) {
      const conversation = await Conversation.findOne({ sessionId: session._id });
      if (conversation && !conversation.participants.includes(student._id)) {
        conversation.participants.push(student._id);
        await conversation.save();
      }

      broadcast(student._id, 'session:student-added', {
        sessionId: session._id,
        session: {
          _id: updatedSession._id,
          title: updatedSession.title,
          subject: updatedSession.subject,
          startTime: updatedSession.startTime,
          endTime: updatedSession.endTime,
          meetingLink: updatedSession.meetingLink,
          tutorId: updatedSession.tutorId
        }
      });
    }

    return sendSuccess(res, {
      session: {
        _id: updatedSession._id,
        title: updatedSession.title,
        subject: updatedSession.subject,
        studentIds: updatedSession.studentIds
      },
      student,
      alreadyAdded
    });
  } catch (error) {
    return sendError(res, error.message, 'ADD_STUDENT_TO_SESSION_FAILED', 500);
  }
};

export const removeStudentFromSession = async (req, res) => {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId;
    const studentId = req.params.studentId || req.body.studentId;

    if (!sessionId) {
      return sendError(res, 'sessionId is required', 'MISSING_SESSION_ID', 400);
    }

    if (!studentId) {
      return sendError(res, 'studentId is required', 'MISSING_STUDENT_ID', 400);
    }

    const session = await Session.findOne({ _id: sessionId, tutorId: req.tutor._id });
    if (!session) {
      return sendError(res, 'Session not found or access denied', 'SESSION_NOT_FOUND', 404);
    }

    const student = await User.findOne({ _id: studentId, role: 'student' }).select('name email role');
    if (!student) {
      return sendError(res, 'Student not found', 'STUDENT_NOT_FOUND', 404);
    }

    session.studentIds = session.studentIds || [];
    const wasEnrolled = session.studentIds.some((id) => id.toString() === student._id.toString());

    if (!wasEnrolled) {
      return sendSuccess(res, {
        session: {
          _id: session._id,
          title: session.title,
          subject: session.subject,
          studentIds: session.studentIds
        },
        student,
        removed: false
      });
    }

    session.studentIds = session.studentIds.filter((id) => id.toString() !== student._id.toString());
    await session.save();

    const updatedSession = await Session.findById(session._id).populate('studentIds', 'name email avatar');

    const conversation = await Conversation.findOne({ sessionId: session._id });
    if (conversation) {
      conversation.participants = conversation.participants.filter(
        (id) => id.toString() !== student._id.toString()
      );
      await conversation.save();
    }

    broadcast(student._id, 'session:student-removed', {
      sessionId: session._id,
      session: {
        _id: updatedSession._id,
        title: updatedSession.title,
        subject: updatedSession.subject
      }
    });

    return sendSuccess(res, {
      session: {
        _id: updatedSession._id,
        title: updatedSession.title,
        subject: updatedSession.subject,
        studentIds: updatedSession.studentIds
      },
      student,
      removed: true
    });
  } catch (error) {
    return sendError(res, error.message, 'REMOVE_STUDENT_FROM_SESSION_FAILED', 500);
  }
};

export const getStudentProgress = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Verify the student is actually enrolled in one of this tutor's sessions
    const student = await User.findById(studentId).select('name email avatar');
    if (!student) return sendError(res, 'Student not found', 'STUDENT_NOT_FOUND', 404);

    const sessions = await Session.find({
      tutorId: req.tutor._id,
      studentIds: studentId
    })
      .populate('courseId', 'title subject level price')
      .sort({ startTime: -1 });

    const sessionHistory = sessions.map(session => ({
      sessionId: session._id,
      title: session.title,
      subject: session.subject,
      status: session.status,
      startTime: session.startTime,
      endTime: session.endTime,
      meetingLink: session.meetingLink || null,
      course: session.courseId
        ? { id: session.courseId._id, title: session.courseId.title, level: session.courseId.level }
        : null
    }));

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.status === 'completed').length;
    const upcomingSessions = sessions.filter(s => s.status === 'scheduled' || s.status === 'ongoing').length;

    return sendSuccess(res, {
      student,
      sessionHistory,
      totalSessions,
      completedSessions,
      upcomingSessions
    });
  } catch (error) {
    return sendError(res, error.message, 'FETCH_PROGRESS_FAILED', 500);
  }
};

// --- Performance Analytics ---
export const getAnalyticsOverview = async (req, res) => {
  try {
    const totalEarnings = req.tutor.earnings;
    const activeSessions = await Session.countDocuments({ tutorId: req.tutor._id, status: 'scheduled' });

    const sessions = await Session.find({ tutorId: req.tutor._id });
    const studentsSet = new Set();
    sessions.forEach(s => s.studentIds.forEach(id => studentsSet.add(id.toString())));

    return sendSuccess(res, {
      totalEarnings,
      activeSessions,
      totalStudents: studentsSet.size,
      avgRating: req.tutor.rating
    });
  } catch (error) {
    return sendError(res, error.message, 'FETCH_ANALYTICS_FAILED', 500);
  }
};

export const getEarningsAnalytics = async (req, res) => {
  try {
    const payments = await Payment.find({ tutorId: req.tutor._id, type: 'credit', status: 'completed' });
    return sendSuccess(res, payments);
  } catch (error) {
    return sendError(res, error.message, 'FETCH_EARNINGS_FAILED', 500);
  }
};

// --- Reviews & Feedback ---
export const getReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ tutorId: req.tutor._id }).populate('studentId', 'name');
    return sendSuccess(res, reviews);
  } catch (error) {
    return sendError(res, error.message, 'FETCH_REVIEWS_FAILED', 500);
  }
};

export const respondToReview = async (req, res) => {
  try {
    const { responseText } = req.body;
    const review = await Review.findOneAndUpdate(
      { _id: req.params.id, tutorId: req.tutor._id },
      { responseText },
      { new: true }
    );
    if (!review) return sendError(res, 'Review not found', 'REVIEW_NOT_FOUND', 404);
    return sendSuccess(res, review);
  } catch (error) {
    return sendError(res, error.message, 'RESPOND_REVIEW_FAILED', 500);
  }
};

export const getReviewAnalytics = async (req, res) => {
  try {
    const reviews = await Review.find({ tutorId: req.tutor._id });
    const sentiment = {
      positive: reviews.filter(r => r.rating >= 4).length,
      neutral: reviews.filter(r => r.rating === 3).length,
      negative: reviews.filter(r => r.rating <= 2).length,
    };
    return sendSuccess(res, { reviews, sentiment });
  } catch (error) {
    return sendError(res, error.message, 'FETCH_REVIEW_ANALYTICS_FAILED', 500);
  }
};

// --- Messaging ---
export const getConversations = async (req, res) => {
  try {
    const myId = req.user._id;
    const messages = await Message.find({
      $or: [{ senderId: myId }, { receiverId: myId }]
    }).sort({ createdAt: 1 })
      .populate('senderId', 'name email avatar')
      .populate('receiverId', 'name email avatar');

    const conversationsMap = new Map();
    messages.forEach(msg => {
      let student = null;
      if (String(msg.senderId._id) !== String(myId)) student = msg.senderId;
      if (String(msg.receiverId._id) !== String(myId)) student = msg.receiverId;
      if (!student) return;

      const key = String(student._id);
      if (!conversationsMap.has(key)) {
        conversationsMap.set(key, { student, messages: [], lastMessage: '', timestamp: '', unread: 0 });
      }
      conversationsMap.get(key).messages.push({
        id: msg._id,
        text: msg.message,
        sender: String(msg.senderId._id) === String(myId) ? 'tutor' : 'student',
        timestamp: msg.createdAt,
        read: msg.isRead
      });
    });

    conversationsMap.forEach(conv => {
      if (conv.messages.length > 0) {
        const lastMsg = conv.messages[conv.messages.length - 1];
        conv.lastMessage = lastMsg.text;
        conv.timestamp = lastMsg.timestamp;
        conv.unread = conv.messages.filter(m => !m.read && m.sender === 'student').length;
      }
    });

    return sendSuccess(res, Array.from(conversationsMap.values()));
  } catch (error) {
    return sendError(res, error.message, 'FETCH_CONVERSATIONS_FAILED', 500);
  }
};

export const getMessages = async (req, res) => {
  try {
    const otherUserId = req.params.userId;
    const myId = req.user._id;
    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: myId }
      ]
    }).sort({ createdAt: 1 });
    return sendSuccess(res, messages);
  } catch (error) {
    return sendError(res, error.message, 'FETCH_MESSAGES_FAILED', 500);
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

// --- Session Chat ---
export const getSessionChat = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));

    // Verify user has access to this session (tutor or enrolled student)
    const session = await Session.findById(sessionId);
    if (!session) return sendError(res, 'Session not found', 'SESSION_NOT_FOUND', 404);

    const isTutor = req.tutor && req.tutor._id.toString() === session.tutorId.toString();
    const isStudent = session.studentIds?.some(id => id.toString() === req.user._id.toString());

    if (!isTutor && !isStudent) {
      return sendError(res, 'You are not enrolled in this session', 'FORBIDDEN', 403);
    }

    // Get pre-created group conversation for this session
    const conversation = await Conversation.findOne({ sessionId: session._id });
    if (!conversation) {
      return sendError(res, 'Session chat not found. Please try again.', 'CONVERSATION_NOT_FOUND', 404);
    }

    // Ensure user is in conversation participants
    if (!conversation.participants.some(p => p.toString() === req.user._id.toString())) {
      return sendError(res, 'You are not a participant in this conversation', 'FORBIDDEN', 403);
    }

    // Fetch messages
    const total = await ChatMessage.countDocuments({ conversationId: conversation._id });
    const messages = await ChatMessage.find({ conversationId: conversation._id })
      .populate('senderId', 'name avatar')
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const formatted = messages.map(msg => ({
      _id: msg._id,
      conversationId: msg.conversationId,
      sender: msg.senderId?._id
        ? { _id: msg.senderId._id, name: msg.senderId.name, avatar: msg.senderId.avatar || null }
        : { _id: msg.senderId },
      text: msg.text,
      read: msg.read,
      isEdited: msg.isEdited || false,
      editedAt: msg.editedAt || null,
      reactions: msg.reactions || [],
      createdAt: msg.createdAt
    }));

    return sendSuccess(res, {
      messages: formatted,
      hasMore: page * limit < total,
      total,
      conversationId: conversation._id
    });
  } catch (error) {
    return sendError(res, error.message, 'FETCH_SESSION_CHAT_FAILED', 500);
  }
};

export const sendSessionChat = async (req, res) => {
  try {
    const { sessionId } = req.params;
    let { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return sendError(res, 'Message text is required and cannot be empty', 'VALIDATION_ERROR', 400);
    }

    // Trim whitespace but preserve newlines
    text = text.trim();

    // Verify session exists
    const session = await Session.findById(sessionId);
    if (!session) return sendError(res, 'Session not found', 'SESSION_NOT_FOUND', 404);

    // Verify user is either the tutor or an enrolled student
    const isTutor = req.tutor && req.tutor._id.toString() === session.tutorId.toString();
    const isStudent = session.studentIds?.some(id => id.toString() === req.user._id.toString());

    if (!isTutor && !isStudent) {
      return sendError(res, 'You are not enrolled in this session', 'FORBIDDEN', 403);
    }

    // Ensure user is in conversation
    const conversation = await Conversation.findOne({ sessionId: session._id });
    if (!conversation) {
      return sendError(res, 'Session chat not found. Please try again.', 'CONVERSATION_NOT_FOUND', 404);
    }

    if (!conversation.participants.some(p => p.toString() === req.user._id.toString())) {
      return sendError(res, 'You are not a participant in this conversation', 'FORBIDDEN', 403);
    }

    // Create message
    const msg = await ChatMessage.create({
      conversationId: conversation._id,
      senderId: req.user._id,
      text
    });

    const sender = await User.findById(req.user._id).select('name avatar');
    const formatted = {
      _id: msg._id,
      conversationId: msg.conversationId,
      sender: {
        _id: sender._id,
        name: sender.name,
        avatar: sender.avatar || null
      },
      text: msg.text,
      read: msg.read,
      isEdited: msg.isEdited || false,
      editedAt: msg.editedAt || null,
      reactions: msg.reactions || [],
      createdAt: msg.createdAt
    };

    // Update conversation denorm
    conversation.lastMessage = text.replace(/\n/g, ' ').trim();
    conversation.lastMessageAt = msg.createdAt;
    await conversation.save();

    // Broadcast to all session participants via WebSocket
    const participantIds = conversation.participants.map(p => p.toString ? p.toString() : p);
    participantIds.forEach(participantId => {
      if (participantId !== req.user._id.toString()) {
        broadcast(participantId, 'message:new', {
          conversationId: conversation._id,
          sessionId,
          message: formatted
        });
      }
    });

    return sendSuccess(res, formatted, 201);
  } catch (error) {
    return sendError(res, error.message, 'SEND_SESSION_CHAT_FAILED', 500);
  }
};
