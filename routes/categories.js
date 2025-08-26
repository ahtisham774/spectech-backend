const express = require("express")
const Category = require("../models/Category")
const Business = require("../models/Business")

const router = express.Router()

// @desc    Get all categories with business counts
// @route   GET /api/categories
// @access  Public
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 })

    // Update business counts
    for (const category of categories) {
      const count = await Business.countDocuments({
        category: category._id,
        isApproved: true,
      })
      category.businessCount = count
      await category.save()
    }

    res.json({
      success: true,
      categories,
    })
  } catch (error) {
    console.error("Get categories error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get businesses by category
// @route   GET /api/categories/:categoryId/businesses
// @access  Public
router.get("/:categoryId/businesses", async (req, res) => {
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
      .sort(sortQuery)
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Business.countDocuments({
      category: req.params.categoryId,
      isApproved: true,
    })

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
    console.error("Get businesses by category error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

module.exports = router
