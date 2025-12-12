const db = require('./server/config/db').dbPool;

async function migrate() {
    try {
        console.log("Starting migration...");

        // 1. Add is_async to sys_models
        try {
            await db.query("ALTER TABLE sys_models ADD COLUMN is_async TINYINT DEFAULT 0");
            console.log("Added is_async column to sys_models.");
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log("is_async column already exists.");
            } else {
                throw e;
            }
        }

        // 2. Create sys_async_tasks table
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS sys_async_tasks (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                request_id VARCHAR(64) NOT NULL,
                user_id INT NOT NULL,
                channel_id INT NOT NULL,
                provider VARCHAR(32) NOT NULL,
                upstream_task_id VARCHAR(128) NOT NULL,
                pre_cost DECIMAL(20, 8) DEFAULT 0,
                status VARCHAR(20) DEFAULT 'PENDING',
                response_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_status (status),
                INDEX idx_req (request_id),
                INDEX idx_upstream (upstream_task_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await db.query(createTableSQL);
        console.log("sys_async_tasks table created or exists.");

        console.log("Migration completed successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
