require('dotenv').config();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1] || req.cookies.token || req.query.token;

  if (!token) {
    return res.status(498).json({ error: 'Access denied: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET); // Verify the token

    if (decoded?.purpose === '2fa' || decoded?.purpose === 'login') {
      req.user = decoded;
      next();
    } else {
      return res.status(498).json({ error: 'Access denied: Invalid token purpose.' });
    }    
  } catch (err) {
    // Send a response indicating that the token is expired or invalid
    return res.status(498).json({ 
      error: 'Token verification failed: Invalid or expired token. Please log in again.' 
    });
  }
};

module.exports = verifyToken;
