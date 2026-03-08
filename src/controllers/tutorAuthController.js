// src/controllers/tutorAuthController.js
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
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    return sendSuccess(res, {
      // FIX: always expose the User._id as _id so the frontend
      // identity matches req.user._id (decoded from JWT) on every API call.
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      // Tutor-specific extras (non-identity fields)
      tutorId: tutor._id,
      bio: tutor.bio,
      subjects: tutor.subjects,
      hourlyRate: tutor.hourlyRate,
      token
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
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });

      return sendSuccess(res, {
        // FIX: always expose the User._id as _id so the frontend
        // identity matches req.user._id (decoded from JWT) on every API call.
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        // Tutor-specific extras (non-identity fields)
        tutorId: tutor._id,
        bio: tutor.bio,
        subjects: tutor.subjects,
        hourlyRate: tutor.hourlyRate,
        token
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

export const changeTutorPassword = async (req, res) => {
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
