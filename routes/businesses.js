const express = require('express')
const { body, validationResult } = require('express-validator')
const Business = require('../models/Business')
const Product = require('../models/Product')
const EngagementBlock = require('../models/EngagementBlock')
const Review = require('../models/Review')
const BusinessUpdate = require('../models/BusinessUpdate')
const Follow = require('../models/Follow')
const Notification = require('../models/Notification')

const Category = require('../models/Category')
const mongoose = require('mongoose') // Import mongoose
const { protect, businessOnly, customerOnly } = require('../middleware/auth')
const { logNotificationSend, logBlockUpdate } = require('../middleware/systemLogger')

const router = express.Router()

// @desc    Create business profile
// @route   POST /api/businesses
// @access  Private (Business users only)
router.post(
  '/',
  protect,
  businessOnly,
  [
    body('name').trim().notEmpty().withMessage('Business name is required'),
    body('category').isMongoId().withMessage('Valid category is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      // // Check if user already has a business
      // const existingBusiness = await Business.findOne({ owner: req.user.id })
      // if (existingBusiness) {
      //   return res.status(400).json({
      //     success: false,
      //     message: "User already has a business profile",
      //   })
      // }

      // Verify category exists
      const category = await Category.findById(req.body.category)
      if (!category) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category'
        })
      }

      const business = await Business.create({
        owner: req.user.id,
        ...req.body
      })

      await logBlockUpdate(business._id, 'created', req.user.id)

      await business.populate('category', 'name')

      res.status(201).json({
        success: true,
        message: 'Business profile created successfully',
        business
      })
    } catch (error) {
      console.error('Create business error:', error)
      res.status(500).json({
        success: false,
        message: 'Server error'
      })
    }
  }
)

