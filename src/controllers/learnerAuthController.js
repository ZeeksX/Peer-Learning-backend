import User from '../models/User.js';
import LearnerProfile from '../models/LearnerProfile.js';
import jwt from 'jsonwebtoken';
import { sendSuccess, sendError } from '../middleware/responseHandler.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

export const registerLearner = async (req, res) => {
  try {
    const { name, email, password, interests } = req.body;

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
      role: 'student'
    });

    const learnerProfile = await LearnerProfile.create({
      userId: user._id,
      interests
    });

    const token = generateToken(user._id);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    return sendSuccess(res, {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        interests: learnerProfile.interests
      }
    }, 201);
  } catch (error) {
    return sendError(res, error.message, 'REGISTRATION_FAILED', 500);
  }
};

export const loginLearner = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (user && (await user.comparePassword(password))) {
      const token = generateToken(user._id);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      return sendSuccess(res, {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } else {
      return sendError(res, 'Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }
  } catch (error) {
    return sendError(res, error.message, 'LOGIN_FAILED', 500);
  }
};

export const logoutLearner = async (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0)
  });
  return sendSuccess(res, { message: 'Logged out successfully' });
};
