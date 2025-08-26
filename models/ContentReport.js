const mongoose = require("mongoose")

const contentReportSchema = new mongoose.Schema(
  {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reportedContent: {
      contentType: {
        type: String,
        enum: ["business", "review", "product", "user"],
        required: true,
      },
      contentId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
    },
    reason: {
      type: String,
      enum: ["inappropriate_content", "spam", "harassment", "fake_information", "copyright_violation", "other"],
      required: true,
    },
    description: {
      type: String,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved", "dismissed"],
      default: "pending",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: Date,
    adminNotes: {
      type: String,
      maxlength: [1000, "Admin notes cannot exceed 1000 characters"],
    },
    actionTaken: {
      type: String,
      enum: ["none", "warning_sent", "content_removed", "user_suspended", "business_suspended"],
      default: "none",
    },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("ContentReport", contentReportSchema)
