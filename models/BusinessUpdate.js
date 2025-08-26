const mongoose = require("mongoose")
const { logNotificationSend } = require("../middleware/systemLogger")

const businessUpdateSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
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
    category: {
      type: String,
      enum: ['promotion', 'new_product', 'announcement', 'event',"new_business","general"],
      required: true,
    },
    sentToFollowers: {
      type: Boolean,
      default: false,
    },
    followerCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
)

businessUpdateSchema.index({ business: 1, createdAt: -1 })


module.exports = mongoose.model("BusinessUpdate", businessUpdateSchema)
