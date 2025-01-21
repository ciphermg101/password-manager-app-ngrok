const csrf = require('csurf');

// Helper to generate cookie settings
const getCookieSettings = () => {
  return {
    httpOnly: true,
    sameSite: 'Lax',
    secure: true, // Always secure since we're using ngrok
    maxAge: 3600000, // 1-hour expiration
    path: '/',
    domain: 'witty-tadpole-generally.ngrok-free.app',
  };
};

// CSRF middleware configuration
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    sameSite: 'Lax',
    secure: true, 
    maxAge: 3600000,
    path: '/',
  },
});

// CSRF token generation handler
const csrfTokenHandler = (req, res) => {
  try {
    const csrfToken = req.csrfToken();
    const cookieSettings = getCookieSettings();
    res.cookie('csrfToken', csrfToken, cookieSettings);
    res.json({ csrfToken });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error generating CSRF token' });
  }
};

// Global error handler for CSRF validation errors
const csrfErrorHandler = (err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    res.status(403).json({ error: 'Invalid CSRF token' });
  } else {
    next(err);
  }
};

module.exports = { csrfProtection, csrfTokenHandler, csrfErrorHandler };
