// src/controllers/learnerAuthController.js
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
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    return sendSuccess(res, {
      // Consistent shape with tutor response — _id is always the User._id
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      interests: learnerProfile.interests,
      token
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
      if (user.role !== 'student') {
        return sendError(res, 'Not authorized as a learner', 'NOT_A_LEARNER', 403);
      }

      const token = generateToken(user._id);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });

      return sendSuccess(res, {
        // Consistent shape with tutor response — _id is always the User._id
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token
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

export const changeLearnerPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 'currentPassword and newPassword are required', 'MISSING_FIELDS', 400);
    }

    if (newPassword.length < 6) {
      return sendError(res, 'New password must be at least 6 characters', 'WEAK_PASSWORD', 400);
    }

    const user = await User.findById(req.user._id);
    if (!user) return sendError(res, 'User not found', 'USER_NOT_FOUND', 404);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return sendError(res, 'Current password is incorrect', 'INVALID_CURRENT_PASSWORD', 400);
    }

    user.password = newPassword;
    await user.save();

    return sendSuccess(res, { message: 'Password updated successfully' });
  } catch (error) {
    return sendError(res, error.message, 'CHANGE_PASSWORD_FAILED', 500);
  }
};