const express = require("express")
const Business = require("../models/Business")
const Follow = require("../models/Follow")
const Bookmark = require("../models/Bookmark")
const Review = require("../models/Review")
const Notification = require("../models/Notification")
const MessageLog = require("../models/MessageLog")
const BusinessUpdate = require("../models/BusinessUpdate")
const { protect, businessOnly, customerOnly } = require("../middleware/auth")

const router = express.Router()

// @desc    Get message logs for business
// @route   GET /api/social/message-logs
// @access  Private (Business only)
router.get("/message-logs", protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user.id })

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found",
      })
    }

    const { page = 1, limit = 20 } = req.query

    const messageLogs = await MessageLog.find({ business: business._id })
      .populate({
        path: "update",
        select: "title message category createdAt",
      })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await MessageLog.countDocuments({ business: business._id })

    // Transform data to match the required format
    const formattedLogs = messageLogs.map((log) => ({
      id: log._id,
      type: log.update.category,
      title: log.update.title,
      message: log.update.message,
      timestamp: log.createdAt,
      recipientCount: log.recipientCount,
      deliveredCount: log.deliveredCount,
      status: log.status,
    }))

    res.json({
      success: true,
      messageLogs: formattedLogs,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Get message logs error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get business activity feed
// @route   GET /api/social/activity-feed
// @access  Private (Customer only)
router.get("/activity-feed", protect, customerOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query

    // Get businesses user is following
    const followedBusinesses = await Follow.find({
      follower: req.user.id,
      isActive: true,
    }).select("following")

    const businessIds = followedBusinesses.map((follow) => follow.following)

    if (businessIds.length === 0) {
      return res.json({
        success: true,
        activities: [],
        pagination: { current: 1, pages: 0, total: 0 },
      })
    }

    // Get recent activities from followed businesses
    const activities = await BusinessUpdate.find({
      business: { $in: businessIds },
    })
      .populate("business", "name logo")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await BusinessUpdate.countDocuments({
      business: { $in: businessIds },
    })

    res.json({
      success: true,
      activities,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Get activity feed error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get social recommendations
// @route   GET /api/social/recommendations
// @access  Private (Customer only)
router.get("/recommendations", protect, customerOnly, async (req, res) => {
  try {
    const { limit = 10 } = req.query

    // Get businesses user is already following
    const followedBusinesses = await Follow.find({
      follower: req.user.id,
      isActive: true,
    }).select("following")

    const followedIds = followedBusinesses.map((follow) => follow.following)

    // Get businesses user has bookmarked
    const bookmarkedBusinesses = await Bookmark.find({
      user: req.user.id,
    }).select("business")

    const bookmarkedIds = bookmarkedBusinesses.map((bookmark) => bookmark.business)

    // Combine followed and bookmarked IDs to exclude from recommendations
    const excludeIds = [...followedIds, ...bookmarkedIds]

    // Get recommended businesses (high rating, popular, not already followed/bookmarked)
    const recommendations = await Business.find({
      _id: { $nin: excludeIds },
      isApproved: true,
      rating: { $gte: 4.0 },
      followers: { $gte: 10 },
    })
      .select("name logo tagline description followers rating")
      .populate("category", "name")
      .sort({ rating: -1, followers: -1 })
      .limit(Number.parseInt(limit))

    res.json({
      success: true,
      recommendations,
    })
  } catch (error) {
    console.error("Get recommendations error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get user's social stats
// @route   GET /api/social/stats
// @access  Private
router.get("/stats", protect, async (req, res) => {
  try {
    let stats = {}

    if (req.user.userType === "Customer") {
      const followingCount = await Follow.countDocuments({
        follower: req.user.id,
        isActive: true,
      })

      const bookmarkCount = await Bookmark.countDocuments({
        user: req.user.id,
      })

      const reviewCount = await Review.countDocuments({
        reviewer: req.user.id,
        isActive: true,
      })

      stats = {
        following: followingCount,
        bookmarks: bookmarkCount,
        reviews: reviewCount,
      }
    } else if (req.user.userType === "Business") {
      const business = await Business.findOne({ owner: req.user.id })

      if (business) {
        const followerCount = await Follow.countDocuments({
          following: business._id,
          isActive: true,
        })

        const updateCount = await BusinessUpdate.countDocuments({
          business: business._id,
        })

        stats = {
          followers: followerCount,
          rating: business.rating,
          totalReviews: business.totalReviews,
          updates: updateCount,
        }
      }
    }

    res.json({
      success: true,
      stats,
    })
  } catch (error) {
    console.error("Get social stats error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Block/Unblock a follower
// @route   PUT /api/social/followers/:followerId/block
// @access  Private (Business only)
router.put("/followers/:followerId/block", protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user.id })

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found",
      })
    }

    const follow = await Follow.findOne({
      follower: req.params.followerId,
      following: business._id,
    })

    if (!follow) {
      return res.status(404).json({
        success: false,
        message: "Follower not found",
      })
    }

    // Toggle block status
    follow.isActive = !follow.isActive

    // Update business follower count
    if (follow.isActive) {
      business.followers += 1
    } else {
      business.followers = Math.max(0, business.followers - 1)
    }

    await follow.save()
    await business.save()

    res.json({
      success: true,
      message: follow.isActive ? "Follower unblocked" : "Follower blocked",
      isBlocked: !follow.isActive,
    })
  } catch (error) {
    console.error("Block/unblock follower error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

module.exports = router
