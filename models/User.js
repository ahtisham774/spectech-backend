const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email"],
    },
      businessName: {
      type: String,
      trim: true,
      maxlength: [100, "Business name cannot exceed 100 characters"],
      validate: {
        validator: function (v) {
          // Business name is required only for Business users
          if (this.userType === "Business") {
            return v && v.length > 0
          }
          return true
        },
        message: "Business name is required for Business users",
      },
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    userType: {
      type: String,
      enum: ["Customer", "Business", "Admin"],
      required: [true, "User type is required"],
    },
    profileImage: {
      type: String,
      default: "",
    },
    location: {
      country: {
        type: String,
        default: "",
      },
      city: {
        type: String,
        default: "",
      },
    },
    notificationPreferences: {
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      inPlatformAlerts: {
        type: Boolean,
        default: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    lastLogin: Date,
  },
  {
    timestamps: true,
  },
)

// Encrypt password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next()
  }

  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
})

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password)
}

// Generate and hash password token
userSchema.methods.getResetPasswordToken = function () {
  const crypto = require("crypto")

  // Generate token
  const resetToken = crypto.randomBytes(20).toString("hex")

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex")

  // Set expire
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000 // 10 minutes

  return resetToken
}

module.exports = mongoose.model("User", userSchema)
