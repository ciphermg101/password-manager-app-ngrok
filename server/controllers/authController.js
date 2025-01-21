const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/userSchema');
const TwoFactorAuth = require('../models/2faSchema');
require('dotenv').config();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const { sendRecoveryEmail } = require('../services/sendRecoveryEmail');
const { sendVerificationEmail } = require('../services/sendVerificationEmail');
const { sendPasswordChangeAlert } = require('../services/sendPasswordChangeAlert');
const frontendUrl = process.env.FRONTEND_URL;
const { encryptField, encryptEmail, encryptGoogleOauthId, decryptEmail } = require('../utils/encryption');
const refreshTokens = [];
const speakeasy = require('speakeasy');

function generateDeviceId() {
  return crypto.randomUUID(); // Generates a unique UUID
}

// Sign up endpoint
exports.signup = async (req, res) => {
    const { email, username, password, googleToken } = req.body;

    if (googleToken) {
      try {
          // Verify Google token
          const ticket = await client.verifyIdToken({
              idToken: googleToken,
              audience: process.env.GOOGLE_CLIENT_ID,
          });
          const payload = ticket.getPayload();
          const googleEmail = payload.email;
          const googleOauthId = payload.sub;
  
          // Encrypt email with a static IV
          const encryptedGoogleEmail = encryptEmail(googleEmail);
  
          // Encrypt google_oauth_id with a static IV
          const encryptedGoogleOauthId = encryptGoogleOauthId(googleOauthId);
          const googleEmailIv = process.env.STATIC_EMAIL_IV;
          const STATIC_GOOGLE_OAUTH_IV = process.env.STATIC_GOOGLE_OAUTH_IV;
  
          // Check if user already exists
          let user = await User.findOne({
              where: { email: encryptedGoogleEmail, email_iv: googleEmailIv },
          });
  
          if (!user) {
            user = await User.create({
                email: encryptedGoogleEmail,
                email_iv: googleEmailIv,
                username: encryptedUsername,
                username_iv: usernameIv,
                google_oauth_id: encryptedGoogleOauthId,
                google_oauth_id_iv: STATIC_GOOGLE_OAUTH_IV,
                password_hash: passwordHash,
                device_id: generateDeviceId(),
                is_verified: true, // Mark Google users as verified
            });
        }
        
        // Generate login tokens
        const { token, deviceId } = setTokens(res, user.id, googleEmail, user.device_id, "login");
        
        return res.status(201).json({
            message: 'Login Successful!',
            action: 'login_successful',
            token,
            deviceId,
            email: googleEmail,
        });        
      } catch (err) {
          console.error("Google OAuth Error:", err);
          return res.status(400).json({ error: 'Invalid Google token' });
      }
    }

    if (email && password) {
      try {
          const encryptedEmail = encryptEmail(email);
          const emailIv = process.env.STATIC_EMAIL_IV;
  
          let user = await User.findOne({ where: { email: encryptedEmail, email_iv: emailIv } });
  
          if (user) {
              return res.status(400).json({ error: 'User already exists with this email' });
          }
  
          const hashedPassword = await argon2.hash(password, {
              type: argon2.argon2id,
              memoryCost: 2 ** 16,
              timeCost: 3,
              parallelism: 1,
          });
  
          const { encryptedField: encryptedUsername, iv: usernameIv } = encryptField(username);
  
          user = new User({
              email: encryptedEmail,
              email_iv: emailIv,
              username: encryptedUsername,
              username_iv: usernameIv,
              password_hash: hashedPassword,
              device_id: generateDeviceId(),
              is_verified: false,  // Initially set to false
          });
  
          // Save the user to the database
          await user.save();
  
          // Generate a verification token
          const verificationToken = jwt.sign({ id: user.id, purpose: 'email-verification' }, JWT_SECRET, { expiresIn: '24h' });
  
          // Save the verification token and expiration to the database
          user.verification_token = verificationToken;
          user.email_verification_expires = new Date(Date.now() + 259200000); // Token expires in 3 days
          await user.save();
  
          // Send verification email
          const verificationLink = `${frontendUrl}/verify-email/${verificationToken}`;
          try {
              await sendVerificationEmail(email, verificationLink);
          } catch (emailError) {
              console.error('Error sending verification email:', emailError);
              return res.status(500).json({ message: 'Failed to send verification email. Please try again later.' });
          }
  
          // respond with a success message
          return res.status(201).json({ 
            message: 'Signup successful. Please check your email to verify your account.' 
        });        
  
      } catch (err) {
          console.error("Signup Error:", err);
          return res.status(500).json({ error: 'Something went wrong during signup' });
      }
    }  
  return res.status(400).json({ error: 'Email, password, or Google token required' });  
};

