// Fetch all messages between the logged-in user and another user
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
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import Progress from '../models/Progress.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Message from '../models/Message.js';
import LearnerProfile from '../models/LearnerProfile.js';
import Session from '../models/Session.js';
import SessionJoinRequest from '../models/SessionJoinRequest.js';
import Review from '../models/Review.js';
import Tutor from '../models/Tutor.js';
import { sendSuccess, sendError } from '../middleware/responseHandler.js';

const buildSessionResponse = (session) => {
  const course = session?.courseId && session.courseId._id ? session.courseId : null;
  const tutor = session?.tutorId && session.tutorId._id ? session.tutorId : null;
  const tutorUser = tutor?.userId && tutor.userId._id ? tutor.userId : null;
  const startTime = session?.startTime ? new Date(session.startTime) : null;
  const endTime = session?.endTime ? new Date(session.endTime) : null;
  const duration = startTime && endTime ? Math.max(0, Math.round((endTime - startTime) / 60000)) : null;
  return {
    _id: session._id,
    title: session.title,
    description: session.description || '',
    subject: session.subject,
    level: course?.level || null,
    startTime: session.startTime,
    endTime: session.endTime,
    duration,
    maxParticipants: session.maxParticipants || 1,
    studentIds: (session.studentIds || []).map(id => id.toString()),
    createdAt: session.createdAt,
    tutor: {
      id: tutor?._id || null,
      name: tutorUser?.name || tutor?.name || null,
      avatar: tutorUser?.avatar || tutor?.avatar || null,
      rating: tutor?.rating ?? 0,
      reviewCount: tutor?.reviewCount ?? 0,
      hourlyRate: tutor?.hourlyRate ?? 0
    },
    meetingLink: session.meetingLink || null
  };
};

const toTokenSet = (values = []) => {
  const tokens = new Set();
  values
    .filter(Boolean)
    .forEach((value) => {
      value
        .toString()
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .forEach((token) => tokens.add(token));
    });
  return tokens;
};

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

export const getMySessions = async (req, res) => {
  try {
    const requests = await SessionJoinRequest.find({ learnerId: req.user._id });
    const requestBySession = new Map(requests.map(request => [request.sessionId.toString(), request]));
    const requestSessionIds = requests.map(request => request.sessionId);

    const sessions = await Session.find({
      $or: [
        { _id: { $in: requestSessionIds } },
        { studentIds: req.user._id }
      ]
    })
      .populate('courseId')
      .populate({ path: 'tutorId', populate: { path: 'userId', select: 'name email role' } })
      .sort({ startTime: -1 });

    const data = sessions.map(session => {
      const request = requestBySession.get(session._id.toString());
      const isStudent = (session.studentIds || []).some(id => id.toString() === req.user._id.toString());
      const enrollmentStatus = isStudent ? 'approved' : (request?.status || 'pending');
      return {
        session: buildSessionResponse(session),
        enrollmentStatus
      };
    });

    return sendSuccess(res, data);
  } catch (error) {
    return sendError(res, error.message, 'FETCH_SESSIONS_FAILED', 500);
  }
};