// @desc Create Publish Business
// @route POST /api/businesses/:id/publish
// @access Private (Business users only)
router.post('/:id/publish', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({
      _id: req.params.id,
      owner: req.user.id
    })

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found or unauthorized'
      })
    }

    // Update business status to "published"
    business.status = 'published'
    await business.save()
    await logBlockUpdate(business._id, 'published', req.user.id)

    res.json({
      success: true,
      message: 'Business published successfully',
      business
    })
  } catch (error) {
    console.error('Publish business error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Get current user's business
// @route   GET /api/businesses/my-business
// @access  Private (Business users only)
router.get('/my-business', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.find({ owner: req.user.id }).populate(
      'category',
      'name'
    )

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      })
    }

    res.json({
      success: true,
      business
    })
  } catch (error) {
    console.error('Get my business error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Get business performance stats
// @route   GET /api/businesses/:id/stats
// @access  Private (Business owner only)
router.get('/stats', protect, businessOnly, async (req, res) => {
  try {
    // Find all businesses owned by the user
    console.log('User', req.user)
    const businesses = await Business.find({
      owner: req.user.id,
      isActive: true
    })

    if (!businesses || businesses.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No businesses found for the user'
      })
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // Fetch stats for each business
    const statsPromises = businesses.map(async business => {
      // Get follower growth (last 7 days)
      const newFollowers = await Follow.countDocuments({
        following: business._id,
        isActive: true,
        createdAt: { $gte: sevenDaysAgo }
      })

      // Get total products
      const totalProducts = await Product.countDocuments({
        business: business._id,
        isActive: true
      })

      // Get recent updates
      const recentUpdates = await BusinessUpdate.find({
        business: business._id
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .select('title message category createdAt')

      return {
        businessId: business._id,
        businessName: business.name,
        totalBlockVisits: Math.floor(Math.random() * 15000) + 5000, // Mock data (replace with real analytics)
        averageSessionTime: '3m 26s', // Mock data (replace with real analytics)
        followerGrowth: newFollowers,
        totalFollowers: business.followers,
        totalProducts,
        rating: business.rating || 0,
        totalReviews: business.totalReviews || 0,
        recentUpdates: recentUpdates.map(update => ({
          id: update._id,
          title: update.title,
          message: update.message,
          category: update.category,
          createdAt: update.createdAt
        }))
      }
    })

    const stats = await Promise.all(statsPromises)

    res.json({
      success: true,
      stats
    })
  } catch (error) {
    console.error('Get business stats error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Update business profile
// @route   PUT /api/businesses/:id
// @access  Private (Business owner only)
router.put('/:id', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({
      _id: req.params.id,
      owner: req.user.id
    })

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found or unauthorized'
      })
    }

    // Update fields
    const allowedFields = [
      'name',
      'logo',
      'coverPhoto',
      'tagline',
      'missionStatement',
      'description',
      'location',
      'category',
      'socialMedia',
      'designPreferences',
      'storeLink'
    ]

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        business[field] = req.body[field]
      }
    })

    await business.save()
    await business.populate('category', 'name')
    await logBlockUpdate(business._id, 'updated', req.user.id)

    res.json({
      success: true,
      message: 'Business updated successfully',
      business
    })
  } catch (error) {
    console.error('Update business error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Get business by ID (public view)
// @route   GET /api/businesses/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const business = await Business.findOne({
      _id: req.params.id,
      isApproved: true
    })
      .populate('category', 'name')
      .populate('owner', 'firstName lastName')

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      })
    }

    // Get products and engagement blocks
    const products = await Product.find({
      business: business._id,
      isActive: true
    })

    const engagementBlocks = await EngagementBlock.findOne({
      business: business._id,
      isActive: true
    })

    // Get recent reviews
    const reviews = await Review.find({
      business: business._id,
      isActive: true
    })
      .populate('reviewer', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .limit(6)

    const exploreMoreBusiness = await Business.find({
      _id: { $ne: business._id },
      category: business.category,
      isApproved: true
    })
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .limit(6)

    res.json({
      success: true,
      business: {
        ...business.toObject(),
        products,
        engagementBlocks,
        recentReviews: reviews,
        exploreMoreBusiness
      }
    })
  } catch (error) {
    console.error('Get business error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// api to get the prview of business of current user with products, enagements , followers
// @desc    Get business preview for current user
// @route GET /api/businesses/:id/preview
// @access Private (BBusiness owner only)
router.get('/:id/preview', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({
      _id: req.params.id,
      owner: req.user.id
    })
      .populate('category', 'name')
      .populate('owner', 'firstName lastName')

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found or unauthorized'
      })
    }

    // Get products and engagement blocks
    const products = await Product.find({
      business: business._id,
      isActive: true
    })

    const engagementBlocks = await EngagementBlock.findOne({
      business: business._id,
      isActive: true
    })

    const followers = await Follow.countDocuments({
      following: business._id
    })

    res.json({
      success: true,
      business: {
        ...business.toObject(),
        products,
        engagementBlocks,
        followers
      }
    })
  } catch (error) {
    console.error('Get business preview error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Get all approved businesses
// @route   GET /api/businesses
// @access  Public
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      location,
      name,
      price,
      ratings,
      sort = 'recent'
    } = req.query

    const query = { isApproved: true }
    if (category) {
      query.category = category
    }
    if (location) {
      query.location = { $regex: location, $options: 'i' }
    }
    if (name) {
      query.name = { $regex: name, $options: 'i' }
    }
    if (price) {
      query.price = { $lte: price }
    }
    if (ratings) {
      query.ratings = { $gte: ratings }
    }

    let sortQuery = { createdAt: -1 }
    if (sort === 'popular') {
      sortQuery = { followers: -1 }
    } else if (sort === 'rating') {
      sortQuery = { rating: -1 }
    }

    const businesses = await Business.find(query)
      .select('name logo tagline description followers rating')
      .populate('category', 'name')
      .sort(sortQuery)
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Business.countDocuments(query)

    res.json({
      success: true,
      businesses,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    })
  } catch (error) {
    console.error('Get businesses error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Add product to business
// @route   POST /api/businesses/:id/products
// @access  Private (Business owner only)
router.post('/:id/products', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({
      _id: req.params.id,
      owner: req.user.id
    })

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found or unauthorized'
      })
    }

    const product = await Product.create({
      business: business._id,
      ...req.body
    })

    await logBlockUpdate(business._id, 'product_added', req.user.id)

    res.status(201).json({
      success: true,
      message: 'Product added successfully',
      product
    })
  } catch (error) {
    console.error('Add product error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Get business products
// @route   GET /api/businesses/:id/products
// @access  Public
router.get('/:id/products', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query

    const products = await Product.find({
      business: req.params.id,
      isActive: true
    })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Product.countDocuments({
      business: req.params.id,
      isActive: true
    })

    res.json({
      success: true,
      products,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    })
  } catch (error) {
    console.error('Get products error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Update product
// @route   PUT /api/businesses/:businessId/products/:productId
// @access  Private (Business owner only)
router.put(
  '/:businessId/products/:productId',
  protect,
  businessOnly,
  async (req, res) => {
    try {
      const business = await Business.findOne({
        _id: req.params.businessId,
        owner: req.user.id
      })

      if (!business) {
        return res.status(404).json({
          success: false,
          message: 'Business not found or unauthorized'
        })
      }

      const product = await Product.findOneAndUpdate(
        { _id: req.params.productId, business: business._id },
        req.body,
        {
          new: true
        }
      )

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        })
      }

      await logBlockUpdate(business._id, 'product_updated', req.user.id)

      res.json({
        success: true,
        message: 'Product updated successfully',
        product
      })
    } catch (error) {
      console.error('Update product error:', error)
      res.status(500).json({
        success: false,
        message: 'Server error'
      })
    }
  }
)

// @desc    Delete product
// @route   DELETE /api/businesses/:businessId/products/:productId
// @access  Private (Business owner only)
router.delete(
  '/:businessId/products/:productId',
  protect,
  businessOnly,
  async (req, res) => {
    try {
      const business = await Business.findOne({
        _id: req.params.businessId,
        owner: req.user.id
      })

      if (!business) {
        return res.status(404).json({
          success: false,
          message: 'Business not found or unauthorized'
        })
      }

      const product = await Product.findOneAndUpdate(
        { _id: req.params.productId, business: business._id },
        { isActive: false },
        { new: true }
      )

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        })
      }

      await logBlockUpdate(business._id, 'product_deleted', req.user.id)

      res.json({
        success: true,
        message: 'Product deleted successfully'
      })
    } catch (error) {
      console.error('Delete product error:', error)
      res.status(500).json({
        success: false,
        message: 'Server error'
      })
    }
  }
)

