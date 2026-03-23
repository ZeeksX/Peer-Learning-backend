import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ChatMessage from '../models/ChatMessage.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import { extractLinks } from '../controllers/chatController.js';

dotenv.config();

const testLinkExtraction = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Test the utility function
    console.log('\n--- Testing URL Extraction Utility ---');
    const testCases = [
      {
        text: 'Check this out: https://google.com and http://example.org/path?query=1',
        expected: ['https://google.com', 'http://example.org/path?query=1']
      },
      {
        text: 'Visit www.github.com for code.',
        expected: ['https://www.github.com'] // Should be normalized with https://
      },
      {
        text: 'No links here!',
        expected: []
      },
      {
        text: 'Duplicate links: https://test.com and https://test.com',
        expected: ['https://test.com'] // Should be unique
      }
    ];

    testCases.forEach((tc, i) => {
      const links = extractLinks(tc.text);
      const passed = JSON.stringify(links) === JSON.stringify(tc.expected);
      console.log(`Test Case ${i + 1}: ${passed ? 'PASS' : 'FAIL'} (Expected: ${JSON.stringify(tc.expected)}, Got: ${JSON.stringify(links)})`);
      if (!passed) throw new Error(`Test Case ${i + 1} failed`);
    });

    // 2. Test database persistence
    console.log('\n--- Testing Database Persistence ---');
    
    // Create dummy data
    const user = await User.create({
      name: 'Test Msg Sender',
      email: `sender-${Date.now()}@test.com`,
      password: 'password123',
      role: 'student'
    });
    const conv = await Conversation.create({ participants: [user._id] });
    
    const messageText = 'Check these: https://reactjs.org and www.mongodb.com';
    const extractedLinks = extractLinks(messageText);
    
    const msg = await ChatMessage.create({
      conversationId: conv._id,
      senderId: user._id,
      text: messageText,
      links: extractedLinks
    });

    const savedMsg = await ChatMessage.findById(msg._id);
    console.log(`Saved links: ${JSON.stringify(savedMsg.links)}`);
    const persistencePassed = savedMsg.links.length === 2 && 
                              savedMsg.links.includes('https://reactjs.org') && 
                              savedMsg.links.includes('https://www.mongodb.com');
    
    console.log(`Persistence Test: ${persistencePassed ? 'PASS' : 'FAIL'}`);

    // Clean up
    await ChatMessage.findByIdAndDelete(msg._id);
    await Conversation.findByIdAndDelete(conv._id);
    await User.findByIdAndDelete(user._id);

    console.log('\nTest completed successfully and data cleaned up.');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
};

testLinkExtraction();