export const getRecommendations = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(20, parseInt(req.query.limit, 10) || 8));
    const learnerId = req.user._id;

    const [profile, enrollments, requests, sessions] = await Promise.all([
      LearnerProfile.findOne({ userId: learnerId }).populate('enrolledCourses', 'tags level title'),
      Enrollment.find({ learnerId }).select('courseId'),
      SessionJoinRequest.find({ learnerId }).select('sessionId status'),
      Session.find({ status: { $in: ['scheduled', 'ongoing'] } })
        .populate('courseId')
        .populate({ path: 'tutorId', populate: { path: 'userId', select: 'name email role avatar' } })
    ]);

    const enrolledCourseIds = new Set((enrollments || []).map((entry) => entry.courseId?.toString()).filter(Boolean));
    const requestBySessionId = new Map((requests || []).map((entry) => [entry.sessionId.toString(), entry.status]));

    const interestTokens = toTokenSet(profile?.interests || []);
    const goalTokens = toTokenSet(profile?.learningGoals || []);

    (profile?.enrolledCourses || []).forEach((course) => {
      (course?.tags || []).forEach((tag) => interestTokens.add(tag.toLowerCase()));
      if (course?.title) {
        toTokenSet([course.title]).forEach((token) => interestTokens.add(token));
      }
    });

    const scored = sessions
      .filter((session) => {
        const isAlreadyInSession = (session.studentIds || []).some((id) => id.toString() === learnerId.toString());
        if (isAlreadyInSession) return false;

        const isFull = session.maxParticipants && (session.studentIds?.length || 0) >= session.maxParticipants;
        if (isFull) return false;

        return true;
      })
      .map((session) => {
        const course = session.courseId && session.courseId._id ? session.courseId : null;
        const tutor = session.tutorId && session.tutorId._id ? session.tutorId : null;

        let score = 0;
        const reasons = [];

        const subjectTokens = toTokenSet([session.subject, session.title, session.description, ...(course?.tags || [])]);

        const interestMatches = [...interestTokens].filter((token) => subjectTokens.has(token));
        if (interestMatches.length > 0) {
          score += Math.min(45, 15 + interestMatches.length * 8);
          reasons.push('Matches your interests');
        }

        const goalMatches = [...goalTokens].filter((token) => subjectTokens.has(token));
        if (goalMatches.length > 0) {
          score += Math.min(25, 10 + goalMatches.length * 5);
          reasons.push('Supports your learning goals');
        }

        if (course?._id && enrolledCourseIds.has(course._id.toString())) {
          score += 18;
          reasons.push('Related to a course you enrolled in');
        }

        const tutorRating = Number(tutor?.rating || 0);
        if (tutorRating > 0) {
          score += Math.min(20, tutorRating * 4);
          if (tutorRating >= 4) reasons.push('Highly rated tutor');
        }

        const studentCount = session.studentIds?.length || 0;
        if (studentCount > 0) {
          score += Math.min(10, studentCount * 1.5);
        }

        const startsAt = session.startTime ? new Date(session.startTime) : null;
        if (startsAt && !Number.isNaN(startsAt.getTime())) {
          const now = Date.now();
          const diffMs = startsAt.getTime() - now;
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (diffDays >= 0 && diffDays <= 7) {
            score += 8;
            reasons.push('Starts soon');
          }
        }

        return {
          session,
          score,
          reasons: reasons.length > 0 ? reasons : ['Popular with learners']
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(a.session.startTime) - new Date(b.session.startTime);
      })
      .slice(0, limit);

    const data = scored.map(({ session, score, reasons }) => ({
      session: buildSessionResponse(session),
      score,
      reasons,
      enrollmentStatus: requestBySessionId.get(session._id.toString()) || 'not_joined'
    }));

    return sendSuccess(res, {
      recommendations: data,
      generatedAt: new Date().toISOString(),
      totalCandidates: sessions.length
    });
  } catch (error) {
    return sendError(res, error.message, 'FETCH_RECOMMENDATIONS_FAILED', 500);
  }
};

export const browseSessions = async (req, res) => {
  try {
    const {
      search,
      subject,
      level,
      maxPrice,
      sortBy = 'upcoming',
      page = 1,
      limit = 20
    } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const searchValue = search?.toString().trim().toLowerCase();
    const subjectValue = subject?.toString().trim().toLowerCase();
    const levelValue = level?.toString().trim();
    const maxPriceValue = maxPrice !== undefined ? Number(maxPrice) : null;

    const sessions = await Session.find()
      .populate('courseId')
      .populate({ path: 'tutorId', populate: { path: 'userId', select: 'name email role' } });

    let filtered = sessions.filter(session => {
      const course = session.courseId && session.courseId._id ? session.courseId : null;
      const tutor = session.tutorId && session.tutorId._id ? session.tutorId : null;
      const tutorUser = tutor?.userId && tutor.userId._id ? tutor.userId : null;
      if (subjectValue) {
        const matchesSubject = session.subject?.toLowerCase() === subjectValue
          || (course?.tags || []).some(tag => tag?.toLowerCase() === subjectValue);
        if (!matchesSubject) return false;
      }
      if (levelValue && course?.level !== levelValue) return false;
      if (maxPriceValue !== null && Number.isFinite(maxPriceValue)) {
        const price = course?.price ?? null;
        if (price === null || price > maxPriceValue) return false;
      }
      if (searchValue) {
        const fields = [
          session.title,
          session.subject,
          session.description,
          tutorUser?.name
        ]
          .filter(Boolean)
          .map(value => value.toString().toLowerCase());
        if (!fields.some(value => value.includes(searchValue))) return false;
      }
      return true;
    });

    const sortHandlers = {
      upcoming: (a, b) => new Date(a.startTime) - new Date(b.startTime),
      popular: (a, b) => (b.studentIds?.length || 0) - (a.studentIds?.length || 0),
      newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      'price-low': (a, b) => {
        const priceA = a.courseId?.price ?? Number.POSITIVE_INFINITY;
        const priceB = b.courseId?.price ?? Number.POSITIVE_INFINITY;
        return priceA - priceB;
      },
      'price-high': (a, b) => {
        const priceA = a.courseId?.price ?? Number.NEGATIVE_INFINITY;
        const priceB = b.courseId?.price ?? Number.NEGATIVE_INFINITY;
        return priceB - priceA;
      }
    };

    const sorter = sortHandlers[sortBy] || sortHandlers.upcoming;
    filtered = filtered.sort(sorter);

    const total = filtered.length;
    const startIndex = (pageNumber - 1) * limitNumber;
    const paged = filtered.slice(startIndex, startIndex + limitNumber);
    const data = paged.map(buildSessionResponse);

    return res.status(200).json({
      status: 'success',
      data,
      pagination: { page: pageNumber, limit: limitNumber, total }
    });
  } catch (error) {
    return sendError(res, error.message, 'FETCH_SESSIONS_FAILED', 500);
  }
};

