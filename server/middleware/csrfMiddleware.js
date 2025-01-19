const csrf = require('csurf');

// Helper to generate cookie settings
const getCookieSettings = (req) => {
  const cookieSettings = {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 3600000, // 1-hour expiration
    path: '/',
  };

  const origin = req.get('origin');
  console.log('[INFO] Origin:', origin);

  if (origin) {
    if (origin.includes('ngrok')) {
      cookieSettings.secure = true;
      cookieSettings.domain = 'witty-tadpole-generally.ngrok-free.app';
    } else if (origin.includes('localhost')) {
      cookieSettings.secure = false;
      cookieSettings.domain = 'localhost';
    } else {
      cookieSettings.secure = process.env.NODE_ENV === 'production';
    }
  }

  console.log('[INFO] Cookie Settings:', cookieSettings);
  return cookieSettings;
};

// CSRF middleware configuration
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 3600000, // 1-hour expiration
    path: '/',
  },
});

// CSRF token generation handler
const csrfTokenHandler = (req, res) => {
  try {
    const csrfToken = req.csrfToken();
    console.log('[INFO] Generated CSRF token:', csrfToken);

    // Use the helper to generate consistent cookie settings
    const cookieSettings = getCookieSettings(req);
    res.cookie('csrfToken', csrfToken, cookieSettings);

    res.json({ csrfToken });
  } catch (err) {
    console.error(
      '[ERROR] Error generating CSRF token:',
      err.message,
      { method: req.method, url: req.originalUrl }
    );
    res.status(500).json({ error: 'Internal server error generating CSRF token' });
  }
};

// Global error handler for CSRF validation errors
const csrfErrorHandler = (err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    console.error('[ERROR] CSRF token validation failed:', err.message);
    res.status(403).json({ error: 'Invalid CSRF token' });
  } else {
    next(err);
  }
};

module.exports = { csrfProtection, csrfTokenHandler, csrfErrorHandler };
