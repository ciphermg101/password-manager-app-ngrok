const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const verifyToken = require('./middleware/authenticateToken');
const { csrfProtection, csrfTokenHandler, csrfErrorHandler } = require('./middleware/csrfMiddleware');
require('dotenv').config();

const app = express();

// Middleware setup
app.use(express.json());
app.use(cookieParser());

// Configure CORS to allow requests from frontend
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL,
      process.env.NGROK_URL,
      'https://accounts.google.com',
      `chrome-extension://${process.env.EXTENSION_ID}`,
    ],
    credentials: true, // Allow cookies & headers in requests
  })
);

// Send the client-id to the frontend extension
app.get('/api/google-client-id', (req, res) => {
  res.json({ client_id: process.env.GOOGLE_CLIENT_ID });
});

// CSRF token endpoint
app.get('/csrf-token', csrfProtection, csrfTokenHandler);
app.use(csrfErrorHandler);

// Apply CSRF protection & authentication to protected routes
app.use('/account', csrfProtection, verifyToken, userRoutes);

// Authentication routes (e.g., login, registration)
app.use('/auth', authRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('Server is Active and Running!');
});

// Centralized error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