// Controller for verifying email
exports.verifyEmail = async (req, res) => {
  const { token } = req.params;

  try {
      const decoded = jwt.verify(token, JWT_SECRET);

      if (decoded.purpose !== 'email-verification') {
          throw new Error('Invalid token purpose');
      }

      const user = await User.findOne({ where: { id: decoded.id } });

      if (!user) {
          throw new Error('User not found');
      }

      // Check if the verification token has expired
      if (new Date() > new Date(user.emailVerificationExpires)) {
          throw new Error('Verification token has expired');
      }

      // Mark the email as verified
      user.is_verified = true;  // Update the isVerified field to true
      user.verification_token = null; // Clear the verification token after verification
      user.email_verification_expires = null; // Clear the expiration date
      await user.save();

      res.status(200).json({ message: 'Email verified successfully' });
  } catch (err) {
      console.error('Error verifying email:', err);
      res.status(400).json({ message: err.message });
  }
};

exports.loginWithEmailPassword = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Encrypt email using the static IV
    const encryptedEmail = encryptEmail(email);

    // Look up the user by encrypted email
    const user = await User.findOne({ where: { email: encryptedEmail } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if the user is verified
    if (!user.is_verified) {
      return res.status(403).json({ error: 'User is not verified' });
    }

    // Check if the user is a Google OAuth user
    if (user.google_oauth_id) {
      return res.status(403).json({ error: 'Please use Google to login' });
    }

    // Verify the password
    const isPasswordValid = await argon2.verify(user.password_hash, password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const decryptedEmail = decryptEmail(user.email);

    // If 2FA is enabled
    if (user.two_factor_enabled) {
      // Set the token for 2FA and send it in the response
      const { token } = setTokens(res, user.id, decryptedEmail, user.device_id, "2fa");
      return res.status(200).json({
        message: 'Password verified, proceed to enter 2FA code',
        action: 'redirect_to_2fa', // Specific action for the frontend to handle
        userId: user.id,
        email: decryptedEmail,
        token,  // Send the token for 2FA
      });
    }

    // If no 2FA is enabled, proceed to login and generate tokens
    // Update the last login timestamp
    await user.update({ last_login: new Date() });

    // Set tokens and send response with token, refreshToken, and deviceId
    const { token, deviceId } = setTokens(res, user.id, decryptedEmail, user.device_id, "login");

    return res.status(200).json({
      message: 'Login successful',
      action: 'login_successful', 
      token,                     
      deviceId,                  
      email: decryptedEmail    
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

exports.loginWithGoogle = async (req, res) => {
  const { googleToken } = req.body;

  try {
    if (!googleToken) {
      return res.status(400).json({ error: 'Google token is required' });
    }

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleEmail = payload.email;
    const googleOauthId = payload.sub;

    // Encrypt email with a static IV
    const encryptedGoogleEmail = encryptEmail(googleEmail);

    // Encrypt google_oauth_id with a static IV
    const encryptedGoogleOauthId = encryptGoogleOauthId(googleOauthId);
    const googleEmailIv = process.env.STATIC_EMAIL_IV;
    const STATIC_GOOGLE_OAUTH_IV = process.env.STATIC_GOOGLE_OAUTH_IV;

    // Check if user already exists
    let user = await User.findOne({
      where: { email: encryptedGoogleEmail, email_iv: googleEmailIv },
    });

    if (!user) {
      // Encrypt username dynamically
      const { encryptedField: encryptedUsername, iv: usernameIv } = encryptField(payload.name || googleEmail);
      const placeholderPassword = 'google-oauth-user'; // Placeholder value for Google users
      const passwordHash = await argon2.hash(placeholderPassword, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 3,
      });

      // Create new user
      user = await User.create({
        email: encryptedGoogleEmail,
        email_iv: googleEmailIv,
        username: encryptedUsername,
        username_iv: usernameIv,
        google_oauth_id: encryptedGoogleOauthId,
        google_oauth_id_iv: STATIC_GOOGLE_OAUTH_IV,
        password_hash: passwordHash,
        device_id: generateDeviceId(),
      });
    }

    // If 2FA is enabled for the user
    if (user.two_factor_enabled) {
      // Generate and return a response to ask for 2FA code
      const { token } = setTokens(res, user.id, googleEmail, user.device_id, "2fa");
      return res.status(200).json({
        message: 'Google login successful, please enter your 2FA code',
        action: 'redirect_to_2fa', // Indicate frontend action to handle 2FA prompt
        userId: user.id,
        email: googleEmail,
        token, // Send the token for 2FA verification
      });
    }

    // If no 2FA is enabled, proceed with login and generate tokens
    // Update the last login timestamp
    await user.update({ last_login: new Date() });

    // Set tokens and send response with token, refreshToken, and deviceId
    const { token, deviceId } = setTokens(res, user.id, googleEmail, user.device_id, "login");

    return res.status(200).json({
      message: 'Google login successful',
      action: 'login_successful',
      token,
      deviceId,
      email: googleEmail,
    });
  } catch (err) {
    console.error('Google Login Error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};

exports.verifyTwoFactorAuth = async (req, res) => {
  try {
    const { mf_token, userId } = req.body;

    // Validate inputs
    if (!userId) {
      return res.status(400).json({ message: 'User ID is missing or invalid' });
    }

    if (!mf_token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    // Fetch the 2FA secret for the user
    const twoFactorAuthRecord = await TwoFactorAuth.findOne({ where: { user_id: userId } });

    if (!twoFactorAuthRecord) {
      console.error(`2FA record not found for user: ${userId}`);
      return res.status(404).json({ message: '2FA record not found' });
    }

    // Verify the OTP using the stored secret
    const verified = speakeasy.totp.verify({
      secret: twoFactorAuthRecord.otp_secret,
      encoding: 'base32',
      token: mf_token,
      window: 3,  // Allow up to 3 time windows for verification
    });

    if (!verified) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Fetch the user data after 2FA is verified
    const user = await User.findOne({ where: { id: userId } });
    const decryptedEmail = decryptEmail(user.email);

    // Clear any existing token cookies before setting a new one
    res.clearCookie('token');
    res.clearCookie('refreshToken');

    // Set tokens after 2FA verification
    const { token, deviceId } = setTokens(res, user.id, decryptedEmail, user.device_id, "login");

    // Update the last time when otp was used
    await twoFactorAuthRecord.update({ last_used_at: new Date() })

    // Update the last login timestamp
    await user.update({ last_login: new Date() })

    res.status(200).json({
      message: '2FA verification successful',
      deviceId,
      token,
    });
  } catch (error) {
    console.error('2FA verification error: ', error);
    res.status(500).json({ message: 'Failed to verify 2FA. Please try again later.' });
  }
};

function setTokens(res, userId, email, deviceId, purpose = undefined) {
  // If purpose is provided, include it in the payload; otherwise, leave it out
  const payload = purpose ? { userId, email, purpose } : { userId, email };

  // Generate the JWT token with the dynamic payload
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
  const refreshToken = jwt.sign({ userId, email }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });

  // Set the tokens as cookies
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 3600000, // 1 hour
    path: '/',
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 7 * 24 * 3600000, // 7 days
    path: '/',
  });

  return { token, refreshToken, deviceId };
}

// Controller to check and send token 
exports.getAuthCookie = (req, res) => {
  try {
    const token = req.cookies.token; // Read the token from the cookies

    if (!token) {
      return res.status(400).json({ error: 'Token not found' });
    }

    // send the token to the frontend
    return res.status(200).json({
      message: 'Token found',
      token: token,
    });
  } catch (err) {
    console.error('Error retrieving token:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Refresh Token endpoint
exports.refreshToken = (req, res) => {
  const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token is required' });
  }

  if (!refreshTokens.includes(refreshToken)) {
    return res.status(403).json({ error: 'Invalid refresh token' });
  }

  try {
    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Send new access token as response
    res.json({ token: newAccessToken });
  } catch (err) {
    console.error('Error verifying refresh token:', err);
    return res.status(403).json({ error: 'Invalid or expired refresh token' });
  }
};

exports.authenticateDevice = async (req, res, next) => {
  const { deviceId } = req.headers;
  const { userId } = req.user;

  if (!deviceId) {
      return res.status(401).json({ error: 'Device ID is required' });
  }

  const user = await User.findById(userId);
  if (user.device_id !== deviceId) {
      return res.status(403).json({ error: 'Device not authorized' });
  }
  next();
};

// Password Reset
const hashResetToken = (resetToken) => {
  return crypto.createHash('sha256').update(resetToken).digest('hex');
};

// Controller for requesting password reset
exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const encryptedEmail = encryptEmail(email);
    const user = await User.findOne({ where: { email: encryptedEmail } });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Generate a password reset token with userId and purpose
    const resetToken = jwt.sign({ purpose: 'password-reset', id: user.id }, JWT_SECRET, { expiresIn: '15m' });

    const resetTokenHash = hashResetToken(resetToken);
    const resetTokenExpires = new Date(Date.now() + 900000); // 15 mins from now

    user.reset_token_hash = resetTokenHash;
    user.reset_token_expires = resetTokenExpires;
    await user.save();

    const resetLink = `${frontendUrl}/reset-password/${encodeURIComponent(resetToken)}`;

    try {
      await sendRecoveryEmail(email, resetLink);
    } catch (emailError) {
      console.error('Error sending password reset email:', emailError);
      return res.status(500).json({ message: 'Failed to send password reset email. Please try again later.' });
    }

    res.status(200).json({ message: 'Password reset link has been sent to your email' });
  } catch (err) {
    console.error('Error processing password reset request:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Utility function to verify and decode the reset token
async function verifyResetTokenLogic(token) {
  if (!token) {
    throw new Error('Token is required');
  }

  const decoded = jwt.verify(token, JWT_SECRET);

  if (!decoded || !decoded.id || decoded.purpose !== 'password-reset') {
    throw new Error('Invalid token structure or purpose');
  }

  const user = await User.findOne({ where: { id: decoded.id } });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.resetTokenExpires && isTokenExpired(user.resetTokenExpires)) {
    throw new Error('Reset token has expired');
  }

  return { decoded, user };
}

// Function to check if the token is expired
function isTokenExpired(expirationDate) {
  return new Date() > new Date(expirationDate);
}

// Controller to verify the reset token
exports.verifyResetToken = async (req, res) => {
  const { token } = req.params;

  try {
    // Use the common token verification logic
    await verifyResetTokenLogic(token);
    res.status(200).json({ message: 'Token is valid' });
  } catch (err) {
    console.error('Error verifying reset token:', err);
    res.status(400).json({ message: err.message });
  }
};

// Controller for resetting password
exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token and new password are required' });
  }

  try {
    // Use the common token verification logic
    const { user } = await verifyResetTokenLogic(token);

    // Hash the new password
    const hashedPassword = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });    

    // Set the user's password_hash and reset token fields to null
    user.password_hash = hashedPassword;
    user.reset_token_hash = null;
    user.reset_token_expires = null;

    // Save the updated user object
    await user.save();
    res.status(200).json({ message: 'Password reset successfully' });

    // Send alert email
    try {
      const email = decryptEmail(user.email);
      await sendPasswordChangeAlert(email);
    } catch (emailError) {
        console.error('Error sending email:', emailError);
        return res.status(500).json({ message: 'Failed to send email. Please try again later.' });
    }
  } catch (err) {
    console.error('Error resetting password:', err);
    res.status(400).json({ message: err.message, error: err });
  }
};

// Logout endpoint
exports.logout = (req, res) => {
  res.clearCookie('token');
  res.clearCookie('refreshToken');
  return res.status(200).json({ message: 'Logged out successfully', clearSession: true});
};