export const getSessionDetails = async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId)
      .populate('courseId')
      .populate({ path: 'tutorId', populate: { path: 'userId', select: 'name email role' } });
    if (!session) return sendError(res, 'Session not found', 'SESSION_NOT_FOUND', 404);
    return sendSuccess(res, buildSessionResponse(session));
  } catch (error) {
    return sendError(res, error.message, 'FETCH_SESSION_FAILED', 500);
  }
};

export const joinSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) return sendError(res, 'Session not found', 'SESSION_NOT_FOUND', 404);

    const isStudent = (session.studentIds || []).some(id => id.toString() === req.user._id.toString());
    const existingRequest = await SessionJoinRequest.findOne({
      sessionId: session._id,
      learnerId: req.user._id
    });

    if (!isStudent && session.maxParticipants && session.studentIds.length >= session.maxParticipants) {
      return sendError(res, 'Session is full', 'SESSION_FULL', 409);
    }

    if (isStudent) {
      const responseRequest = existingRequest || await SessionJoinRequest.findOneAndUpdate(
        { sessionId: session._id, learnerId: req.user._id },
        { tutorId: session.tutorId, status: 'approved' },
        { new: true, upsert: true }
      );
      return sendSuccess(res, {
        requestId: responseRequest._id,
        sessionId: session._id,
        learnerId: req.user._id,
        status: 'approved'
      });
    }

    if (existingRequest) {
      if (existingRequest.status === 'rejected') {
        existingRequest.status = 'pending';
        await existingRequest.save();
      }
      return sendSuccess(res, {
        requestId: existingRequest._id,
        sessionId: session._id,
        learnerId: req.user._id,
        status: existingRequest.status
      });
    }

    const request = await SessionJoinRequest.create({
      sessionId: session._id,
      tutorId: session.tutorId,
      learnerId: req.user._id,
      status: 'pending'
    });

    return sendSuccess(res, {
      requestId: request._id,
      sessionId: session._id,
      learnerId: req.user._id,
      status: request.status
    });
  } catch (error) {
    return sendError(res, error.message, 'JOIN_SESSION_FAILED', 500);
  }
};

export const leaveSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) return sendError(res, 'Session not found', 'SESSION_NOT_FOUND', 404);

    const beforeCount = session.studentIds.length;
    session.studentIds = (session.studentIds || []).filter(
      id => id.toString() !== req.user._id.toString()
    );
    if (session.studentIds.length !== beforeCount) {
      await session.save();
    }

    const request = await SessionJoinRequest.findOne({
      sessionId: session._id,
      learnerId: req.user._id
    });
    if (request && request.status !== 'rejected') {
      request.status = 'rejected';
      await request.save();
    }

    return sendSuccess(res, { sessionId: session._id, status: 'left' });
  } catch (error) {
    return sendError(res, error.message, 'LEAVE_SESSION_FAILED', 500);
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

// --- Session Rating ---
export const rateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const learnerId = req.user._id;
    const { rating, comment } = req.body;

    // Validate rating
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return sendError(res, 'Rating must be an integer between 1 and 5', 'INVALID_RATING', 400);
    }

    // Find session
    const session = await Session.findById(sessionId);
    if (!session) return sendError(res, 'Session not found', 'SESSION_NOT_FOUND', 404);

    // Confirm learner is a participant
    const isParticipant = (session.studentIds || []).some(id => id.toString() === learnerId.toString());
    if (!isParticipant) {
      return sendError(res, 'You are not a participant of this session', 'NOT_SESSION_PARTICIPANT', 403);
    }

    // Check for existing review for this tutor by this learner
    const existingReview = await Review.findOne({ tutorId: session.tutorId, studentId: learnerId });
    if (existingReview) {
      return sendError(res, 'You have already reviewed this tutor', 'TUTOR_ALREADY_REVIEWED', 409);
    }

    // Create the review
    const review = await Review.create({
      tutorId: session.tutorId,
      studentId: learnerId,
      rating: ratingNum,
      comment: comment || ''
    });

    // Recalculate tutor aggregate rating
    const stats = await Review.aggregate([
      { $match: { tutorId: session.tutorId } },
      { $group: { _id: '$tutorId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    if (stats.length > 0) {
      await Tutor.findByIdAndUpdate(session.tutorId, {
        rating: Math.round(stats[0].avgRating * 10) / 10,
        reviewCount: stats[0].count
      });
    }

    return sendSuccess(res, review, 201);
  } catch (error) {
    return sendError(res, error.message, 'RATE_SESSION_FAILED', 500);
  }
};

export const getSessionRating = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const learnerId = req.user._id;

    const session = await Session.findById(sessionId);
    if (!session) return sendError(res, 'Session not found', 'SESSION_NOT_FOUND', 404);

    const review = await Review.findOne({ tutorId: session.tutorId, studentId: learnerId });
    return sendSuccess(res, review || null);
  } catch (error) {
    return sendError(res, error.message, 'FETCH_RATING_FAILED', 500);
  }
};
