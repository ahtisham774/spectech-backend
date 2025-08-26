const express = require("express")
const { body, validationResult } = require("express-validator")
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)
const Business = require("../models/Business")
const Payment = require("../models/Payment")
const Order = require("../models/Order")
const SystemLog = require("../models/SystemLog")
const { protect, businessOnly } = require("../middleware/auth")

const router = express.Router()

// @desc    Create payment intent for business listing
// @route   POST /api/payments/create-intent
// @access  Private (Business users only)
router.post(
  "/create-intent",
  protect,
  businessOnly,
  [body("businessId").isMongoId().withMessage("Valid business ID is required")],
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

      const { businessId } = req.body

      // Verify business belongs to user
      const business = await Business.findOne({
        _id: businessId,
        owner: req.user.id,
      })

      if (!business) {
        return res.status(404).json({
          success: false,
          message: "Business not found or unauthorized",
        })
      }

      // Check if business already has a successful payment
      const existingPayment = await Payment.findOne({
        business: businessId,
        status: "succeeded",
      })

      if (existingPayment) {
        return res.status(200).json({
          success: true,
          code: "BUSINESS_ALREADY_PAID",
          message: "Business listing fee already paid",
        })
      }

      // Create or get Stripe customer
      let stripeCustomer
      try {
        const customers = await stripe.customers.list({
          email: req.user.email,
          limit: 1,
        })

        if (customers.data.length > 0) {
          stripeCustomer = customers.data[0]
        } else {
          stripeCustomer = await stripe.customers.create({
            email: req.user.email,
            name: `${req.user.firstName} ${req.user.lastName}`,
            metadata: {
              userId: req.user.id.toString(),
              businessId: businessId,
            },
          })
        }
      } catch (stripeError) {
        console.error("Stripe customer error:", stripeError)
        return res.status(500).json({
          success: false,
          message: "Error creating customer",
        })
      }

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 9900, // $99.00 in cents
        currency: "usd",
        customer: stripeCustomer.id,
        description: `Business listing fee for ${business.name}`,
        metadata: {
          userId: req.user.id.toString(),
          businessId: businessId,
          businessName: business.name,
        },
        payment_method_types: ["card"],

      })

      // Save payment record
      const payment = await Payment.create({
        user: req.user.id,
        business: businessId,
        stripePaymentIntentId: paymentIntent.id,
        stripeCustomerId: stripeCustomer.id,
        amount: 9900,
        currency: "usd",
        status: "pending",
        description: `Business listing fee for ${business.name}`,
        metadata: {
          businessName: business.name,
        },
      })

      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentId: payment._id,
        paymentIntentId: paymentIntent.id,
        amount: 9900,
        currency: "usd",
      })
    } catch (error) {
      console.error("Create payment intent error:", error)
      res.status(500).json({
        success: false,
        message: "Server error",
      })
    }
  },
)

// @desc    Confirm payment
// @route   POST /api/payments/confirm
// @access  Private (Business users only)
router.post(
  "/confirm",
  protect,
  businessOnly,
  [body("paymentIntentId").notEmpty().withMessage("Payment intent ID is required")],
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

      const { paymentIntentId } = req.body

      // Get payment intent from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

      console.log("PayemntIndent",paymentIntent)

      // Find payment record
      const payment = await Payment.findOne({
        stripePaymentIntentId: paymentIntentId,
        user: req.user.id,
      }).populate("business", "name")

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found",
        })
      }

      // Update payment status
      payment.status = paymentIntent.status
      if (paymentIntent.status === "succeeded") {
        // Update business payment status
        await Business.findByIdAndUpdate(payment.business._id, {
          paymentStatus: "paid",
          paymentId: payment._id,
        })

        // Create order record
        const order = await Order.create({
          user: req.user.id,
          business: payment.business._id,
          orderNumber: generateOrderNumber(),
          payment: payment._id,
          items: [
            {
              name: "Business Listing Fee",
              description: "One-time payment to publish your business on our platform",
              amount: 9900,
              quantity: 1,
            },
          ],
          subtotal: 9900,
          taxes: 0,
          total: 9900,
          currency: "usd",
          status: "completed",
          billingDetails: {
            name: paymentIntent?.charges?.data[0]?.billing_details?.name || `${req.user.firstName} ${req.user.lastName}`,
            email: req.user.email,
            address: paymentIntent?.charges?.data[0]?.billing_details?.address || {},
          },
          completedAt: new Date(),
        })

        payment.metadata.orderId = order._id
      } else if (paymentIntent.status === "payment_failed") {
        payment.failureReason = paymentIntent.last_payment_error?.message || "Payment failed"
      }

      await payment.save()

      res.json({
        success: true,
        payment: {
          id: payment._id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          business: payment.business,
        },
        message: paymentIntent.status === "succeeded" ? "Payment successful" : "Payment status updated",
      })
    } catch (error) {
      console.error("Confirm payment error:", error)
      res.status(500).json({
        success: false,
        message: "Server error",
      })
    }
  },
)

