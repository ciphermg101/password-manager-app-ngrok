const Credential = require('../models/credentialSchema');
const User = require('../models/userSchema');
const TwoFactorAuth = require('../models/2faSchema');
const { encryptField, decryptField, decryptEmail } = require('../utils/encryption');
const Papa = require('papaparse');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Joi = require('joi');
const argon2 = require('argon2');
const { sendPasswordChangeAlert } = require('../services/sendPasswordChangeAlert');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

// Protected Route for user
exports.protectedRoute = async (req, res) => {
    // Ensure the token was verified and a user is attached to the request
    if (!req.user) {
      return res.status(498).json({ error: 'Unauthorized access: User is not logged in.' });
    }
  
    const { purpose } = req.user;
  
    // Handle different purposes based on the token
    if (purpose === '2fa') {
      return res.status(203).json({ message: 'Token verified for 2FA access.', user: req.user });
    } else if (purpose === 'login') {
      return res.status(200).json({ message: 'Token verified for login access.', user: req.user });
    } else {
      return res.status(498).json({ error: 'Access denied: Invalid token purpose.' });
    }
};  

// Fetches credentials for a specific site 
exports.getCredentials = async (req, res) => {
    try {
        const { site_url } = req.query;
  
        // Fetch credentials for the logged-in user
        const whereCondition = { user_id: req.user.userId };
        const credentials = await Credential.findAll({
            where: whereCondition,
            attributes: [
                'site_url',
                'url_iv',
                'username',
                'username_iv',
                'password',
                'password_iv',
            ],
        });

        if (credentials.length === 0) {
            return res.status(404).json({ message: 'No credentials found' });
        }

        // Decrypt each credential's site_url and compare
        const decryptedCredentials = credentials.map((credential) => {
            const decryptedSiteUrl = decryptField(credential.site_url, credential.url_iv);

            // Only keep the credentials that match the provided site_url
            if (decryptedSiteUrl === site_url) {
                return {
                    site_url: decryptedSiteUrl,
                    username: decryptField(credential.username, credential.username_iv),
                    password: decryptField(credential.password, credential.password_iv),
                };
            }
        }).filter(Boolean);  // Filter out any undefined entries (non-matching)

        if (decryptedCredentials.length === 0) {
            return res.status(404).json({ message: 'No matching credentials found' });
        }

        res.status(200).json(decryptedCredentials);
    } catch (error) {
        console.error('Error fetching credentials:', error);
        res.status(500).json({ message: 'Failed to fetch credentials' });
    }
};

// fetches all stored credentials for a specific user
exports.fetchAllCreds = async (req, res) => {
    try {
        const whereCondition = { user_id: req.user.userId };
        const credentials = await Credential.findAll({
            where: whereCondition,
            attributes: [
                'site_url',
                'url_iv',
                'username',
                'username_iv',
                'password',
                'password_iv',
            ],
        });
  
        if (credentials.length === 0) {
            return res.status(404).json({ message: 'No credentials found' });
        }
  
        // Decrypt each field using its associated IV before sending the response
        const response = credentials.map((credential) => ({
            url: decryptField(credential.site_url, credential.url_iv),
            username: decryptField(credential.username, credential.username_iv),
            password: decryptField(credential.password, credential.password_iv),
        }));
  
        res.status(200).json(response);
    } catch (error) {
        console.error('Error fetching credentials:', error);
        res.status(500).json({ message: 'Failed to fetch credentials' });
    }
};

