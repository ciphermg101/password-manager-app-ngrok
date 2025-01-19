const express = require('express');
const Joi = require('joi');
const router = express.Router();
const verifyToken = require('../middleware/authenticateToken');
const { csrfProtection } = require('../middleware/csrfMiddleware');
const { protectedRoute, getCredentials, fetchAllCreds, updatePassword, deletePassword, savePassword, exportPasswords, importPasswords, getUsername, updateUserPassword, enableTwoFactorAuth, disableTwoFactorAuth, getTwoFactorAuthStatus } = require('../controllers/userController');

// Protected route - Only accessible if logged in
router.get('/check-auth', verifyToken, protectedRoute);

// Define a schema to validate the site_url
const siteUrlValidationSchema = Joi.object({
  site_url: Joi.string().uri().required().messages({
    'string.uri': 'Invalid site URL format.',
    'any.required': 'Site URL is required.'
  })
});

// Route to fetch credentials for a specific domain (protected by JWT)
router.get('/get-credentials', verifyToken, csrfProtection, async (req, res, next) => {
  try {
    // Decode the site_url query parameter
    const { site_url } = req.query;
    if (site_url) {
      req.query.site_url = decodeURIComponent(site_url);
    }

    // Validate the decoded site_url
    const { error } = siteUrlValidationSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Proceed to fetch credentials
    await getCredentials(req, res, next);
  } catch (err) {
    next(err);
  }
});

// Route to fetch all credentials of a specific user
router.get('/fetch-allcreds', verifyToken, csrfProtection, async (req, res, next) => {
  try {
    await fetchAllCreds(req, res, next);
  } catch (err) {
    next(err);
  }
});

// Update password - Protected route
router.post('/update-password', verifyToken, csrfProtection, async (req, res, next) => {
  try {
    // Ensure the request body is valid for password change
    const { error } = Joi.object({
      id: Joi.string().required().uuid(),
      newPassword: Joi.string().required().min(6).regex(/[a-zA-Z0-9]/).message('Password should be at least 6 characters long and contain letters and numbers'),
    }).validate(req.body);

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Call the updatePassword function
    await updatePassword(req, res);
  } catch (err) {
    next(err);
  }
});

// Delete password - Protected route
router.delete('/delete-password', verifyToken, csrfProtection, async (req, res, next) => {
  try {
    // Validate request body to ensure username and url are provided
    const { error } = Joi.object({
      username: Joi.string().required(),
      site_url: Joi.string().uri().required(),
    }).validate(req.body);

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Proceed to the controller function to delete the password
    await deletePassword(req, res, next);
  } catch (err) {
    next(err);
  }
});

// Save a single password - Protected route
router.post('/save-password', verifyToken, csrfProtection, async (req, res, next) => {
  try {
    await savePassword(req, res, next);
  } catch (err) {
    next(err);
  }
});

// Export passwords - Protected route
router.get('/export-passwords', verifyToken, csrfProtection, async (req, res, next) => {
  try {
    await exportPasswords(req, res, next);
  } catch (err) {
    next(err);
  }
});

// Import passwords - Protected route
router.post('/import-passwords', verifyToken, csrfProtection, async (req, res, next) => {
  try {
    await importPasswords(req, res, next);
  } catch (err) {
    next(err);
  }
});

router.get('/get-username', verifyToken, csrfProtection, async (req, res, next) => {
  try {
    await getUsername(req, res, next);
  } catch (err) {
    next(err);
  }
});

// Route to update user password
router.put('/change-password', verifyToken, csrfProtection, async (req, res, next) => {
  try {
    await updateUserPassword(req, res, next);
  } catch (err) {
    next(err);
  }
});

// Route to enable 2FA
router.post('/enable-2fa', verifyToken, csrfProtection, async (req, res, next) => {
  try {
    await enableTwoFactorAuth(req, res, next);
  } catch (err) {
    next(err);
  }
});

router.post('/disable-2fa', verifyToken, csrfProtection, async (req, res, next) => {
  try {
    await disableTwoFactorAuth(req, res, next);
  } catch (err) {
    next(err);
  }
});

router.get('/2fa-status', verifyToken, csrfProtection, async (req, res, next) => {
  try {
    await getTwoFactorAuthStatus(req, res, next);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
