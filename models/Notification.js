const mongoose = require("mongoose")
const { logNotificationSend } = require("../middleware/systemLogger")

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
    },
    type: {
      type: String,
      enum: [
        "new_business_joined",
        "new_product",
        "promotion",
        "business_update",
        "new_follower",
        "new_review",
        "system_alert",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    message: {
      type: String,
      required: true,
      maxlength: [500, "Message cannot exceed 500 characters"],
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
)

// Index for efficient queries
notificationSchema.index({ recipient: 1, createdAt: -1 })
notificationSchema.index({ recipient: 1, isRead: 1 })



notificationSchema.post('save', function (doc) {
  logNotificationSend({
    recipient: doc.recipient,
    sender: doc.sender,
    business: doc.business,
    type: doc.type,
    title: doc.title,
    message: doc.message,
  })
})

module.exports = mongoose.model("Notification", notificationSchema)
