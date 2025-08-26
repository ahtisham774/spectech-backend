const Notification = require("../models/Notification")
const Follow = require("../models/Follow")
const Business = require("../models/Business")
const User = require("../models/User")

class NotificationService {
  // Create notification for new business joining
  static async notifyNewBusiness(businessId) {
    try {
      const business = await Business.findById(businessId).populate("category", "name")

      if (!business) return

      // Get all users who might be interested (customers in same category followers)
      const interestedUsers = await User.find({
        userType: "Customer",
        isActive: true,
        "notificationPreferences.inPlatformAlerts": true,
      }).limit(1000) // Limit to prevent spam

      const notifications = interestedUsers.map((user) => ({
        recipient: user._id,
        business: business._id,
        type: "new_business_joined",
        title: "New Business Joined",
        message: `A new business just joined ${business.category.name}: ${business.name}. ${business.tagline || "Check out their profile!"}`,
      }))

      if (notifications.length > 0) {
        await Notification.insertMany(notifications)
      }

      console.log(`Sent new business notifications to ${notifications.length} users`)
    } catch (error) {
      console.error("Error sending new business notifications:", error)
    }
  }

  // Create notification for new product
  static async notifyNewProduct(businessId, productInfo) {
    try {
      const followers = await Follow.find({
        following: businessId,
        isActive: true,
      }).populate("follower", "_id")

      const business = await Business.findById(businessId)

      const notifications = followers.map((follow) => ({
        recipient: follow.follower._id,
        business: businessId,
        type: "new_product",
        title: "New Product",
        message: `${business.name} just added a new product: ${productInfo.name || "Check it out!"}`,
      }))

      if (notifications.length > 0) {
        await Notification.insertMany(notifications)
      }

      console.log(`Sent new product notifications to ${notifications.length} followers`)
    } catch (error) {
      console.error("Error sending new product notifications:", error)
    }
  }

  // Create notification for promotions
  static async notifyPromotion(businessId, promotionInfo) {
    try {
      const followers = await Follow.find({
        following: businessId,
        isActive: true,
      }).populate("follower", "_id")

      const business = await Business.findById(businessId)

      const notifications = followers.map((follow) => ({
        recipient: follow.follower._id,
        business: businessId,
        type: "promotion",
        title: promotionInfo.title || "Special Promotion",
        message: `${business.name} is offering ${promotionInfo.description || "a special promotion"}`,
      }))

      if (notifications.length > 0) {
        await Notification.insertMany(notifications)
      }

      console.log(`Sent promotion notifications to ${notifications.length} followers`)
    } catch (error) {
      console.error("Error sending promotion notifications:", error)
    }
  }

  // Mark notifications as read
  static async markAsRead(userId, notificationIds) {
    try {
      await Notification.updateMany(
        {
          _id: { $in: notificationIds },
          recipient: userId,
        },
        { isRead: true },
      )
    } catch (error) {
      console.error("Error marking notifications as read:", error)
    }
  }

  // Get unread count for user
  static async getUnreadCount(userId) {
    try {
      return await Notification.countDocuments({
        recipient: userId,
        isRead: false,
      })
    } catch (error) {
      console.error("Error getting unread count:", error)
      return 0
    }
  }

  // Clean old notifications (older than 30 days)
  static async cleanOldNotifications() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const result = await Notification.deleteMany({
        createdAt: { $lt: thirtyDaysAgo },
        isRead: true,
      })

      console.log(`Cleaned ${result.deletedCount} old notifications`)
    } catch (error) {
      console.error("Error cleaning old notifications:", error)
    }
  }
}

module.exports = NotificationService
