const mongoose = require("mongoose")

const businessSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Business name is required"],
      trim: true,
      maxlength: [100, "Business name cannot exceed 100 characters"],
    },
    logo: {
      type: String,
      default: "",
    },
    coverPhoto: {
      type: String,
      default: "",
    },
    tagline: {
      type: String,
      maxlength: [150, "Tagline cannot exceed 150 characters"],
    },
    missionStatement: {
      type: String,
      maxlength: [500, "Mission statement cannot exceed 500 characters"],
    },
    description: {
      type: String,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    location: {
      type: String,
      maxlength: [200, "Location cannot exceed 200 characters"],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    socialMedia: {
      instagram: String,
      facebook: String,
      linkedin: String,
      twitter: String,
    },
    designPreferences: {
      color: {
        type: String,
        default: "#3B82F6",
      },
      font: {
        type: String,
        default: "Inter",
      },
    },
    storeLink: {
      type: String,
      default: "",
    },
    followers: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    paymentId: String,
    approvedAt: Date,
    rejectedAt: Date,
    rejectionReason: String,
  },
  {
    timestamps: true,
  },
)

// Index for efficient queries
businessSchema.index({ owner: 1 })
businessSchema.index({ category: 1, isApproved: 1 })
businessSchema.index({ isApproved: 1, rating: -1 })
businessSchema.index({ isApproved: 1, followers: -1 })

module.exports = mongoose.model("Business", businessSchema)
