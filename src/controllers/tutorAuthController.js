import User from '../models/User.js';
import Tutor from '../models/Tutor.js';
import jwt from 'jsonwebtoken';
import { sendSuccess, sendError } from '../middleware/responseHandler.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

export const registerTutor = async (req, res) => {
  try {
    const { name, email, password, bio, subjects, hourlyRate } = req.body;

    // Validate required fields and show only missing ones
    const requiredFields = ['name', 'email', 'password'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return sendError(
        res,
        `Missing required fields: ${missingFields.join(', ')}`,
        'MISSING_FIELDS',
        400
      );
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return sendError(res, 'User already exists', 'USER_EXISTS', 400);
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'tutor'
    });

    const tutor = await Tutor.create({
      userId: user._id,
      bio,
      subjects,
      hourlyRate
    });

    const token = generateToken(user._id);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    return sendSuccess(res, {
      tutor: {
        id: tutor._id,
        name: user.name,
        email: user.email,
        bio: tutor.bio,
        subjects: tutor.subjects,
        hourlyRate: tutor.hourlyRate
      }
    }, 201);
  } catch (error) {
    return sendError(res, error.message, 'REGISTRATION_FAILED', 500);
  }
};

export const loginTutor = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (user && (await user.comparePassword(password))) {
      if (user.role !== 'tutor') {
        return sendError(res, 'Not authorized as a tutor', 'NOT_A_TUTOR', 403);
      }

      const tutor = await Tutor.findOne({ userId: user._id });
      const token = generateToken(user._id);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      return sendSuccess(res, {
        tutor: {
          id: tutor._id,
          name: user.name,
          email: user.email,
          bio: tutor.bio,
          subjects: tutor.subjects,
          hourlyRate: tutor.hourlyRate
        }
      });
    } else {
      return sendError(res, 'Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }
  } catch (error) {
    return sendError(res, error.message, 'LOGIN_FAILED', 500);
  }
};

export const logoutTutor = async (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0)
  });
  return sendSuccess(res, { message: 'Logged out successfully' });
};
