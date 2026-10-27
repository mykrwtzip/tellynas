const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/list', require('./list'));
router.use('/upload', require('./upload'));
router.use('/download', require('./download'));
router.use('/metadata', require('./metadata'));

module.exports = router;
