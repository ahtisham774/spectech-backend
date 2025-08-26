const mongoose = require("mongoose")

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
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
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
    },
    items: [
      {
        name: {
          type: String,
          required: true,
        },
        description: String,
        amount: {
          type: Number,
          required: true,
        },
        quantity: {
          type: Number,
          default: 1,
        },
      },
    ],
    subtotal: {
      type: Number,
      required: true,
    },
    taxes: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "usd",
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "canceled", "refunded"],
      default: "pending",
    },
    billingDetails: {
      name: String,
      email: String,
      address: {
        line1: String,
        line2: String,
        city: String,
        state: String,
        postal_code: String,
        country: String,
      },
    },
    completedAt: Date,
    canceledAt: Date,
    refundedAt: Date,
  },
  {
    timestamps: true,
  },
)

// Generate order number before saving
orderSchema.pre("save", async function (next) {
  if (!this.orderNumber) {
    const count = await mongoose.model("Order").countDocuments()
    this.orderNumber = `ORD-${Date.now()}-${(count + 1).toString().padStart(4, "0")}`
  }
  next()
})

module.exports = mongoose.model("Order", orderSchema)
