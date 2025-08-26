const express = require("express")
const { body, validationResult } = require("express-validator")
const crypto = require("crypto")
const User = require("../models/User")
const { generateToken, generateResetToken } = require("../utils/generateToken")

const { protect } = require("../middleware/auth")
const { logLoginAttempt } = require("../middleware/systemLogger")
const { sendEmail } = require("../utils/sendEmail")

const router = express.Router()

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post(
  "/register",
  [
    body("firstName").trim().notEmpty().withMessage("First name is required"),
    body("lastName").trim().notEmpty().withMessage("Last name is required"),
    body("email").isEmail().withMessage("Please enter a valid email"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("userType").isIn(["Customer", "Business"]).withMessage("User type must be Customer or Business"), 
    body("businessName").custom((value, { req }) => {
      if (req.body.userType === "Business" && (!value || value.trim().length === 0)) {
        throw new Error("Business name is required for Business users")
      }
      if (value && value.length > 100) {
        throw new Error("Business name cannot exceed 100 characters")
      }
      return true
    }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const { firstName, businessName, lastName, email, password, userType } = req.body

      // Check if user already exists
      const existingUser = await User.findOne({ email })
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "User already exists with this email",
        })
      }

       let userData = {
        firstName,
        lastName,
        email,
        password,
        userType,
      }

      // Add business-specific fields if user type is Business
      if (userType === "Business") {
        userData.businessName = businessName
      }


      // Create user
      const user = await User.create(userData)

      // Generate token
      const token = generateToken(user._id)

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          businessName: user.businessName,
          userType: user.userType,
          profileImage: user.profileImage,
          location: user.location,
          notificationPreferences: user.notificationPreferences,
        },
      })
    } catch (error) {
      console.error("Registration error:", error)
      res.status(500).json({
        success: false,
        message: "Server error during registration",
      })
    }
  },
)

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post(
  "/login",
  logLoginAttempt,
  [
    body("email").isEmail().withMessage("Please enter a valid email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const { email, password } = req.body

      // Check for user and include password
      const user = await User.findOne({ email }).select("+password")

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        })
      }

      // Check if password matches
      const isMatch = await user.matchPassword(password)

      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        })
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: "Account has been deactivated",
        })
      }

      // Update last login
      user.lastLogin = new Date()
      await user.save()

      // Generate token
      const token = generateToken(user._id)

      res.json({
        success: true,
        message: "Login successful",
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          userType: user.userType,
          profileImage: user.profileImage,
          location: user.location,
          notificationPreferences: user.notificationPreferences,
          lastLogin: user.lastLogin,
        },
      })
    } catch (error) {
      console.error("Login error:", error)
      res.status(500).json({
        success: false,
        message: "Server error during login",
      })
    }
  },
)

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
router.post(
  "/forgot-password",
  [body("email").isEmail().withMessage("Please enter a valid email")],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const { email } = req.body

      const user = await User.findOne({ email })

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "No user found with this email",
        })
      }

      // Get reset token
      const resetToken = user.getResetPasswordToken()

      await user.save({ validateBeforeSave: false })

      // Create reset url
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`

      const message = `
        <h1>Password Reset Request</h1>
        <p>You have requested a password reset for your SpecTech account.</p>
        <p>Please click the link below to reset your password:</p>
        <a href="${resetUrl}" clicktracking=off>${resetUrl}</a>
        <p>This link will expire in 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      `

      try {
        await sendEmail({
          email: user.email,
          subject: "SpecTech Password Reset Request",
          html: message,
        })

        res.status(200).json({
          success: true,
          message: "Password reset email sent",
        })
      } catch (err) {
        console.error("Email send error:", err)
        user.resetPasswordToken = undefined
        user.resetPasswordExpire = undefined

        await user.save({ validateBeforeSave: false })

        return res.status(500).json({
          success: false,
          message: "Email could not be sent",
        })
      }
    } catch (error) {
      console.error("Forgot password error:", error)
      res.status(500).json({
        success: false,
        message: "Server error",
      })
    }
  },
)

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:resettoken
// @access  Public
router.put(
  "/reset-password/:resettoken",
  [body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters")],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      // Get hashed token
      const resetPasswordToken = crypto.createHash("sha256").update(req.params.resettoken).digest("hex")

      const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() },
      })

      if (!user) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired reset token",
        })
      }

      // Set new password
      user.password = req.body.password
      user.resetPasswordToken = undefined
      user.resetPasswordExpire = undefined
      await user.save()

      // Generate token
      const token = generateToken(user._id)

      res.status(200).json({
        success: true,
        message: "Password reset successful",
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          userType: user.userType,
        },
      })
    } catch (error) {
      console.error("Reset password error:", error)
      res.status(500).json({
        success: false,
        message: "Server error",
      })
    }
  },
)

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)

    res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userType: user.userType,
        profileImage: user.profileImage,
        location: user.location,
        notificationPreferences: user.notificationPreferences,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    console.error("Get user error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
router.put(
  "/profile",
  protect,
  [
    body("firstName").optional().trim().notEmpty().withMessage("First name cannot be empty"),
    body("lastName").optional().trim().notEmpty().withMessage("Last name cannot be empty"),
    body("email").optional().isEmail().withMessage("Please enter a valid email"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const user = await User.findById(req.user.id)

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        })
      }

      // Update fields
      const fieldsToUpdate = ["firstName", "lastName", "email", "profileImage", "location", "notificationPreferences"]

      fieldsToUpdate.forEach((field) => {
        if (req.body[field] !== undefined) {
          user[field] = req.body[field]
        }
      })

      await user.save()

      res.json({
        success: true,
        message: "Profile updated successfully",
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          userType: user.userType,
          profileImage: user.profileImage,
          location: user.location,
          notificationPreferences: user.notificationPreferences,
        },
      })
    } catch (error) {
      console.error("Update profile error:", error)
      res.status(500).json({
        success: false,
        message: "Server error",
      })
    }
  },
)

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
router.put(
  "/change-password",
  protect,
  [
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const user = await User.findById(req.user.id).select("+password")

      // Check current password
      const isMatch = await user.matchPassword(req.body.currentPassword)

      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect",
        })
      }

      user.password = req.body.newPassword
      await user.save()

      res.json({
        success: true,
        message: "Password changed successfully",
      })
    } catch (error) {
      console.error("Change password error:", error)
      res.status(500).json({
        success: false,
        message: "Server error",
      })
    }
  },
)

module.exports = router
