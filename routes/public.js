const express = require("express")
const Business = require("../models/Business")
const Category = require("../models/Category")
const Review = require("../models/Review")
const Follow = require("../models/Follow")
const Bookmark = require("../models/Bookmark")
const { protect, customerOnly } = require("../middleware/auth")

const router = express.Router()

// @desc    Get all categories with active business counts
// @route   GET /api/public/categories
// @access  Public
router.get("/categories", async (req, res) => {
  try {
    const categories = await Category.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: "businesses",
          localField: "_id",
          foreignField: "category",
          as: "businesses",
        },
      },
      {
        $addFields: {
          activeBusinessCount: {
            $size: {
              $filter: {
                input: "$businesses",
                cond: { $eq: ["$$this.isApproved", true] },
              },
            },
          },
        },
      },
      {
        $project: {
          name: 1,
          description: 1,
          activeBusinessCount: 1,
          createdAt: 1,
        },
      },
      { $sort: { name: 1 } },
    ])

    res.json({
      success: true,
      categories,
    })
  } catch (error) {
    console.error("Get public categories error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get businesses by category (public)
// @route   GET /api/public/categories/:categoryId/businesses
// @access  Public
router.get("/categories/:categoryId/businesses", async (req, res) => {
  try {
    const { page = 1, limit = 20, sort = "recent" } = req.query

    let sortQuery = { createdAt: -1 }
    if (sort === "popular") {
      sortQuery = { followers: -1 }
    } else if (sort === "rating") {
      sortQuery = { rating: -1 }
    }

    const businesses = await Business.find({
      category: req.params.categoryId,
      isApproved: true,
    })
      .select("name logo tagline description followers rating")
      .populate("category", "name")
      .sort(sortQuery)
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Business.countDocuments({
      category: req.params.categoryId,
      isApproved: true,
    })

    const category = await Category.findById(req.params.categoryId)

    res.json({
      success: true,
      category,
      businesses,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Get businesses by category error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get business details with full information
// @route   GET /api/public/businesses/:id
// @access  Public
router.get("/businesses/:id", async (req, res) => {
  try {
    const business = await Business.findOne({
      _id: req.params.id,
      isApproved: true,
    })
      .populate("category", "name")
      .populate("owner", "firstName lastName")

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found",
      })
    }

    // Get recent reviews with user details
    const reviews = await Review.find({
      business: business._id,
      isActive: true,
    })
      .populate("reviewer", "firstName lastName profileImage")
      .sort({ createdAt: -1 })
      .limit(10)

    // Get rating distribution
    const ratingStats = await Review.aggregate([
      { $match: { business: business._id, isActive: true } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ])

    // Calculate rating distribution percentages
    const totalReviews = business.totalReviews
    const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => {
      const stat = ratingStats.find((s) => s._id === rating)
      return {
        rating,
        count: stat ? stat.count : 0,
        percentage: totalReviews > 0 ? Math.round(((stat ? stat.count : 0) / totalReviews) * 100) : 0,
      }
    })

    res.json({
      success: true,
      business: {
        ...business.toObject(),
        recentReviews: reviews,
        ratingDistribution,
      },
    })
  } catch (error) {
    console.error("Get public business error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Search businesses
// @route   GET /api/public/search
// @access  Public
router.get("/search", async (req, res) => {
  try {
    const { q, category, page = 1, limit = 20, sort = "relevance" } = req.query

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      })
    }

    const query = {
      isApproved: true,
      $or: [
        { name: { $regex: q, $options: "i" } },
        { tagline: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ],
    }

    if (category) {
      query.category = category
    }

    let sortQuery = { score: { $meta: "textScore" } }
    if (sort === "popular") {
      sortQuery = { followers: -1 }
    } else if (sort === "rating") {
      sortQuery = { rating: -1 }
    } else if (sort === "recent") {
      sortQuery = { createdAt: -1 }
    }

    const businesses = await Business.find(query)
      .select("name logo tagline description followers rating")
      .populate("category", "name")
      .sort(sortQuery)
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Business.countDocuments(query)

    res.json({
      success: true,
      query: q,
      businesses,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Search businesses error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get trending businesses
// @route   GET /api/public/trending
// @access  Public
router.get("/trending", async (req, res) => {
  try {
    const { limit = 10 } = req.query

    // Get businesses with highest follower growth in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const trendingBusinesses = await Business.aggregate([
      { $match: { isApproved: true } },
      {
        $lookup: {
          from: "follows",
          let: { businessId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$following", "$$businessId"] },
                isActive: true,
                createdAt: { $gte: sevenDaysAgo },
              },
            },
          ],
          as: "recentFollows",
        },
      },
      {
        $addFields: {
          recentFollowCount: { $size: "$recentFollows" },
        },
      },
      { $sort: { recentFollowCount: -1, followers: -1 } },
      { $limit: Number.parseInt(limit) },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      {
        $project: {
          name: 1,
          logo: 1,
          tagline: 1,
          description: 1,
          followers: 1,
          rating: 1,
          "category.name": 1,
          recentFollowCount: 1,
        },
      },
    ])

    res.json({
      success: true,
      businesses: trendingBusinesses,
    })
  } catch (error) {
    console.error("Get trending businesses error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get featured businesses (highest rated)
// @route   GET /api/public/featured
// @access  Public
router.get("/featured", async (req, res) => {
  try {
    const { limit = 10 } = req.query

    const featuredBusinesses = await Business.find({
      isApproved: true,
      rating: { $gte: 4.0 },
      totalReviews: { $gte: 5 },
    })
      .select("name logo tagline description followers rating totalReviews")
      .populate("category", "name")
      .sort({ rating: -1, totalReviews: -1 })
      .limit(Number.parseInt(limit))

    res.json({
      success: true,
      businesses: featuredBusinesses,
    })
  } catch (error) {
    console.error("Get featured businesses error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Check if user is following a business
// @route   GET /api/public/businesses/:id/follow-status
// @access  Private
router.get("/businesses/:id/follow-status", protect, customerOnly, async (req, res) => {
  try {
    const follow = await Follow.findOne({
      follower: req.user.id,
      following: req.params.id,
      isActive: true,
    })

    const bookmark = await Bookmark.findOne({
      user: req.user.id,
      business: req.params.id,
    })

    res.json({
      success: true,
      isFollowing: !!follow,
      isBookmarked: !!bookmark,
    })
  } catch (error) {
    console.error("Get follow status error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get business statistics (public)
// @route   GET /api/public/businesses/:id/stats
// @access  Public
router.get("/businesses/:id/stats", async (req, res) => {
  try {
    const business = await Business.findOne({
      _id: req.params.id,
      isApproved: true,
    })

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found",
      })
    }

    // Get follower growth (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const followerGrowth = await Follow.countDocuments({
      following: business._id,
      isActive: true,
      createdAt: { $gte: thirtyDaysAgo },
    })

    // Get rating distribution
    const ratingStats = await Review.aggregate([
      { $match: { business: business._id, isActive: true } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ])

    const stats = {
      followers: business.followers,
      rating: business.rating,
      totalReviews: business.totalReviews,
      followerGrowth,
      ratingDistribution: ratingStats,
      joinedDate: business.createdAt,
    }

    res.json({
      success: true,
      stats,
    })
  } catch (error) {
    console.error("Get business public stats error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

module.exports = router
