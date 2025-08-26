const SystemLog = require("../models/SystemLog")

// Middleware to log login attempts
const logLoginAttempt = async (req, res, next) => {
  const originalSend = res.send

  res.send = function (data) {
    // Log after response is sent
    setImmediate(async () => {
      try {
        const responseData = typeof data === "string" ? JSON.parse(data) : data

        await SystemLog.create({
          logType: "login_attempt",
          user: responseData.user ? responseData.user.id : null,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get("User-Agent"),
          status: responseData.success ? "success" : "failed",
          details: {
            email: req.body.email,
            timestamp: new Date(),
          },
        })
      } catch (error) {
        console.error("Error logging login attempt:", error)
      }
    })

    originalSend.call(this, data)
  }

  next()
}

// Middleware to log business block updates
const logBlockUpdate = async (businessId, action, performedBy) => {
  try {
    await SystemLog.create({
      logType: "block_update",
      user: performedBy,
      business: businessId,
      description: `Business block ${action}`,
      details: {
        action,
        timestamp: new Date(),
      },
    })
  } catch (error) {
    console.error("Error logging block update:", error)
  }
}

// Middleware to log notification sends
const logNotificationSend = async (notificationData) => {
  try {
    await SystemLog.create({
      logType: "notification_send",
      user: notificationData.sender,
      business: notificationData.business,
      status: "success",
      details: {
        type: notificationData.type,
        recipientCount: Array.isArray(notificationData.recipient) ? notificationData.recipient.length : 1,
        timestamp: new Date(),
      },
    })
  } catch (error) {
    console.error("Error logging notification send:", error)
  }
}

// Middleware to log email bounces
const logEmailBounce = async (email, reason, retryCount = 0) => {
  try {
    await SystemLog.create({
      logType: "email_bounce",
      details: {
        email,
        reason,
        retryCount,
        timestamp: new Date(),
      },
    })
  } catch (error) {
    console.error("Error logging email bounce:", error)
  }
}

module.exports = {
  logLoginAttempt,
  logBlockUpdate,
  logNotificationSend,
  logEmailBounce,
}
