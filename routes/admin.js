const express = require("express")
const { body, validationResult } = require("express-validator")
const User = require("../models/User")
const Business = require("../models/Business")
const Category = require("../models/Category")
const ContentReport = require("../models/ContentReport")
const SystemLog = require("../models/SystemLog")
const AdminSettings = require("../models/AdminSettings")
const Review = require("../models/Review")
const Follow = require("../models/Follow")
const Notification = require("../models/Notification")
const NotificationService = require("../utils/notificationService")
const { protect, adminOnly } = require("../middleware/auth")

const router = express.Router()

// Apply admin protection to all routes
router.use(protect, adminOnly)

// @desc    Get dashboard overview stats
// @route   GET /api/admin/dashboard
// @access  Private (Admin only)
router.get("/dashboard", async (req, res) => {
  try {
    // Get current date and 24 hours ago
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Total customers
    const totalCustomers = await User.countDocuments({
      userType: "Customer",
      isActive: true,
    })

    // New signups in last 24 hours
    const newSignups = await User.countDocuments({
      userType: "Customer",
      createdAt: { $gte: yesterday },
    })

    // Total businesses
    const totalBusinesses = await Business.countDocuments({
      isApproved: true,
    })

    // Reported blocks (pending reports)
    const reportedBlocks = await ContentReport.countDocuments({
      status: "pending",
    })

    // Active blocks today (businesses with activity)
    const activeBlocksToday = await Business.countDocuments({
      isApproved: true,
      updatedAt: { $gte: yesterday },
    })

    // Platform health status (mock - in real app would check various services)
    const platformHealth = "Live"

    res.json({
      success: true,
      stats: {
        totalCustomers,
        newSignups,
        totalBusinesses,
        reportedBlocks,
        activeBlocksToday,
        platformHealth,
      },
    })
  } catch (error) {
    console.error("Get admin dashboard error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get all users with pagination and filters
// @route   GET /api/admin/users
// @access  Private (Admin only)
router.get("/users",protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, userType, status, search } = req.query

    const query = {
      // not return req.user.id
      _id: { $ne: req.user.id }
    }

    if (userType && userType !== "all") {
      query.userType = userType
    }

    if (status === "active") {
      query.isActive = true
    } else if (status === "inactive") {
      query.isActive = false
    }

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ]
    }

    const users = await User.find(query)
      .select("firstName lastName email userType isActive createdAt lastLogin")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await User.countDocuments(query)

    res.json({
      success: true,
      users,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Get admin users error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Update user status (activate/deactivate)
// @route   PUT /api/admin/users/:id/status
// @access  Private (Admin only)
router.put("/users/:id/status", async (req, res) => {
  try {
    const { isActive } = req.body
    const user = await User.findById(req.params.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    user.isActive = isActive
    await user.save()

    // Log admin action
    await SystemLog.create({
      logType: "admin_action",
      user: req.user.id,
      description: `${isActive ? "Activated" : "Deactivated"} user ${user.email}`,
      details: {
        targetUserId: user._id,
        action: isActive ? "activate" : "deactivate",
      },
    })

    res.json({
      success: true,
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isActive: user.isActive,
      },
    })
  } catch (error) {
    console.error("Update user status error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin only)
router.delete("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Soft delete - deactivate instead of removing
    user.isActive = false
    await user.save()

    // If business user, also deactivate their business
    if (user.userType === "Business") {
      await Business.updateOne({ owner: user._id }, { isActive: false })
    }

    // Log admin action
    await SystemLog.create({
      logType: "admin_action",
      user: req.user.id,
      description: `Deleted user ${user.email}`,
      details: {
        targetUserId: user._id,
        action: "delete",
      },
    })

    res.json({
      success: true,
      message: "User deleted successfully",
    })
  } catch (error) {
    console.error("Delete user error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get businesses for approval
// @route   GET /api/admin/businesses
// @access  Private (Admin only)
router.get("/businesses", async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "all", category } = req.query

    const query = {}

    if (status === "pending") {
      query.isApproved = false
      query.paymentStatus = "paid"
    } else if (status === "approved") {
      query.isApproved = true
    } else if (status === "rejected") {
      query.rejectedAt = { $exists: true }
    }

    if (category) {
      query.category = category
    }

    const businesses = await Business.find(query)
      .populate("owner", "firstName lastName email")
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Business.countDocuments(query)

    res.json({
      success: true,
      businesses,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Get admin businesses error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Approve business
// @route   PUT /api/admin/businesses/:id/approve
// @access  Private (Admin only)
router.put("/businesses/:id/approve", async (req, res) => {
  try {
    const business = await Business.findById(req.params.id).populate("owner", "firstName lastName email")

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found",
      })
    }

    if (business.paymentStatus !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Business payment not completed",
      })
    }

    business.isApproved = true
    business.approvedAt = new Date()
    business.rejectedAt = undefined
    business.rejectionReason = undefined
    await business.save()

    // Create notification for business owner
    await Notification.create({
      recipient: business.owner._id,
      type: "system_alert",
      title: "Business Approved",
      message: `Congratulations! Your business "${business.name}" has been approved and is now live on our platform.`,
    })

    // Notify users about new business
    await NotificationService.notifyNewBusiness(business._id)

    // Log admin action
    await SystemLog.create({
      logType: "admin_action",
      user: req.user.id,
      business: business._id,
      description: `Approved business ${business.name}`,
      details: {
        action: "approve_business",
        businessId: business._id,
      },
    })

    res.json({
      success: true,
      message: "Business approved successfully",
      business,
    })
  } catch (error) {
    console.error("Approve business error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Reject business
// @route   PUT /api/admin/businesses/:id/reject
// @access  Private (Admin only)
router.put(
  "/businesses/:id/reject",
  [body("reason").notEmpty().withMessage("Rejection reason is required")],
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

      const business = await Business.findById(req.params.id).populate("owner", "firstName lastName email")

      if (!business) {
        return res.status(404).json({
          success: false,
          message: "Business not found",
        })
      }

      business.isApproved = false
      business.rejectedAt = new Date()
      business.rejectionReason = req.body.reason
      await business.save()

      // Create notification for business owner
      await Notification.create({
        recipient: business.owner._id,
        type: "system_alert",
        title: "Business Application Rejected",
        message: `Your business application for "${business.name}" has been rejected. Reason: ${req.body.reason}`,
      })

      // Log admin action
      await SystemLog.create({
        logType: "admin_action",
        user: req.user.id,
        business: business._id,
        description: `Rejected business ${business.name}`,
        details: {
          action: "reject_business",
          businessId: business._id,
          reason: req.body.reason,
        },
      })

      res.json({
        success: true,
        message: "Business rejected successfully",
        business,
      })
    } catch (error) {
      console.error("Reject business error:", error)
      res.status(500).json({
        success: false,
        message: "Server error",
      })
    }
  },
)

// @desc    Delete business
// @route   DELETE /api/admin/businesses/:id
// @access  Private (Admin only)
router.delete("/businesses/:id", async (req, res) => {
  try {
    const business = await Business.findById(req.params.id)

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found",
      })
    }

    // Soft delete - deactivate instead of removing
    business.isActive = false
    business.isApproved = false
    await business.save()

    // Remove all follows
    await Follow.updateMany({ following: business._id }, { isActive: false })

    // Log admin action
    await SystemLog.create({
      logType: "admin_action",
      user: req.user.id,
      business: business._id,
      description: `Deleted business ${business.name}`,
      details: {
        action: "delete_business",
        businessId: business._id,
      },
    })

    res.json({
      success: true,
      message: "Business deleted successfully",
    })
  } catch (error) {
    console.error("Delete business error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get content reports
// @route   GET /api/admin/reports
// @access  Private (Admin only)
router.get("/reports", async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "pending" } = req.query

    const query = {}
    if (status !== "all") {
      query.status = status
    }

    const reports = await ContentReport.find(query)
      .populate("reportedBy", "firstName lastName email")
      .populate("reviewedBy", "firstName lastName")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await ContentReport.countDocuments(query)

    res.json({
      success: true,
      reports,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Get content reports error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Review content report
// @route   PUT /api/admin/reports/:id/review
// @access  Private (Admin only)
router.put(
  "/reports/:id/review",
  [
    body("status").isIn(["reviewed", "resolved", "dismissed"]).withMessage("Invalid status"),
    body("actionTaken")
      .isIn(["none", "warning_sent", "content_removed", "user_suspended", "business_suspended"])
      .withMessage("Invalid action"),
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

      const report = await ContentReport.findById(req.params.id)

      if (!report) {
        return res.status(404).json({
          success: false,
          message: "Report not found",
        })
      }

      report.status = req.body.status
      report.actionTaken = req.body.actionTaken
      report.adminNotes = req.body.adminNotes
      report.reviewedBy = req.user.id
      report.reviewedAt = new Date()
      await report.save()

      // Log admin action
      await SystemLog.create({
        logType: "admin_action",
        user: req.user.id,
        description: `Reviewed content report ${report._id}`,
        details: {
          action: "review_report",
          reportId: report._id,
          status: req.body.status,
          actionTaken: req.body.actionTaken,
        },
      })

      res.json({
        success: true,
        message: "Report reviewed successfully",
        report,
      })
    } catch (error) {
      console.error("Review report error:", error)
      res.status(500).json({
        success: false,
        message: "Server error",
      })
    }
  },
)

// @desc    Get system logs
// @route   GET /api/admin/logs
// @access  Private (Admin only)
router.get("/logs", async (req, res) => {
  try {
    const { page = 1, limit = 50, logType, startDate, endDate } = req.query

    const query = {}

    if (logType && logType !== "all") {
      query.logType = logType
    }

    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) {
        query.createdAt.$gte = new Date(startDate)
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate)
      }
    }

    const logs = await SystemLog.find(query)
      .populate("user", "firstName lastName email")
      .populate("business", "name")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await SystemLog.countDocuments(query)

    res.json({
      success: true,
      logs,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Get system logs error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})


// @desc GET Total Customers, Total Businesses
router.get("/stats/total-users", async (req, res) => {
  try {
    const totalCustomers = await User.countDocuments({ userType: "Customer" })
    const totalBusinesses = await Business.countDocuments({ isApproved: true })

    res.json({
      success: true,
      stats: {
        totalCustomers,
        totalBusinesses,
      },
    })
  } catch (error) {
    console.error("Get total users stats error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get admin settings
// @route   GET /api/admin/settings
// @access  Private (Admin only)
router.get("/settings",protect, async (req, res) => {
  try {
    const settings = await AdminSettings.find({updatedBy: req.user.id}).populate("updatedBy", "firstName lastName")

    // Convert to key-value object
    const settingsObj = {}
    settings.forEach((setting) => {
      settingsObj[setting.settingKey] = {
        value: setting.settingValue,
        description: setting.description,
        updatedBy: setting.updatedBy,
        updatedAt: setting.updatedAt,
      }
    })

    // Add default settings if they don't exist
    const defaultSettings = {
      allowNewUserRegistration: true,
      enableEmailAlerts: true,
      enableSecurityAlerts: true,
      enableMarketingEmails: false,
      termsAndConditionsLastUpdated: "June 6th, 2025",
      privacyPolicyLastUpdated: "June 6th, 2025",
    }

    Object.keys(defaultSettings).forEach((key) => {
      if (!settingsObj[key]) {
        settingsObj[key] = {
          value: defaultSettings[key],
          description: `Default ${key} setting`,
          updatedBy: null,
          updatedAt: new Date(),
        }
      }
    })

    res.json({
      success: true,
      settings: settingsObj,
    })
  } catch (error) {
    console.error("Get admin settings error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Update admin settings
// @route   PUT /api/admin/settings
// @access  Private (Admin only)
router.put("/settings", async (req, res) => {
  try {
    const updates = req.body

    for (const [key, value] of Object.entries(updates)) {
      await AdminSettings.findOneAndUpdate(
        { settingKey: key },
        {
          settingKey: key,
          settingValue: value,
          updatedBy: req.user.id,
        },
        { upsert: true, new: true },
      )
    }

    // Log admin action
    await SystemLog.create({
      logType: "admin_action",
      user: req.user.id,
      description: "Updated admin settings",
      details: {
        action: "update_settings",
        updatedKeys: Object.keys(updates),
      },
    })

    res.json({
      success: true,
      message: "Settings updated successfully",
    })
  } catch (error) {
    console.error("Update admin settings error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get admin profile
// @route   GET /api/admin/profile
// @access  Private (Admin only)
router.get("/profile", async (req, res) => {
  try {
    const admin = await User.findById(req.user.id).select("-password")

    // Get admin stats
    const totalCustomers = await User.countDocuments({ userType: "Customer" })
    const totalBusinesses = await Business.countDocuments({ isApproved: true })

    res.json({
      success: true,
      admin: {
        ...admin.toObject(),
        stats: {
          totalCustomers,
          totalBusinesses,
        },
      },
    })
  } catch (error) {
    console.error("Get admin profile error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Export users list
// @route   GET /api/admin/export/users
// @access  Private (Admin only)
router.get("/export/users", async (req, res) => {
  try {
    const { userType, status } = req.query

    const query = {}
    if (userType && userType !== "all") {
      query.userType = userType
    }
    if (status === "active") {
      query.isActive = true
    } else if (status === "inactive") {
      query.isActive = false
    }

    const users = await User.find(query)
      .select("firstName lastName email userType isActive createdAt lastLogin")
      .sort({ createdAt: -1 })

    // Convert to CSV format
    const csvHeader = "ID,First Name,Last Name,Email,User Type,Status,Created At,Last Login\n"
    const csvData = users
      .map((user) => {
        return [
          user._id,
          user.firstName,
          user.lastName,
          user.email,
          user.userType,
          user.isActive ? "Active" : "Inactive",
          user.createdAt.toISOString(),
          user.lastLogin ? user.lastLogin.toISOString() : "Never",
        ].join(",")
      })
      .join("\n")

    res.setHeader("Content-Type", "text/csv")
    res.setHeader("Content-Disposition", 'attachment; filename="users_export.csv"')
    res.send(csvHeader + csvData)
  } catch (error) {
    console.error("Export users error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

module.exports = router