// Update password
exports.updatePassword = async (req, res) => {
    try {
        const { id, newPassword, newSiteUrl, newUsername, newNote } = req.body;
  
        if (!id || !newPassword || !newSiteUrl || !newUsername) {
            return res.status(400).json({ message: 'Credential ID, new site URL, new username, and new password are required' });
        }
  
        // Encrypt the new input fields (newUsername, newSiteUrl) to compare with encrypted data in DB
        const { encryptedUsername } = encryptField(newUsername, credential.username_iv);
        const { encryptedSiteUrl } = encryptField(newSiteUrl, credential.url_iv);
  
        // Find the credential by ID using encrypted username and site_url
        const credential = await Credential.findOne({
            where: { 
                id, 
                user_id: req.user.userId,
                username: encryptedUsername,
                site_url: encryptedSiteUrl,
            },
        });
  
        if (!credential) {
            return res.status(404).json({ message: 'Credential not found' });
        }
  
        // Initialize update fields and IVs
        const updatedFields = {};
        
        // Encrypt and update password if provided
        if (newPassword) {
            const { encryptedPassword, iv: passwordIv } = encryptPassword(newPassword);
            updatedFields.password = encryptedPassword;
            updatedFields.iv = passwordIv;
        }
        
        // Encrypt and update site_url if provided
        if (newSiteUrl) {
            const { encryptedSiteUrl, iv: urlIv } = encryptPassword(newSiteUrl);
            updatedFields.site_url = encryptedSiteUrl;
            updatedFields.url_iv = urlIv;
        }
        
        // Encrypt and update username if provided
        if (newUsername) {
            const { encryptedUsername, iv: usernameIv } = encryptPassword(newUsername);
            updatedFields.username = encryptedUsername;
            updatedFields.username_iv = usernameIv;
        }
        
        // Encrypt and update note if provided
        if (newNote) {
            const { encryptedNote, iv: noteIv } = encryptPassword(newNote);
            updatedFields.note = encryptedNote;
            updatedFields.note_iv = noteIv;
        }
  
        // Update the credential fields with encrypted values
        await credential.update(updatedFields);
  
        res.status(200).json({ message: 'Password and related fields updated successfully' });
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ message: 'Failed to update password' });
    }
};   

// Delete a credential
exports.deletePassword = async (req, res) => {
    try {
        const { username, site_url } = req.body;

        // Check if username and URL are provided
        if (!username || !site_url) {
            return res.status(400).json({ message: 'Username and URL are required' });
        }

        // Fetch all credentials for the user
        const credentials = await Credential.findAll({
            where: {
                user_id: req.user.userId,
            },
            attributes: ['id', 'username', 'site_url', 'username_iv', 'url_iv'],
        });

        // If no credentials are found, return a 404 response
        if (credentials.length === 0) {
            console.log('No credentials found');
            return res.status(404).json({ message: 'No credentials found' });
        }

        // Iterate through each credential to find the matching one
        let credentialToDelete = null;

        for (const credential of credentials) {
            // Decrypt the stored username and site_url
            const decryptedUsername = decryptField(credential.username, credential.username_iv);
            const decryptedSiteUrl = decryptField(credential.site_url, credential.url_iv);

            // Check if the decrypted fields match the provided values
            if (decryptedUsername === username && decryptedSiteUrl === site_url) {
                credentialToDelete = credential;
                break;  // Stop once the matching credential is found
            }
        }

        // If no matching credential is found, return a 404 response
        if (!credentialToDelete) {
            console.log('Credential not found');
            return res.status(404).json({ message: 'Credential does not match' });
        }

        // Now that the credential matches, delete it
        await credentialToDelete.destroy();

        res.status(200).json({ message: 'Credential deleted successfully' });
    } catch (error) {
        console.error('Error deleting credential:', error);
        res.status(500).json({ message: 'Failed to delete credential' });
    }
};

