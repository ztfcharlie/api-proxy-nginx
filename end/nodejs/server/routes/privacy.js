const express = require('express');
const router = express.Router();

router.get('/check', (req, res) => {
    const info = {
        message: "Privacy Check - Headers Received by Backend",
        timestamp: new Date().toISOString(),
        client_ip: req.ip || req.connection.remoteAddress,
        headers: req.headers
    };

    // Log for debugging
    console.log("--- Privacy Check Request ---");
    console.log(`IP: ${info.client_ip}`);
    
    res.json(info);
});

module.exports = router;
