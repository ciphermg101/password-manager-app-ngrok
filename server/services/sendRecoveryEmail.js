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

const sendRecoveryEmail = async (email, resetLink) => {
    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!isValidEmail(email)) {
        throw new Error('Invalid email address provided');
    }

    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: process.env.EMAIL_USERNAME,
            to: email,
            subject: 'Password Recovery',
            text: `To reset your password, use this link: ${resetLink}`,
            html: `<p>To reset your password, use this <a href="${resetLink}">reset link</a>. <b> Note this link will expire in 15 minutes </p>`,
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error(`Failed to send recovery email to ${email}:`, error.message || error);
        throw error;
    }
};

module.exports = { sendRecoveryEmail };
