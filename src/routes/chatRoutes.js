// src/routes/chatRoutes.js
import express from 'express';
import {
    getConversations,
    getMessages,
    createConversation,
    sendMessage,
    markRead,
    getContacts,
    editMessage,
    addReaction,
    removeReaction
} from '../controllers/chatController.js';
import { getSessionChat, sendSessionChat } from '../controllers/tutorController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All chat routes require login (both tutors and learners)
router.use(protect);

// Contacts
router.get('/contacts', getContacts);

// Conversations
router.route('/conversations')
    .get(getConversations)
    .post(createConversation);

// Messages within a conversation
router.route('/conversations/:conversationId/messages')
    .get(getMessages)
    .post(sendMessage);

// Mark conversation as read
router.patch('/conversations/:conversationId/read', markRead);

// Edit message
router.patch('/messages/:messageId', editMessage);

// Reactions
router.route('/messages/:messageId/react')
    .post(addReaction)
    .delete(removeReaction);

// Session group chat (accessible to tutors and enrolled students)
router.route('/sessions/:sessionId/chat')
    .get(getSessionChat)
    .post(sendSessionChat);

export default router;
