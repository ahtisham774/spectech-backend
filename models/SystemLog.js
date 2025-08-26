const mongoose = require("mongoose")

const systemLogSchema = new mongoose.Schema(
  {
    logType: {
      type: String,
      enum: ["login_attempt", "block_update", "notification_send", "email_bounce", "admin_action"],
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
    },
    ipAddress: String,
    userAgent: String,
    status: {
      type: String,
      enum: ["success", "failed", "pending"],
      default: "success",
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    description: String,
  },
  {
    timestamps: true,
  },
)

// Index for efficient queries
systemLogSchema.index({ logType: 1, createdAt: -1 })
systemLogSchema.index({ user: 1, createdAt: -1 })
systemLogSchema.index({ createdAt: -1 })

module.exports = mongoose.model("SystemLog", systemLogSchema)