const generateOrderNumber = () => {
  return `ORD-${Math.floor(Math.random() * 1000000)}`
}

// @desc    Get payment status
// @route   GET /api/payments/:paymentId/status
// @access  Private
router.get("/:paymentId/status", protect, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      user: req.user.id,
    }).populate("business", "name logo")

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      })
    }

    // Get latest status from Stripe
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId)

      if (payment.status !== paymentIntent.status) {
        payment.status = paymentIntent.status
        await payment.save()
      }
    } catch (stripeError) {
      console.error("Error fetching payment intent:", stripeError)
    }

    res.json({
      success: true,
      payment: {
        id: payment._id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        description: payment.description,
        business: payment.business,
        createdAt: payment.createdAt,
        failureReason: payment.failureReason,
      },
    })
  } catch (error) {
    console.error("Get payment status error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get user's payment history
// @route   GET /api/payments/history
// @access  Private
router.get("/history", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query

    const payments = await Payment.find({ user: req.user.id })
      .populate("business", "name logo")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Payment.countDocuments({ user: req.user.id })

    res.json({
      success: true,
      payments,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Get payment history error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get user's orders
// @route   GET /api/payments/orders
// @access  Private
router.get("/orders", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query

    const orders = await Order.find({ user: req.user.id })
      .populate("business", "name logo")
      .populate("payment", "status")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Order.countDocuments({ user: req.user.id })

    res.json({
      success: true,
      orders,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Get orders error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Get order by ID
// @route   GET /api/payments/orders/:orderId
// @access  Private
router.get("/orders/:orderId", protect, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      user: req.user.id,
    })
      .populate("business", "name logo")
      .populate("payment", "status stripePaymentIntentId")

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      })
    }

    res.json({
      success: true,
      order,
    })
  } catch (error) {
    console.error("Get order error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
})

// @desc    Stripe webhook handler
// @route   POST /api/payments/webhook
// @access  Public (Stripe webhook)
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"]
  let event

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object)
        break
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object)
        break
      case "payment_intent.canceled":
        await handlePaymentCanceled(event.data.object)
        break
      default:
        console.log(`Unhandled event type ${event.type}`)
    }

    res.json({ received: true })
  } catch (error) {
    console.error("Webhook handler error:", error)
    res.status(500).json({ error: "Webhook handler failed" })
  }
})

// Helper function to handle successful payments
async function handlePaymentSucceeded(paymentIntent) {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    })

    if (payment) {
      payment.status = "succeeded"
      await payment.save()

      // Update business payment status
      await Business.findByIdAndUpdate(payment.business, {
        paymentStatus: "paid",
      })

      // Log the successful payment
      await SystemLog.create({
        logType: "admin_action",
        user: payment.user,
        business: payment.business,
        description: "Payment succeeded via webhook",
        details: {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
        },
      })
    }
  } catch (error) {
    console.error("Handle payment succeeded error:", error)
  }
}

// Helper function to handle failed payments
async function handlePaymentFailed(paymentIntent) {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    })

    if (payment) {
      payment.status = "failed"
      payment.failureReason = paymentIntent.last_payment_error?.message || "Payment failed"
      await payment.save()

      // Update business payment status
      await Business.findByIdAndUpdate(payment.business, {
        paymentStatus: "failed",
      })
    }
  } catch (error) {
    console.error("Handle payment failed error:", error)
  }
}

// Helper function to handle canceled payments
async function handlePaymentCanceled(paymentIntent) {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    })

    if (payment) {
      payment.status = "canceled"
      await payment.save()

      // Update business payment status
      await Business.findByIdAndUpdate(payment.business, {
        paymentStatus: "pending",
      })
    }
  } catch (error) {
    console.error("Handle payment canceled error:", error)
  }
}

module.exports = router
