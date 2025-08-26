const mongoose = require('mongoose')

const productSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true
    },
    image: {
      url: String,
      caption: {
        type: String,
        maxlength: [100, 'Caption cannot exceed 100 characters']
      }
    },

    productLink: {
      type: String,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
)

module.exports = mongoose.model('Product', productSchema)