// Save a single credential
const credentialSchema = Joi.object({
    site_url: Joi.string().uri().required(),
    username: Joi.string().min(3).max(255).required(),
    password: Joi.string().min(8).required(),
});
exports.savePassword = async (req, res) => {
    try {
        const { site_url, username, password } = req.body;

        // Validate input
        const { error } = credentialSchema.validate({ site_url, username, password });
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        // Normalize site_url: trim, convert to lowercase, and remove trailing slash
        const normalizedSiteUrl = site_url.trim().toLowerCase().replace(/\/$/, '');

        // Encrypt the fields (site_url, username, password)
        const { encryptedField: encryptedSiteUrl, iv: urlIv } = encryptField(normalizedSiteUrl);
        const { encryptedField: encryptedUsername, iv: usernameIv } = encryptField(username);
        const { encryptedField: encryptedPassword, iv: passwordIv } = encryptField(password);

        // Save credential to the database
        const newCredential = await Credential.create({
            user_id: req.user.userId,
            site_url: encryptedSiteUrl,
            url_iv: urlIv,
            username: encryptedUsername,
            username_iv: usernameIv,
            password: encryptedPassword,
            password_iv: passwordIv,
        });

        res.status(201).json({
            message: 'Credential saved successfully',
        });
    } catch (error) {
        console.error('Error saving credential:', error);
        res.status(500).json({ message: 'Failed to save credential' });
    }
};

// Export credentials to CSV
exports.exportPasswords = async (req, res) => {
  try {
    // Fetch credentials for the authenticated user
    const credentials = await Credential.findAll({
      where: { user_id: req.user.userId },
      attributes: [
        'id',
        'site_url',
        'url_iv',
        'username',
        'username_iv',
        'password',
        'password_iv',
        'note',
        'note_iv',
      ],
    });

    if (credentials.length === 0) {
      return res.status(404).json({ message: 'No credentials found to export' });
    }

    // Decrypt each field before sending the response
    const decryptedEntries = credentials.map((credential) => {
      const decryptedName = decryptField(credential.name, credential.name_iv);
      const decryptedUrl = decryptField(credential.site_url, credential.url_iv);
      const decryptedUsername = decryptField(credential.username, credential.username_iv);
      const decryptedPassword = decryptField(credential.password, credential.password_iv);
      const decryptedNote = decryptField(credential.note, credential.note_iv);

      return {
        name: decryptedName,
        url: decryptedUrl,
        username: decryptedUsername,
        password: decryptedPassword,
        note: decryptedNote,
      };
    });

    // Convert to CSV format using PapaParse
    const csvData = Papa.unparse(decryptedEntries);

    // Set headers to prompt download as a CSV file
    res.setHeader('Content-Disposition', 'attachment; filename=passwords_export.csv');
    res.setHeader('Content-Type', 'text/csv');
    res.status(200).send(csvData);
  } catch (error) {
    console.error('Error exporting passwords:', error);
    res.status(500).json({ message: 'Failed to export passwords', details: error.message });
  }
};

// Configure multer for file upload
const upload = multer({ dest: path.join(__dirname, '../uploads/') });

