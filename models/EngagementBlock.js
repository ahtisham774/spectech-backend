const mongoose = require("mongoose")

const engagementBlockSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    image: 
      {
        url: String,
      },
    
    callToActionText: {
      type: String,
      maxlength: [100, "CTA text cannot exceed 100 characters"],
    },
    ctaLink: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("EngagementBlock", engagementBlockSchema)
