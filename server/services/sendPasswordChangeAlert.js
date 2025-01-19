const nodemailer = require('nodemailer');

// Create a transporter for sending emails
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

// Send password change alert email
const sendPasswordChangeAlert = async (email) => {
    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!isValidEmail(email)) {
        throw new Error('Invalid email address provided');
    }

    try {
        const transporter = createTransporter();

        // Format the change time to a more readable format
        const changeTime = new Date().toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });        

        const mailOptions = {
            from: process.env.EMAIL_USERNAME,
            to: email,
            subject: 'Your Password Has Been Changed',
            text: `Hello,\n\nYour password was successfully changed at ${changeTime}. If you did not initiate this change, please take immediate action to secure your account.\n\nIf this was not you, click the following link to recover your account: http://localhost:5173/forgot_password\n\nThank you, \nYour Security Team`,
            html: `<p>Hello,</p>
                    <p>Your password was successfully changed at <strong>${changeTime}</strong>.</p>
                    <p>If you did not initiate this change, please take immediate action to secure your account.</p>
                    <p>If this was not you, <a href="http://localhost:5173/forgot_password">click here</a> to recover your account.</p>
                    <p>Thank you,<br>Keybag Password Manager Tech Team</p>`
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error(`Failed to send email to ${email}:`, error.message || error);
        throw error;
    }
};

module.exports = { sendPasswordChangeAlert };
