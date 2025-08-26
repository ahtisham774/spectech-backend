const express = require('express')
const { sendContactEmail } = require('../utils/sendEmail')
const router = express.Router()

router.post('/', sendContactEmail)

module.exports = router
