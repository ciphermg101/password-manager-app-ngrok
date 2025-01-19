const nodemailer = require('nodemailer');

const createTransporter = () => {
    try {
        return nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USERNAME,
                pass: process.env.EMAIL_PASSWORD,
            },
            timeout: 15000, // 15 seconds timeout
        });
    } catch (error) {
        console.error('Failed to create email transporter:', error);
        throw new Error('Failed to authenticate email transporter');
    }
};

const sendVerificationEmail = async (email, verificationLink) => {
    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!isValidEmail(email)) {
        throw new Error('Invalid email address provided');
    }

    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: process.env.EMAIL_USERNAME,
            to: email,
            subject: 'Email Verification',
            text: `To verify your email, use this link: ${verificationLink}`,
            html: `<p>To verify your email, use this <a href="${verificationLink}">verification link</a>.</p>`,
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error(`Failed to send verification email to ${email}:`, error.message || error);
        throw error;
    }
};

module.exports = { sendVerificationEmail };