// @desc    Add engagement block
// @route   POST /api/businesses/:id/engagement-blocks
// @access  Private (Business owner only)
router.post(
  '/:id/engagement-blocks',
  protect,
  businessOnly,
  async (req, res) => {
    try {
      const business = await Business.findOne({
        _id: req.params.id,
        owner: req.user.id
      })

      if (!business) {
        return res.status(404).json({
          success: false,
          message: 'Business not found or unauthorized'
        })
      }

      const engagementBlock = await EngagementBlock.create({
        business: business._id,
        ...req.body
      })

      await logBlockUpdate(business._id, 'engagement_block_added', req.user.id)

      res.status(201).json({
        success: true,
        message: 'Engagement block added successfully',
        engagementBlock
      })
    } catch (error) {
      console.error('Add engagement block error:', error)
      res.status(500).json({
        success: false,
        message: 'Server error'
      })
    }
  }
)

// @desc    Get engagement block
// @route   GET /api/businesses/:id/engagement-blocks
// @access  Private (Business owner only)
router.get(
  '/:id/engagement-blocks',
  protect,
  businessOnly,
  async (req, res) => {
    try {
      const business = await Business.findOne({
        _id: req.params.id,
        owner: req.user.id
      })

      if (!business) {
        return res.status(404).json({
          success: false,
          message: 'Business not found or unauthorized'
        })
      }

      const engagementBlocks = await EngagementBlock.find({
        business: business._id
      })

      res.json({
        success: true,
        engagementBlocks
      })
    } catch (error) {
      console.error('Get engagement blocks error:', error)
      res.status(500).json({
        success: false,
        message: 'Server error'
      })
    }
  }
)

// @desc    Add review to business
// @route   POST /api/businesses/:id/reviews
// @access  Private (Customer only)
router.post(
  '/:id/reviews',
  protect,
  customerOnly,
  [
    body('rating')
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating must be between 1 and 5'),
    body('comment')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Comment cannot exceed 500 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const business = await Business.findOne({
        _id: req.params.id,
        isApproved: true
      })

      if (!business) {
        return res.status(404).json({
          success: false,
          message: 'Business not found'
        })
      }

      // Check if user already reviewed this business
      const existingReview = await Review.findOne({
        business: req.params.id,
        reviewer: req.user.id
      })

      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: 'You have already reviewed this business'
        })
      }

      const review = await Review.create({
        business: req.params.id,
        reviewer: req.user.id,
        rating: req.body.rating,
        comment: req.body.comment
      })

      // Update business rating
      const reviews = await Review.find({
        business: req.params.id,
        isActive: true
      })
      const totalRating = reviews.reduce(
        (sum, review) => sum + review.rating,
        0
      )
      const averageRating = totalRating / reviews.length

      business.rating = Math.round(averageRating * 10) / 10
      business.totalReviews = reviews.length
      await business.save()

      // Create notification for business owner
      await Notification.create({
        recipient: business.owner,
        sender: req.user.id,
        business: business._id,
        type: 'new_review',
        title: 'New Review',
        message: `${req.user.firstName} ${req.user.lastName} left a ${req.body.rating}-star review for your business`
      })

      await review.populate('reviewer', 'firstName lastName profileImage')

      res.status(201).json({
        success: true,
        message: 'Review added successfully',
        review
      })
    } catch (error) {
      console.error('Add review error:', error)
      res.status(500).json({
        success: false,
        message: 'Server error'
      })
    }
  }
)

