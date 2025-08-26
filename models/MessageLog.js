const mongoose = require("mongoose")

const messageLogSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    update: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessUpdate",
      required: true,
    },
    recipientCount: {
      type: Number,
      required: true,
    },
    deliveredCount: {
      type: Number,
      default: 0,
    },
    openedCount: {
      type: Number,
      default: 0,
    },
    clickedCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "failed"],
      default: "sent",
    },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("MessageLog", messageLogSchema)
