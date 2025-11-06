const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Send verification email
const sendVerificationEmail = async (email, name, verificationUrl) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"AI Video System" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Verify Your Email Address',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Email Verification</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .container {
              background-color: #ffffff;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #1a73e8;
              margin-bottom: 10px;
            }
            .title {
              font-size: 20px;
              font-weight: 600;
              margin-bottom: 20px;
              color: #333;
            }
            .content {
              margin-bottom: 30px;
            }
            .button {
              display: inline-block;
              background-color: #1a73e8;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              font-weight: 600;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              font-size: 12px;
              color: #666;
            }
            .highlight {
              background-color: #e8f0fe;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
              border-left: 4px solid #1a73e8;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">AI Video System</div>
            </div>
            
            <h1 class="title">Welcome to AI Video System, ${name}!</h1>
            
            <div class="content">
              <p>Thank you for signing up for AI Video System. We're excited to help you create amazing videos with the power of AI!</p>
              
              <div class="highlight">
                <strong>Before you can start creating videos:</strong><br>
                Please verify your email address to activate your account and unlock all features.
              </div>
              
              <p>Click the button below to verify your email address:</p>
              
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
              
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #666; font-size: 14px;">${verificationUrl}</p>
              
              <p><strong>Note:</strong> This verification link will expire in 7 days. If you didn't create an account, you can safely ignore this email.</p>
            </div>
            
            <div class="footer">
              <p>© 2024 AI Video System. All rights reserved.</p>
              <p>If you have any questions, contact us at support@aivideosystem.com</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info('Verification email sent', { 
      to: email, 
      messageId: info.messageId 
    });
    
    return info;
  } catch (error) {
    logger.error('Failed to send verification email:', error);
    throw new Error('Failed to send verification email');
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, name, resetUrl) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"AI Video System" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Reset Your Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .container {
              background-color: #ffffff;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #1a73e8;
              margin-bottom: 10px;
            }
            .title {
              font-size: 20px;
              font-weight: 600;
              margin-bottom: 20px;
              color: #333;
            }
            .content {
              margin-bottom: 30px;
            }
            .button {
              display: inline-block;
              background-color: #ea4335;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              font-weight: 600;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              font-size: 12px;
              color: #666;
            }
            .warning {
              background-color: #fef2f2;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
              border-left: 4px solid #ea4335;
            }
            .security-tip {
              background-color: #e8f0fe;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
              border-left: 4px solid #1a73e8;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">AI Video System</div>
            </div>
            
            <h1 class="title">Password Reset Request</h1>
            
            <div class="content">
              <p>Hi ${name},</p>
              
              <p>We received a request to reset your password for your AI Video System account. If you made this request, please click the button below to reset your password:</p>
              
              <a href="${resetUrl}" class="button">Reset Password</a>
              
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #666; font-size: 14px;">${resetUrl}</p>
              
              <div class="warning">
                <strong>Important:</strong> This password reset link will expire in 1 hour for security reasons.
              </div>
              
              <div class="security-tip">
                <strong>Security Tip:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged. You may want to review your account security if you suspect unauthorized access.
              </div>
            </div>
            
            <div class="footer">
              <p>© 2024 AI Video System. All rights reserved.</p>
              <p>If you have any questions, contact us at support@aivideosystem.com</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info('Password reset email sent', { 
      to: email, 
      messageId: info.messageId 
    });
    
    return info;
  } catch (error) {
    logger.error('Failed to send password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

// Send welcome email
const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"AI Video System" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Welcome to AI Video System!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to AI Video System</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .container {
              background-color: #ffffff;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #1a73e8;
              margin-bottom: 10px;
            }
            .title {
              font-size: 20px;
              font-weight: 600;
              margin-bottom: 20px;
              color: #333;
            }
            .content {
              margin-bottom: 30px;
            }
            .button {
              display: inline-block;
              background-color: #1a73e8;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              font-weight: 600;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              font-size: 12px;
              color: #666;
            }
            .feature-list {
              background-color: #f8f9fa;
              padding: 20px;
              border-radius: 5px;
              margin: 20px 0;
            }
            .feature-item {
              margin-bottom: 10px;
              display: flex;
              align-items: center;
            }
            .feature-icon {
              color: #1a73e8;
              margin-right: 10px;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">AI Video System</div>
            </div>
            
            <h1 class="title">Welcome to AI Video System, ${name}! 🎉</h1>
            
            <div class="content">
              <p>Congratulations! Your account has been successfully verified and you're ready to start creating amazing videos with AI.</p>
              
              <div class="feature-list">
                <h3>What can you do with AI Video System?</h3>
                <div class="feature-item">
                  <span class="feature-icon">✨</span>
                  <span>Create stunning videos from text descriptions</span>
                </div>
                <div class="feature-item">
                  <span class="feature-icon">🎨</span>
                  <span>Build personalized 3D worlds and environments</span>
                </div>
                <div class="feature-item">
                  <span class="feature-icon">🤖</span>
                  <span>Use AI-powered editing and effects</span>
                </div>
                <div class="feature-item">
                  <span class="feature-icon">👥</span>
                  <span>Collaborate with team members in real-time</span>
                </div>
                <div class="feature-item">
                  <span class="feature-icon">📱</span>
                  <span>Export to any format for any platform</span>
                </div>
              </div>
              
              <p>Ready to get started? Click the button below to create your first video:</p>
              
              <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Create Your First Video</a>
              
              <p>Here are some resources to help you get started:</p>
              <ul>
                <li><a href="${process.env.FRONTEND_URL}/tutorials">Video Tutorials</a></li>
                <li><a href="${process.env.FRONTEND_URL}/templates">Template Gallery</a></li>
                <li><a href="${process.env.FRONTEND_URL}/help">Help Center</a></li>
              </ul>
            </div>
            
            <div class="footer">
              <p>© 2024 AI Video System. All rights reserved.</p>
              <p>If you have any questions, reply to this email or contact us at support@aivideosystem.com</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info('Welcome email sent', { 
      to: email, 
      messageId: info.messageId 
    });
    
    return info;
  } catch (error) {
    logger.error('Failed to send welcome email:', error);
    throw new Error('Failed to send welcome email');
  }
};

// Send notification email
const sendNotificationEmail = async (email, subject, content, actionUrl = null, actionText = null) => {
  try {
    const transporter = createTransporter();

    let actionButton = '';
    if (actionUrl && actionText) {
      actionButton = `<a href="${actionUrl}" class="button">${actionText}</a>`;
    }

    const mailOptions = {
      from: `"AI Video System" <${process.env.SMTP_USER}>`,
      to: email,
      subject: subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .container {
              background-color: #ffffff;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #1a73e8;
              margin-bottom: 10px;
            }
            .title {
              font-size: 20px;
              font-weight: 600;
              margin-bottom: 20px;
              color: #333;
            }
            .content {
              margin-bottom: 30px;
            }
            .button {
              display: inline-block;
              background-color: #1a73e8;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              font-weight: 600;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">AI Video System</div>
            </div>
            
            <h1 class="title">${subject}</h1>
            
            <div class="content">
              ${content}
              
              ${actionButton}
            </div>
            
            <div class="footer">
              <p>© 2024 AI Video System. All rights reserved.</p>
              <p>If you have any questions, contact us at support@aivideosystem.com</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info('Notification email sent', { 
      to: email, 
      subject,
      messageId: info.messageId 
    });
    
    return info;
  } catch (error) {
    logger.error('Failed to send notification email:', error);
    throw new Error('Failed to send notification email');
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendNotificationEmail
};