// @desc GET current users rating
// @route /api/businesses/:id/rating
// private (Only for Customer)
router.get('/:id/rating', protect, customerOnly, async (req, res) => {
  try {
    const review = await Review.findOne({
      business: req.params.id,
      reviewer: req.user.id
    })

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      })
    }

    res.json({
      success: true,
      rating: review.rating
    })
  } catch (error) {
    console.error('Get rating error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Get business reviews
// @route   GET /api/businesses/:id/reviews
// @access  Public
router.get('/:id/reviews', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query

    const reviews = await Review.find({
      business: req.params.id,
      isActive: true
    })
      .populate('reviewer', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Review.countDocuments({
      business: req.params.id,
      isActive: true
    })

    // Get rating distribution
    const ratingStats = await Review.aggregate([
      {
        $match: {
          business: mongoose.Types.ObjectId(req.params.id),
          isActive: true
        }
      },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ])

    res.json({
      success: true,
      reviews,
      ratingStats,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    })
  } catch (error) {
    console.error('Get reviews error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Send update to followers
// @route   POST /api/businesses/:id/send-update
// @access  Private (Business owner only)
router.post(
  '/:id/send-update',
  protect,
  businessOnly,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('message').trim().notEmpty().withMessage('Message is required'),
    body('category')
      .isIn(['promotion', 'new_product', 'announcement', 'event',"new_business","general"])
      .withMessage('Invalid category')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const business = await Business.findOne({
        _id: req.params.id,
        owner: req.user.id
      })

      if (!business) {
        return res.status(404).json({
          success: false,
          message: 'Business not found or unauthorized'
        })
      }

      // Get all followers
      const followers = await Follow.find({
        following: business._id,
        isActive: true
      }).populate('follower', '_id')

      // Create business update record
      const businessUpdate = await BusinessUpdate.create({
        business: business._id,
        title: req.body.title,
        message: req.body.message,
        category: req.body.category,
        sentToFollowers: true,
        followerCount: followers.length
      })
       await logNotificationSend({
          recipient: business.owner,
          sender: req.user.id,
          business: business._id,
          type: 'business_update',
          message: `${businessUpdate.title}: ${businessUpdate.message}`
        })

      // Create notifications for all followers
      const notifications = followers.map(follow => ({
        recipient: follow.follower._id,
        sender: req.user.id,
        business: business._id,
        type: 'business_update',
        title: req.body.title,
        message: req.body.message
      }))

      if (notifications.length > 0) {
        await Notification.insertMany(notifications)
      }








      res.json({
        success: true,
        message: `Update sent to ${followers.length} followers`,
        businessUpdate
      })
    } catch (error) {
      console.error('Send update error:', error)
      res.status(500).json({
        success: false,
        message: 'Server error'
      })
    }
  }
)

// @desc    Get business followers
// @route   GET /api/businesses/:id/followers
// @access  Private (Business owner only)
router.get('/:id/followers', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({
      _id: req.params.id,
      owner: req.user.id
    })

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found or unauthorized'
      })
    }

    const { page = 1, limit = 20 } = req.query

    const followers = await Follow.find({
      following: business._id,
      isActive: true
    })
      .populate('follower', 'firstName lastName profileImage email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Follow.countDocuments({
      following: business._id,
      isActive: true
    })

    res.json({
      success: true,
      followers: followers.map(follow => ({
        ...follow.follower.toObject(),
        followedAt: follow.createdAt
      })),
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    })
  } catch (error) {
    console.error('Get followers error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc GET total Followers and Blocked Followers
// @route GET /api/businesses/:id/followers/stats
// @access Private (Business owner only)
router.get('/followers/stats', protect, businessOnly, async (req, res) => {
  try {
    //  create aggregate query to calculate total follower and blocked follower of current user for all his businesses
    const userBusinesses = await Business.find({ owner: req.user.id }).select(
      '_id'
    )

    const [totalFollowers, totalBlocked] = await Promise.all([
      Follow.countDocuments({
        following: { $in: userBusinesses },
        isActive: true
      }),
      Follow.countDocuments({
        following: { $in: userBusinesses },
        isActive: true,
        isBlocked: true
      })
    ])

    res.json({
      success: true,
      stats: {
        totalFollowers,
        totalBlocked
      }
    })
  } catch (error) {
    console.error('Get followers stats error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

module.exports = router
