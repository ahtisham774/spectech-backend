const express = require('express')
const { body, validationResult } = require('express-validator')
const User = require('../models/User')
const Business = require('../models/Business')
const Follow = require('../models/Follow')
const Bookmark = require('../models/Bookmark')
const Notification = require('../models/Notification')
const { protect, customerOnly } = require('../middleware/auth')
const { logNotificationSend } = require('../middleware/systemLogger')

const router = express.Router()

// @desc    Get user notifications
// @route   GET /api/users/notifications
// @access  Private
router.get('/notifications', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, filter = 'all' } = req.query

    const query = { recipient: req.user.id }

    // Apply filters
    if (filter === 'unread') {
      query.isRead = false
    }

    const notifications = await Notification.find(query)
      .populate('sender', 'firstName lastName profileImage')
      .populate('business', 'name logo')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Notification.countDocuments(query)
    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      isRead: false
    })

    res.json({
      success: true,
      notifications,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      },
      unreadCount
    })
  } catch (error) {
    console.error('Get notifications error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Mark notification as read
// @route   PUT /api/users/notifications/:id/read
// @access  Private
router.put('/notifications/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id },
      { isRead: true },
      { new: true }
    )

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      })
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      notification
    })
  } catch (error) {
    console.error('Mark notification read error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Mark all notifications as read
// @route   PUT /api/users/notifications/read-all
// @access  Private
router.put('/notifications/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { isRead: true }
    )

    res.json({
      success: true,
      message: 'All notifications marked as read'
    })
  } catch (error) {
    console.error('Mark all notifications read error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc check if user already follow the business or not
// @route GET /api/users/following/:businessId
router.get(
  '/following/:businessId',
  protect,
  customerOnly,
  async (req, res) => {
    try {
      const follow = await Follow.findOne({
        follower: req.user.id,
        following: req.params.businessId,
        isActive: true
      })

      res.json({
        success: true,
        isFollowing: !!follow
      })
    } catch (error) {
      console.error('Check following error:', error)
      res.status(500).json({
        success: false,
        message: 'Server error'
      })
    }
  }
)

// @desc    Get user's followed businesses
// @route   GET /api/users/following
// @access  Private
router.get('/following', protect, customerOnly, async (req, res) => {
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
    } = req.query;
    const query = { follower: req.user.id, isActive: true };

    let sortQuery = { createdAt: -1 };
    if (sort === 'popular') {
      sortQuery = { 'following.followers': -1 };
    } else if (sort === 'rating') {
      sortQuery = { 'following.rating': -1 };
    }

    const follows = await Follow.find(query)
      .populate({
        path: 'following',
        select: 'name logo tagline description category followers rating isApproved',
        populate: {
          path: 'category',
          select: '_id name'
        },
        match: {
          isApproved: true,
          ...(category && { category: category }), // Filter by category _id
          ...(location && { location: { $regex: location, $options: 'i' } }),
          ...(name && { name: { $regex: name, $options: 'i' } }),
          ...(price && { price: { $lte: Number(price) } }),
          ...(ratings && { rating: { $gte: Number(ratings) } })
        }
      })
      .sort(sortQuery)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Filter out follows where business is null
    const validFollows = follows.filter(follow => follow.following);

    // Check bookmark status for each business
    const validFollowsWithStatus = await Promise.all(
      validFollows.map(async (follow) => {
        const bookmark = await Bookmark.findOne({
          user: req.user.id,
          business: follow.following._id
        });
        return {
          ...follow.following.toObject(),
          category: follow.following.category || { _id: null, name: 'Uncategorized' },
          isFollowed: true,
          isBookmarked: !!bookmark,
          followedAt: follow.createdAt
        };
      })
    );

    const total = await Follow.countDocuments({
      follower: req.user.id,
      isActive: true
    });

    res.json({
      success: true,
      following: validFollowsWithStatus,
      pagination: {
        current: Number(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @desc Get the followers of current user
// @route GET /api/users/followers
// @access Private
router.get('/followers', protect, async (req, res) => {
  try {
    // first get the businesses of current user req.user.id match with owner in businesses then find all the followers of that businesses and return them
    const businesses = await Business.find({ owner: req.user.id }).select('_id')

    const followers = await Follow.find({
      following: { $in: businesses },
      isActive: true
    })
      .populate('follower', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      followers: followers.map(follow => ({
        ...follow.follower.toObject(),
        followedAt: follow.createdAt,
        businessId: follow.following.toString()
      }))
    })
  } catch (error) {
    console.error('Get followers error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc Option to block the follower of current user
// @route POST /api/users/followers/:id/block
// @access Private
router.post('/followers/:id/block/:businessId', protect, async (req, res) => {
  try {
    const follow = await Follow.findOne({
      follower: req.params.id,
      following: req.params.businessId,
      isActive: true
    })

    if (!follow) {
      return res.status(404).json({
        success: false,
        message: 'Not following this user'
      })
    }

    follow.isBlocked = true
    await follow.save()

    res.json({
      success: true,
      message: 'Successfully blocked user'
    })
  } catch (error) {
    console.error('Block follower error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})
// @desc Option to unblock the follower of current user
// @route POST /api/users/followers/:id/unblock
// @access Private
router.post('/followers/:id/unblock/:businessId', protect, async (req, res) => {
  try {
    const follow = await Follow.findOne({
      follower: req.params.id,
      following: req.params.businessId,
      isActive: true
    })

    if (!follow) {
      return res.status(404).json({
        success: false,
        message: 'Not following this user'
      })
    }

    follow.isBlocked = false
    await follow.save()

    res.json({
      success: true,
      message: 'Successfully unblocked user'
    })
  } catch (error) {
    console.error('Unblock follower error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc check the follow status of customer to business
// @route GET /api/users/:userId/follows/:businessId
router.get('/:userId/follows/:businessId', protect, async (req, res) => {
  try {
    const follow = await Follow.findOne({
      follower: req.params.userId,
      following: req.params.businessId,
      isActive: true
    })

    res.json({
      success: true,
      isBlocked: follow.isBlocked
    })
  } catch (error) {
    console.error('Check following error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Follow a business
// @route   POST /api/users/follow/:businessId
// @access  Private
router.post('/follow/:businessId', protect, customerOnly, async (req, res) => {
  try {
    const business = await Business.findById(req.params.businessId);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      });
    }

    if (!business.isApproved) {
      return res.status(400).json({
        success: false,
        message: 'Cannot follow unapproved business'
      });
    }

    const existingFollow = await Follow.findOne({
      follower: req.user.id,
      following: req.params.businessId
    });

    if (existingFollow) {
      if (existingFollow.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Already following this business'
        });
      } else {
        existingFollow.isActive = true;
        await existingFollow.save();
      }
    } else {
      await Follow.create({
        follower: req.user.id,
        following: req.params.businessId
      });
    }

    business.followers += 1;
    await business.save();

    await Notification.create({
      recipient: business.owner,
      sender: req.user.id,
      business: business._id,
      type: 'new_follower',
      title: 'New Follower',
      message: `${req.user.firstName} ${req.user.lastName} started following your business`
    });

    // Log the follow action
    // logNotificationSend({
    //   recipient: business.owner,
    //   sender: req.user.id,
    //   business: business._id,
    //   type: 'new_follower',
    //   title: 'New Follower',
    //   message: `${req.user.firstName} ${req.user.lastName} started following your business`
    // })

    res.json({
      success: true,
      message: 'Successfully followed business'
    });
  } catch (error) {
    console.error('Follow business error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});


// @desc    Unfollow a business
// @route   DELETE /api/users/follow/:businessId
// @access  Private
router.delete('/follow/:businessId', protect, customerOnly, async (req, res) => {
  try {
    const follow = await Follow.findOne({
      follower: req.user.id,
      following: req.params.businessId,
      isActive: true
    });

    if (!follow) {
      return res.status(404).json({
        success: false,
        message: 'Not following this business'
      });
    }

    follow.isActive = false;
    await follow.save();

    await Notification.create({
      recipient: business.owner,
      sender: req.user.id,
      business: business._id,
      type: 'unfollow',
      message: `${req.user.firstName} ${req.user.lastName} unfollowed your business`
    });

    const business = await Business.findById(req.params.businessId);
    if (business && business.followers > 0) {
      business.followers -= 1;
      await business.save();
    }



    res.json({
      success: true,
      message: 'Successfully unfollowed business'
    });
  } catch (error) {
    console.error('Unfollow business error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @desc    Get user's bookmarked businesses
// @route   GET /api/users/bookmarks
// @access  Private
router.get('/bookmarks', protect, customerOnly, async (req, res) => {
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
    } = req.query;
    const query = { user: req.user.id };

    let sortQuery = { createdAt: -1 };
    if (sort === 'popular') {
      sortQuery = { 'business.followers': -1 };
    } else if (sort === 'rating') {
      sortQuery = { 'business.rating': -1 };
    }

    const bookmarks = await Bookmark.find(query)
      .populate({
        path: 'business',
        select: 'name logo tagline description category followers rating isApproved',
        populate: {
          path: 'category',
          select: '_id name'
        },
        match: {
          isApproved: true,
          ...(category && { category: category }), // Filter by category _id
          ...(location && { location: { $regex: location, $options: 'i' } }),
          ...(name && { name: { $regex: name, $options: 'i' } }),
          ...(price && { price: { $lte: Number(price) } }),
          ...(ratings && { rating: { $gte: Number(ratings) } })
        }
      })
      .sort(sortQuery)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const validBookmarks = bookmarks.filter(bookmark => bookmark.business);

    const validBookmarksWithStatus = await Promise.all(
      validBookmarks.map(async (bookmark) => {
        const follow = await Follow.findOne({
          follower: req.user.id,
          following: bookmark.business._id,
          isActive: true
        });
        return {
          ...bookmark.business.toObject(),
          category: bookmark.business.category || { _id: null, name: 'Uncategorized' },
          isBookmarked: true,
          isFollowed: !!follow,
          bookmarkedAt: bookmark.createdAt
        };
      })
    );

    const total = await Bookmark.countDocuments({ user: req.user.id });

    res.json({
      success: true,
      bookmarks: validBookmarksWithStatus,
      pagination: {
        current: Number(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get bookmarks error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @desc    Bookmark a business
// @route   POST /api/users/bookmark/:businessId
// @access  Private
router.post('/bookmark/:businessId', protect, customerOnly, async (req, res) => {
  try {
    const business = await Business.findById(req.params.businessId);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found'
      });
    }

    if (!business.isApproved) {
      return res.status(400).json({
        success: false,
        message: 'Cannot bookmark unapproved business'
      });
    }

    const existingBookmark = await Bookmark.findOne({
      user: req.user.id,
      business: req.params.businessId
    });

    if (existingBookmark) {
      return res.status(400).json({
        success: false,
        message: 'Business already bookmarked'
      });
    }

    await Bookmark.create({
      user: req.user.id,
      business: req.params.businessId
    });

    await Notification.create({
      recipient: business.owner,
      sender: req.user.id,
      business: business._id,
      type: 'bookmark',
      message: `${req.user.firstName} ${req.user.lastName} bookmarked your business`
    });

    res.json({
      success: true,
      message: 'Business bookmarked successfully'
    });
  } catch (error) {
    console.error('Bookmark business error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @desc    Remove bookmark
// @route   DELETE /api/users/bookmark/:businessId
// @access  Private
router.delete('/bookmark/:businessId', protect, customerOnly, async (req, res) => {
  try {
    const bookmark = await Bookmark.findOneAndDelete({
      user: req.user.id,
      business: req.params.businessId
    });

    if (!bookmark) {
      return res.status(404).json({
        success: false,
        message: 'Bookmark not found'
      });
    }

    await Notification.create({
      recipient: business.owner,
      sender: req.user.id,
      business: business._id,
      type: 'bookmark_remove',
      message: `${req.user.firstName} ${req.user.lastName} removed your business from bookmarks`
    });

    res.json({
      success: true,
      message: 'Bookmark removed successfully'
    });
  } catch (error) {
    console.error('Remove bookmark error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @desc    Get user profile stats
// @route   GET /api/users/stats
// @access  Private
router.get('/stats', protect, customerOnly, async (req, res) => {
  try {
    const bookmarkedCount = await Bookmark.countDocuments({ user: req.user.id })
    const followedCount = await Follow.countDocuments({
      follower: req.user.id,
      isActive: true
    })

    res.json({
      success: true,
      stats: {
        bookmarkedBusinesses: bookmarkedCount,
        followedBusinesses: followedCount,
        profileLink: `${
          process.env.FRONTEND_URL
        }/profile/${req.user.firstName.toLowerCase()}-${req.user.lastName.toLowerCase()}`
      }
    })
  } catch (error) {
    console.error('Get user stats error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

// @desc    Delete user account
// @route   DELETE /api/users/account
// @access  Private
router.delete('/account', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    // Soft delete - deactivate account
    user.isActive = false
    await user.save()

    // Remove all follows
    await Follow.updateMany({ follower: req.user.id }, { isActive: false })

    // Remove all bookmarks
    await Bookmark.deleteMany({ user: req.user.id })

    res.json({
      success: true,
      message: 'Account deleted successfully'
    })
  } catch (error) {
    console.error('Delete account error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
})

module.exports = router
