import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import { broadcast } from './wsService.js';

const toNotificationDTO = (doc) => ({
	_id: doc._id,
	userId: doc.userId,
	title: doc.title,
	message: doc.message,
	type: doc.type,
	read: doc.read,
	data: doc.data || null,
	createdAt: doc.createdAt,
	updatedAt: doc.updatedAt
});

const parsePagination = (page, limit) => {
	const safePage = Math.max(1, parseInt(page, 10) || 1);
	const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
	return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
};

const emitUnreadCount = async (userId) => {
	const unreadCount = await Notification.countDocuments({ userId: userId, read: false });
	broadcast(userId.toString(), 'notification:unread-count', { unreadCount });
	return unreadCount;
};

export const createNotification = async ({ userId, title, message, type = 'INFO', data = null }) => {
	if (!userId || !title?.trim() || !message?.trim()) {
		throw new Error('userId, title and message are required');
	}

	const notification = await Notification.create({
		userId,
		title: title.trim(),
		message: message.trim(),
		type,
		data
	});

	const dto = toNotificationDTO(notification);
	broadcast(userId.toString(), 'notification:new', dto);
	const unreadCount = await emitUnreadCount(userId);

	return { notification: dto, unreadCount };
};

export const getNotifications = async (userId, { page, limit, unreadOnly = false } = {}) => {
	const { skip, limit: safeLimit, page: safePage } = parsePagination(page, limit);
	const filter = { userId: userId };
	if (unreadOnly) filter.read = false;

	const [items, total] = await Promise.all([
		Notification.find(filter)
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(safeLimit),
		Notification.countDocuments(filter)
	]);

	return {
		notifications: items.map(toNotificationDTO),
		pagination: {
			page: safePage,
			limit: safeLimit,
			total,
			hasMore: safePage * safeLimit < total
		}
	};
};

export const getUnreadCount = async (userId) => {
	const unreadCount = await Notification.countDocuments({ userId: userId, read: false });
	return { unreadCount };
};

export const markNotificationAsRead = async (userId, notificationId) => {
	if (!mongoose.Types.ObjectId.isValid(notificationId)) {
		return null;
	}

	const notification = await Notification.findOneAndUpdate(
		{ _id: notificationId, userId: userId },
		{ read: true },
		{ new: true }
	);

	if (!notification) return null;

	const dto = toNotificationDTO(notification);
	broadcast(userId.toString(), 'notification:read', { notificationId: dto._id });
	const unreadCount = await emitUnreadCount(userId);

	return { notification: dto, unreadCount };
};

export const markAllNotificationsAsRead = async (userId) => {
	await Notification.updateMany({ userId: userId, read: false }, { read: true });
	broadcast(userId.toString(), 'notification:all-read', { ok: true });
	const unreadCount = await emitUnreadCount(userId);
	return { unreadCount };
};