exports.importPasswords = async (req, res) => {
    upload.single('csvFile')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: 'Error uploading file', details: err });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'CSV file is required' });
        }

        // Validate that the file is a CSV file (based on MIME type or extension)
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        const fileMimeType = req.file.mimetype;

        if (
            fileExtension !== '.csv' || 
            (fileMimeType !== 'text/csv' && fileMimeType !== 'application/vnd.ms-excel')
        ) {
            return res.status(400).json({ message: 'Only CSV files are allowed' });
        }        

        const filePath = path.join(__dirname, '../uploads/', req.file.filename);

        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');

            const { data, errors } = Papa.parse(fileContent, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                delimiter: ',',
                quoteChar: '"',
            });

            if (errors.length > 0) {
                console.error('CSV Parsing Errors:', errors);
                return res.status(400).json({ message: 'Error parsing CSV file', details: errors });
            }

            const passwordSchema = Joi.object({
                name: Joi.string().allow(null, '').optional(),
                url: Joi.string().uri().required(),
                username: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null, '').optional(),  // Allow string or number
                password: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
                note: Joi.string().allow(null, '').optional(),
            });

            const passwordEntries = [];
            for (const entry of data) {
                const { error, value } = passwordSchema.validate(entry);
                if (error) {
                    return res.status(400).json({
                        message: `Validation error on entry: ${JSON.stringify(entry)}`,
                        details: error.details,
                    });
                }

                // Normalize the site_url: trim, convert to lowercase, and remove trailing slash
                const normalizedUrl = value.url.trim().toLowerCase().replace(/\/$/, '');
                
                // Ensure username and password are treated as strings
                const normalizedUsername = String(value.username).trim();  
                const normalizedPassword = String(value.password).trim();  // Convert password to string

                // Encrypt the normalized fields
                const { encryptedField: encryptedUrl, iv: urlIv } = encryptField(normalizedUrl);
                const { encryptedField: encryptedUsername, iv: usernameIv } = encryptField(normalizedUsername);
                const { encryptedField: encryptedPassword, iv: passwordIv } = encryptField(normalizedPassword); // Use normalizedPassword
                const { encryptedField: encryptedName, iv: nameIv } = encryptField(value.name ?? ''); // Ensure nullish values are replaced with ''
                const { encryptedField: encryptedNote, iv: noteIv } = encryptField(value.note ?? '');

                // Fetch all credentials for the user
                const credentials = await Credential.findAll({
                    where: {
                        user_id: req.user.userId,
                    },
                    attributes: ['id', 'username', 'site_url', 'username_iv', 'url_iv'],
                });

                let credentialExists = false;

                // Decrypt each credential's username and site_url and compare
                for (const credential of credentials) {
                    const decryptedUsername = decryptField(credential.username, credential.username_iv);
                    const decryptedSiteUrl = decryptField(credential.site_url, credential.url_iv);

                    // If a matching credential is found, set flag to skip this entry
                    if (decryptedUsername === normalizedUsername && decryptedSiteUrl === normalizedUrl) {
                        credentialExists = true;
                        break;
                    }
                }

                if (credentialExists) {
                    continue;  // Skip this entry if it already exists
                }

                // If not found, prepare the password entry for saving
                passwordEntries.push({
                    user_id: req.user.userId,
                    site_url: encryptedUrl,
                    url_iv: urlIv,
                    username: encryptedUsername,
                    username_iv: usernameIv,
                    password: encryptedPassword,
                    password_iv: passwordIv,
                    name: encryptedName,
                    name_iv: nameIv,
                    note: encryptedNote,
                    note_iv: noteIv, 
                });
            }

            if (passwordEntries.length > 0) {
                await Credential.bulkCreate(passwordEntries);
                res.status(200).json({ message: 'Passwords imported successfully' });
            } else {
                res.status(201).json({ message: 'No new passwords were imported as they already exist' });
            }
        } catch (error) {
            console.error('Error importing passwords:', error);
            res.status(500).json({ message: 'Failed to import passwords' });
        } finally {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (cleanupError) {
                console.error('Error cleaning up uploaded file:', cleanupError);
            }
        }
    });
};

exports.getUsername = async (req, res) => {
    try {
        const userId = req.user.userId;  // Extract userId from the request
        const user = await User.findOne({ where: { id: userId } });

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Decrypt the username using the stored IV
        const decryptedUsername = decryptField(user.username, user.username_iv); 

        if (!decryptedUsername) {
            return res.status(400).json({ error: 'Failed to decrypt username!' });
        }
        // Respond with the decrypted username
        res.json({ username: decryptedUsername });
    } catch (error) {
        console.error('Error fetching username:', error);
        res.status(500).json({ error: 'Server error occurred while retrieving username.' });
    }
};

