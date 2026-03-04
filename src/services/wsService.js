// src/services/wsService.js
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { URL } from 'url';
import ChatMessage from '../models/ChatMessage.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';

// Map of userId (string) -> WebSocket instance
const onlineUsers = new Map();

/**
 * Send a JSON event frame to a specific user if they are connected.
 */
export const broadcast = (userId, event, data) => {
    const ws = onlineUsers.get(userId.toString());
    if (ws && ws.readyState === 1 /* OPEN */) {
        ws.send(JSON.stringify({ event, data }));
    }
};

export const emitNotification = (userId, data) => {
    broadcast(userId, 'notification:new', data);
};

/**
 * Emit an event to all participants of a conversation EXCEPT the excluded user.
 */
export const emitToConversation = async (conversationId, exceptUserId, event, data) => {
    const conversation = await Conversation.findById(conversationId).select('participants');
    if (!conversation) return;
    conversation.participants.forEach(participantId => {
        if (participantId.toString() !== exceptUserId.toString()) {
            broadcast(participantId, event, data);
        }
    });
};

/**
 * Format a ChatMessage document into the API contract Message shape.
 */
const formatMessage = (msg, sender) => ({
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
});

/**
 * Initialise the WebSocket server on an existing http.Server instance.
 */
export const initWS = (server) => {
    const wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', async (ws, req) => {
        // --- Authentication ---
        let userId;
        try {
            const { searchParams } = new URL(req.url, 'http://localhost');
            const token = searchParams.get('token');
            if (!token) throw new Error('No token');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.id;
        } catch {
            ws.close(1008, 'Unauthorized');
            return;
        }

        // Register user as online
        onlineUsers.set(userId.toString(), ws);

        // Notify contacts that this user is online
        broadcast(userId, 'user:online', { userId });

        ws.on('message', async (raw) => {
            let frame;
            try { frame = JSON.parse(raw); } catch { return; }
            const { event, data } = frame;

            // --- message:send ---
            if (event === 'message:send') {
                const { conversationId, text, tempId } = data || {};
                if (!conversationId || !text || text.trim().length === 0) return;
                try {
                    const conversation = await Conversation.findById(conversationId);
                    if (!conversation) return;
                    if (!conversation.participants.some(p => p.toString() === userId)) return;

                    const sender = await User.findById(userId).select('name avatar');
                    const msg = await ChatMessage.create({ conversationId, senderId: userId, text });

                    // Update conversation denorm fields (use single-line for preview)
                    const recipientId = conversation.participants.find(p => p.toString() !== userId);
                    const unreadCounts = conversation.unreadCounts || new Map();
                    const recipientKey = recipientId?.toString();
                    if (recipientKey) unreadCounts.set(recipientKey, (unreadCounts.get(recipientKey) || 0) + 1);
                    conversation.lastMessage = text.replace(/\n/g, ' ').trim();
                    conversation.lastMessageAt = msg.createdAt;
                    conversation.unreadCounts = unreadCounts;
                    await conversation.save();

                    const formatted = formatMessage(msg, sender);

                    // Confirm to sender
                    broadcast(userId, 'message:sent', { conversationId, message: formatted, tempId });
                    // Notify recipient
                    if (recipientKey) broadcast(recipientKey, 'message:new', { conversationId, message: formatted });
                } catch (err) {
                    console.error('WS message:send error:', err.message);
                }
            }

            // --- message:read ---
            if (event === 'message:read') {
                const { conversationId } = data || {};
                if (!conversationId) return;
                try {
                    await ChatMessage.updateMany(
                        { conversationId, senderId: { $ne: userId }, read: false },
                        { read: true }
                    );
                    const conversation = await Conversation.findById(conversationId);
                    if (conversation) {
                        const unreadCounts = conversation.unreadCounts || new Map();
                        unreadCounts.set(userId.toString(), 0);
                        conversation.unreadCounts = unreadCounts;
                        await conversation.save();
                    }
                    // Notify the other participant
                    await emitToConversation(conversationId, userId, 'message:read', { conversationId });
                } catch (err) {
                    console.error('WS message:read error:', err.message);
                }
            }

            // --- user:typing ---
            if (event === 'user:typing') {
                const { conversationId } = data || {};
                if (!conversationId) return;
                await emitToConversation(conversationId, userId, 'user:typing', { conversationId, userId });
            }
        });

        ws.on('close', () => {
            onlineUsers.delete(userId.toString());
            broadcast(userId, 'user:offline', { userId });
        });
    });

    console.log('WebSocket server initialised on /ws');
};
