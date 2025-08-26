const mongoose = require("mongoose")
const User = require("../models/User")
require("dotenv").config()

async function createAdminUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log("Connected to MongoDB")

    // Check if admin already exists
    const existingAdmin = await User.findOne({ userType: "Admin" })
    if (existingAdmin) {
      console.log("Admin user already exists:", existingAdmin.email)
      process.exit(0)
    }

    // Create admin user
    const adminUser = await User.create({
      firstName: "Admin",
      lastName: "User",
      email: "admin@spectech.com",
      password: "admin123456", // Will be hashed automatically
      userType: "Admin",
      isVerified: true,
      isActive: true,
    })

    console.log("Admin user created successfully!")
    console.log("Email:", adminUser.email)
    console.log("Password: admin123456")
    console.log("Please change the password after first login")

    process.exit(0)
  } catch (error) {
    console.error("Error creating admin user:", error)
    process.exit(1)
  }
}

createAdminUser()
