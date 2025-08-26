const mongoose = require("mongoose")
const Category = require("../models/Category")
require("dotenv").config()

const categories = [
  {
    name: "Hardware",
    description: "Computer hardware, electronics, and tech equipment",
  },
  {
    name: "Software",
    description: "Software development, SaaS, and digital solutions",
  },
  {
    name: "Cosmetics",
    description: "Beauty products, skincare, and cosmetic services",
  },
  {
    name: "Pharmaceutical",
    description: "Healthcare, medical supplies, and pharmaceutical products",
  },
  {
    name: "Beverages",
    description: "Drinks, beverages, and liquid refreshments",
  },
  {
    name: "Food Services",
    description: "Restaurants, catering, and food delivery services",
  },
  {
    name: "Fashion & Apparel",
    description: "Clothing, accessories, and fashion items",
  },
  {
    name: "Home & Garden",
    description: "Home improvement, gardening, and household items",
  },
  {
    name: "Automotive",
    description: "Car services, parts, and automotive solutions",
  },
  {
    name: "Education",
    description: "Educational services, courses, and learning platforms",
  },
  {
    name: "Finance",
    description: "Financial services, consulting, and fintech solutions",
  },
  {
    name: "Entertainment",
    description: "Entertainment services, media, and recreational activities",
  },
]

async function seedCategories() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log("Connected to MongoDB")

    // Clear existing categories
    await Category.deleteMany({})
    console.log("Cleared existing categories")

    // Insert new categories
    const createdCategories = await Category.insertMany(categories)
    console.log(`Created ${createdCategories.length} categories`)

    console.log("Categories seeded successfully!")
    process.exit(0)
  } catch (error) {
    console.error("Error seeding categories:", error)
    process.exit(1)
  }
}

seedCategories()
