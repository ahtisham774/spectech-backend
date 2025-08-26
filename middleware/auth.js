const jwt = require("jsonwebtoken")
const User = require("../models/User")

// Protect routes - verify JWT token
exports.protect = async (req, res, next) => {
  try {
    let token

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1]
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    console.log("Decoded token:", decoded)
    req.user = await User.findById(decoded.id).select("-password")

    if (!req.user) {
      return res.status(401).json({ message: "Not authorized, user not found" })
    }

    next()
  } catch (error) {
    console.error("Auth middleware error:", error)
    return res.status(401).json({ message: "Not authorized, token failed" })
  }
}

// Admin only access
exports.adminOnly = (req, res, next) => {
  if (req.user && req.user.userType === "Admin") {
    next()
  } else {
    res.status(403).json({ message: "Access denied. Admin only." })
  }
}

// Business user access
exports.businessOnly = (req, res, next) => {

  console.log("user",req.user)
  if (req.user && req.user.userType === "Business") {
    next()
  } else {
    res.status(403).json({ message: "Access denied. Business users only." })
  }
}

// Customer user access
exports.customerOnly = (req, res, next) => {
  if (req.user && req.user.userType === "Customer") {
    next()
  } else {
    res.status(403).json({ message: "Access denied. Customers only." })
  }
}
