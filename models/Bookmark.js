const mongoose = require("mongoose")

const bookmarkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
  },
  {
    timestamps: true,
  },
)

// Compound index to prevent duplicate bookmarks
bookmarkSchema.index({ user: 1, business: 1 }, { unique: true })

module.exports = mongoose.model("Bookmark", bookmarkSchema)
