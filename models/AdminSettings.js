const mongoose = require("mongoose")

const adminSettingsSchema = new mongoose.Schema(
  {
    settingKey: {
      type: String,
      required: true,
      unique: true,
    },
    settingValue: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    description: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("AdminSettings", adminSettingsSchema)
