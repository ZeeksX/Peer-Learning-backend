import Notification from '../models/Notification.js';
import { sendSuccess, sendError } from '../middleware/responseHandler.js';
import * as notificationService from '../services/notificationService.js';

// Get all notifications with pagination and filtering
export const getNotifications = async (req, res) => {
    try {
        const { page, limit, unreadOnly } = req.query;
        const result = await notificationService.getNotifications(req.user._id, {
            page,
            limit,
            unreadOnly: unreadOnly === 'true'
        });
        return sendSuccess(res, result);
    } catch (error) {
        return sendError(res, error.message, 'FETCH_NOTIFICATIONS_FAILED', 500);
    }
};

// Get unread notification count
export const getUnreadCount = async (req, res) => {
    try {
        const result = await notificationService.getUnreadCount(req.user._id);
        return sendSuccess(res, result);
    } catch (error) {
        return sendError(res, error.message, 'FETCH_UNREAD_COUNT_FAILED', 500);
    }
};

// Mark a single notification as read
export const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await notificationService.markNotificationAsRead(req.user._id, id);
        
        if (!result) {
            return sendError(res, 'Notification not found', 'NOTIFICATION_NOT_FOUND', 404);
        }
        
        return sendSuccess(res, result);
    } catch (error) {
        return sendError(res, error.message, 'MARK_READ_FAILED', 500);
    }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
    try {
        const result = await notificationService.markAllNotificationsAsRead(req.user._id);
        return sendSuccess(res, result);
    } catch (error) {
        return sendError(res, error.message, 'MARK_ALL_READ_FAILED', 500);
    }
};

// Clear all notifications (delete)
export const clearNotifications = async (req, res) => {
    try {
        await Notification.deleteMany({ userId: req.user._id });
        return sendSuccess(res, { message: 'Notifications cleared' });
    } catch (error) {
        return sendError(res, error.message, 'CLEAR_NOTIFICATIONS_FAILED', 500);
    }
};
