// index.js
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import connectDB from './src/config/db.js';
import routes from './src/routes/index.js';
import { logger, errorHandler } from './src/middleware/errorMiddleware.js';
import { apiLimiter } from './src/middleware/rateLimitMiddleware.js';
import swaggerUi from 'swagger-ui-express';
import openapiSpec from './src/docs/openapi.js';
import { initWS } from './src/services/wsService.js';

// Load environment variables
dotenv.config();

// Connect to Database
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'https://v0-peer-learning-system.vercel.app',
  'https://peer-learning-system.onrender.com'
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);
app.use('/uploads', express.static(path.resolve('uploads')));

// Routes
app.use('/api', apiLimiter, routes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

// Root route
app.get('/', (req, res) => {
  res.redirect('/api');
});

// Error handling middleware
app.use(errorHandler);

// Create HTTP server and attach WebSocket server
const server = createServer(app);
initWS(server);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
