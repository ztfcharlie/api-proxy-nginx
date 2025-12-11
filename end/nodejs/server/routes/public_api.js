const express = require('express');
const router = express.Router();
const db = require('../config/db').dbPool;

/**
 * Public: Get Model List
 * Returns a list of models with their pricing, suitable for public display.
 */
router.get('/models', async (req, res) => {
    try {
        const { provider } = req.query;
        let query = "SELECT provider, name, price_input, price_output, price_cache, price_request, price_time, default_rpm, status FROM sys_models WHERE status = 1";
        let params = [];
        
        if (provider) {
            query += " AND provider = ?";
            params.push(provider);
        }
        
        query += " ORDER BY provider, name";
        const [models] = await db.query(query, params);
        
        // Format for public consumption (e.g. normalize provider names if needed)
        const formatted = models.map(m => ({
            provider: m.provider.toUpperCase(),
            name: m.name,
            pricing: {
                input: parseFloat(m.price_input),
                output: parseFloat(m.price_output),
                cache: parseFloat(m.price_cache)
            },
            rpm: m.default_rpm
        }));

        res.json({ data: formatted });
    } catch (err) {
        // Log internal error but return generic message
        console.error("Public API Error:", err);
        res.status(500).json({ error: "Unable to fetch models" });
    }
});

module.exports = router;
