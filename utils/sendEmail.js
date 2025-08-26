const nodemailer = require('nodemailer')
const SystemLog = require('../models/SystemLog')

const sendEmail = async options => {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: true,
    service: process.env.EMAIL_SERVICE,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  })
  // const transporter = nodemailer.createTransport({
  //     host: 'smtp.gmail.com',
  //     port: 465,
  //     secure: true,
  //     service: 'gmail',
  //     auth: {
  //         user: "spectech623@gmail.com",
  //         pass: "kgffzqdlfjnmwukn",
  //     },
  // });
  const message = {
    from: `${process.env.FROM_NAME} <${process.env.EMAIL_USER}>`,
    to: options.email,
    subject: options.subject,
    html: options.html
  }

  try {
    const info = await transporter.sendMail(message)
    console.log('Message sent: %s', info.messageId)

    // Log successful send
    await SystemLog.create({
      logType: 'notification_send',
      user: options.userId || null,
      status: 'success',
      details: {
        email: options.email,
        notificationType: options.subject
      },
      description: `Email sent to ${options.email}`
    })
  } catch (error) {
    console.error('Email send error:', error)

    // Log bounce or failure
    await SystemLog.create({
      logType: 'email_bounce',
      user: options.userId || null,
      status: 'failed',
      details: {
        email: options.email,
        reason: error.message || 'Unknown error',
        retryCount: 0 // You can implement retry logic if needed
      },
      description: `Email bounce for ${options.email}`
    })

    throw error
  }
}

const sendContactEmail = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' })
    }

    // Create HTML email template
    const htmlContent = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong> ${message}</p>
      <p><em>Sent from SpecTech Contact Form</em></p>
    `

    // Send email to support@spectech.com
    await sendEmail({
      email: 'ahtishamrajpoot774@gmail.com',
      subject: `Contact Form: ${subject}`,
      html: htmlContent
    })

    // Send confirmation email to user
    const userHtmlContent = `
      <h2>Thank You for Contacting SpecTech</h2>
      <p>Dear ${name},</p>
      <p>We have received your message and will get back to you soon.</p>
      <p><strong>Your Message Details:</strong></p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong> ${message}</p>
      <p>Best regards,<br>SpecTech Team</p>
    `

    await sendEmail({
      email: email,
      subject: 'Thank You for Your Message',
      html: userHtmlContent
    })

    res.status(200).json({ message: 'Email sent successfully' })
  } catch (error) {
    console.error('Error sending email:', error)
    res.status(500).json({ error: 'Failed to send email' })
    // Log bounce or failure
   
  }
}

module.exports = { sendContactEmail, sendEmail }
