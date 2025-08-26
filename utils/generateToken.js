const jwt = require("jsonwebtoken")

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  })
}

const generateResetToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_RESET_EXPIRE || "10m",
  })
}

module.exports = { generateToken, generateResetToken }
