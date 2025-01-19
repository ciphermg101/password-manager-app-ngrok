const crypto = require('crypto');

// Retrieve the secret key from environment variables
const SECRET_KEY = Buffer.from(process.env.SECRET_KEY, 'hex');
const STATIC_EMAIL_IV = Buffer.from(process.env.STATIC_EMAIL_IV, 'hex');
const STATIC_GOOGLE_OAUTH_IV = Buffer.from(process.env.STATIC_GOOGLE_OAUTH_IV, 'hex');
const ALGORITHM = 'aes-256-cbc';

// Encrypt function
exports.encryptField = (field, iv = null) => {
    if (!field) return { encryptedField: null, iv: null }; 
    iv = iv ? Buffer.from(iv, 'hex') : crypto.randomBytes(16); // Use provided IV or generate a new one
    const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
    let encrypted = cipher.update(field, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { encryptedField: encrypted, iv: iv.toString('hex') };
};

// Decrypt function
exports.decryptField = (encryptedField, iv) => {
    if (!encryptedField || !iv) return null; 
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encryptedField, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

// Dedicated Static iv logic for email and google_oauth_id
function encryptWithStaticIv(field, staticIv) {
    if (!field) return null; 
    const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, staticIv);
    let encrypted = cipher.update(field, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

function decryptWithStaticIv(encryptedField, staticIv) {
    if (!encryptedField) return null; 
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, staticIv);
    let decrypted = decipher.update(encryptedField, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

exports.encryptEmail = (email) => encryptWithStaticIv(email, STATIC_EMAIL_IV);
exports.decryptEmail = (encryptedEmail) => decryptWithStaticIv(encryptedEmail, STATIC_EMAIL_IV);

exports.encryptGoogleOauthId = (googleOauthId) => encryptWithStaticIv(googleOauthId, STATIC_GOOGLE_OAUTH_IV);
exports.decryptGoogleOauthId = (encryptedGoogleOauthId) => decryptWithStaticIv(encryptedGoogleOauthId, STATIC_GOOGLE_OAUTH_IV);