// Update user's password
exports.updateUserPassword = async (req, res) => {
    let responseSent = false; // Flag to track if a response has already been sent

    try {
        const { newPassword } = req.body;

        if (!newPassword) {
            if (!responseSent) {
                res.status(400).json({ message: 'New password is required.' });
                responseSent = true;
            }
            return; // Stop execution after sending the error response
        }

        // Get the authenticated user from the request object
        const user = await User.findOne({ where: { id: req.user.userId } });

        if (!user) {
            if (!responseSent) {
                res.status(404).json({ message: 'User not found.' });
                responseSent = true;
            }
            return; // Stop execution after sending the error response
        }

        // Hash the new password using argon2
        const hashedNewPassword = await argon2.hash(newPassword, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16,
            timeCost: 3,
            parallelism: 1,
        });

        // Update the user's password
        user.password_hash = hashedNewPassword;
        await user.save();

        // Send success response
        if (!responseSent) {
            res.status(200).json({ message: 'Password updated successfully.' });
            responseSent = true;
        }

        // Send alert email (ensure email is only sent if the response has not been sent yet)
        try {
            const email = decryptEmail(user.email);
            await sendPasswordChangeAlert(email);
        } catch (emailError) {
            console.error('Error sending email:', emailError);
            if (!responseSent) {
                res.status(500).json({ message: 'Failed to send email. Please try again later.' });
                responseSent = true;
            }
        }

    } catch (error) {
        console.error('Error updating password:', error);
        if (!responseSent) {
            res.status(500).json({ message: 'Failed to update password.' });
            responseSent = true;
        }
    }
};

exports.enableTwoFactorAuth = async (req, res) => {
    try {
      // Validate and extract the user ID from the request
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(400).json({ message: 'User ID is missing or invalid' });
      }
  
      // Generate a secret key for 2FA using speakeasy
      const secret = speakeasy.generateSecret({
        name: 'keybag_password_manager',
        length: 32,
      });
  
      // Find the user in the database
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      // Save the secret in the two_factor_auth table
      const [twoFactorAuthRecord, created] = await TwoFactorAuth.findOrCreate({
        where: { user_id: userId },
        defaults: {
          otp_secret: secret.base32,
          enabled_at: new Date(),
        },
      });
  
      if (!created) {
        // Update the existing record if it already exists
        twoFactorAuthRecord.otp_secret = secret.base32;
        twoFactorAuthRecord.enabled_at = new Date();
        await twoFactorAuthRecord.save();
      }
  
      // Update the user record to mark 2FA as enabled
      user.two_factor_enabled = true;
      await user.save();
  
      // Generate the QR code URL for the user
      const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
  
      // Return the QR code URL and success message
      res.status(200).json({ qrCodeUrl });
    } catch (error) {
      console.error('Error enabling 2FA:', error);
      res.status(500).json({ message: 'Failed to enable 2FA. Please try again later.' });
    }
};

exports.disableTwoFactorAuth = async (req, res) => {
    try {
      // Validate and extract the user ID from the request
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(400).json({ message: 'User ID is missing or invalid' });
      }
  
      // Find the user in the database
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      // Check if 2FA is already disabled
      if (!user.two_factor_enabled) {
        return res.status(400).json({ message: '2FA is already disabled' });
      }
  
      // Fetch the 2FA record from the database
      const twoFactorAuthRecord = await TwoFactorAuth.findOne({
        where: { user_id: userId },
      });
  
      if (!twoFactorAuthRecord) {
        return res.status(404).json({ message: '2FA record not found' });
      }
  
      // Delete or mark 2FA as disabled
      await twoFactorAuthRecord.destroy();
  
      // Update the user record to mark 2FA as disabled
      user.two_factor_enabled = false;
      await user.save();
  
      // Respond with success message
      res.status(200).json({ message: '2FA has been successfully disabled' });
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      res.status(500).json({ message: 'Failed to disable 2FA. Please try again later.' });
    }
};
  
exports.getTwoFactorAuthStatus = async (req, res) => {
    try {
      // Validate and extract the user ID from the request
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(400).json({ message: 'User ID is missing or invalid' });
      }
  
      // Find the user in the database
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      // Check the status of 2FA from the user record
      const is2FAEnabled = user.two_factor_enabled;
  
      // Return the status of 2FA
      res.status(200).json({ is2FAEnabled });
    } catch (error) {
      console.error('Error fetching 2FA status:', error);
      res.status(500).json({ message: 'Failed to fetch 2FA status. Please try again later.' });
    }
  };
  

