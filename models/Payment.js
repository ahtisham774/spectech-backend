const mongoose = require("mongoose")

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    stripePaymentIntentId: {
      type: String,
      required: true,
      unique: true,
    },
    stripeCustomerId: String,
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "usd",
    },
    status: {
      type: String,
    enum: ['pending', 'succeeded', 'failed', 'canceled', 'requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["card", "paypal"],
      default: "card",
    },
    description: {
      type: String,
      default: "Business listing fee",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    refundId: String,
    refundAmount: Number,
    refundReason: String,
    failureReason: String,
  },
  {
    timestamps: true,
  },
)

// Index for efficient queries
paymentSchema.index({ user: 1, createdAt: -1 })
paymentSchema.index({ business: 1 })
paymentSchema.index({ status: 1 })
paymentSchema.index({ stripePaymentIntentId: 1 })

module.exports = mongoose.model("Payment", paymentSchema)
