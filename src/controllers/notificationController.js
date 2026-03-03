import Notification from '../models/Notification.js';
import { sendSuccess, sendError } from '../middleware/responseHandler.js';

// --- Notifications ---
export const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 });
        return sendSuccess(res, notifications);
    } catch (error) {
        return sendError(res, error.message, 'FETCH_NOTIFICATIONS_FAILED', 500);
    }
};

export const clearNotifications = async (req, res) => {
    try {
        await Notification.deleteMany({ userId: req.user._id });
        return res.status(200).json({ success: true, message: 'Notifications cleared' });
    } catch (error) {
        return sendError(res, error.message, 'CLEAR_NOTIFICATIONS_FAILED', 500);
    }
};
