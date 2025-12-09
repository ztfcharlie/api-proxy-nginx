const logger = require('./LoggerService');

class JobManager {
    constructor() {
        this.jobs = new Map(); // name -> { interval, timer, lastRun, status, callback }
        this.isRunning = false;
        this.redis = null; // Injected
    }

    setRedis(redisInstance) {
        this.redis = redisInstance;
    }

    /**
     * 注册并启动一个定时任务
     * @param {string} name 任务名称
     * @param {string|number} interval 时间间隔 (ms) 或 cron 表达式 (暂仅支持 ms)
     * @param {function} callback 任务回调函数
     */
    schedule(name, interval, callback, description = '') {
        if (this.jobs.has(name)) {
            this.stop(name);
        }

        const job = {
            name,
            description,
            interval: parseInt(interval),
            callback,
            lastRun: null,
            nextRun: new Date(Date.now() + parseInt(interval)),
            lastResult: 'Pending',
            status: 'idle',
            timer: null
        };

        this.jobs.set(name, job);
        this.startJob(name);
        
        logger.info(`[JobManager] Job registered: ${name} (Interval: ${interval}ms)`);
    }

    startJob(name) {
        const job = this.jobs.get(name);
        if (!job) return;

        const run = async () => {
            job.status = 'running';
            const startTime = Date.now();
            
            logger.info(`[JobManager] Starting job: ${name}`);
            
            try {
                await job.callback();
                const duration = Date.now() - startTime;
                job.status = 'idle';
                job.lastRun = new Date();
                job.lastResult = `Success (${duration}ms)`;
                job.nextRun = new Date(Date.now() + job.interval);
                
                logger.info(`[JobManager] Job completed: ${name} in ${duration}ms`);
            } catch (error) {
                const duration = Date.now() - startTime;
                job.status = 'failed';
                job.lastRun = new Date();
                job.lastResult = `Failed: ${error.message}`;
                job.nextRun = new Date(Date.now() + job.interval);
                
                logger.error(`[JobManager] Job failed: ${name} in ${duration}ms. Error: ${error.message}`);
            }
        };

        job.timer = setInterval(run, job.interval);
        // 修正 nextRun：如果是 setInterval，下次执行是当前时间 + interval
        job.nextRun = new Date(Date.now() + job.interval);
    }

    updateJobInterval(name, newInterval) {
        const job = this.jobs.get(name);
        if (!job) throw new Error(`Job ${name} not found`);
        
        const interval = parseInt(newInterval);
        if (isNaN(interval) || interval < 1000) {
            throw new Error('Invalid interval (min 1000ms)');
        }

        logger.info(`[JobManager] Updating interval for ${name}: ${job.interval} -> ${interval}ms`);
        
        // 保留原有 callback 和状态，重启定时器
        const callback = job.callback;
        this.stop(name);
        this.schedule(name, interval, callback);
    }

    async runJob(name) {
        // 1. 尝试本地运行
        const job = this.jobs.get(name);
        
        if (job) {
            // ... 原有的本地运行逻辑 ...
            if (job.status === 'running') {
                logger.warn(`[JobManager] Job ${name} is already running, skipping manual run.`);
                return;
            }

            job.status = 'running';
            const startTime = Date.now();
            logger.info(`[JobManager] Manually starting job: ${name}`);

            try {
                await job.callback();
                const duration = Date.now() - startTime;
                job.status = 'idle';
                job.lastRun = new Date();
                job.lastResult = `Manual Run Success (${duration}ms)`;
                
                logger.info(`[JobManager] Manual job completed: ${name} in ${duration}ms`);

                // 重置定时器
                if (job.timer) clearInterval(job.timer);
                
                const run = async () => {
                    job.status = 'running';
                    const t0 = Date.now();
                    logger.info(`[JobManager] Starting job: ${name}`);
                    try {
                        await job.callback();
                        const d = Date.now() - t0;
                        job.status = 'idle';
                        job.lastRun = new Date();
                        job.lastResult = `Success (${d}ms)`;
                        job.nextRun = new Date(Date.now() + job.interval);
                        logger.info(`[JobManager] Job completed: ${name} in ${d}ms`);
                    } catch (err) {
                        const d = Date.now() - t0;
                        job.status = 'failed';
                        job.lastRun = new Date();
                        job.lastResult = `Failed: ${err.message}`;
                        job.nextRun = new Date(Date.now() + job.interval);
                        logger.error(`[JobManager] Job failed: ${name} in ${d}ms. Error: ${err.message}`);
                    }
                };
                
                job.timer = setInterval(run, job.interval);
                job.nextRun = new Date(Date.now() + job.interval);

            } catch (error) {
                const duration = Date.now() - startTime;
                job.status = 'failed';
                job.lastRun = new Date();
                logger.error(`[JobManager] Manual job failed: ${name} in ${duration}ms. Error: ${error.message}`);
                throw error;
            }
            return;
        }

        // 2. 尝试远程触发 (Go Service)
        if (!this.redis) {
            throw new Error("Redis not initialized for remote jobs");
        }

        logger.info(`[JobManager] Job ${name} not found locally, sending remote trigger...`);
        try {
            // Publish to 'cmd:job:trigger' (RedisService will add prefix)
            const count = await this.redis.publish('cmd:job:trigger', name);
            if (count > 0) {
                logger.info(`[JobManager] Remote trigger sent for ${name} (Subscribers: ${count})`);
            } else {
                logger.warn(`[JobManager] Remote trigger sent for ${name} but no subscribers received it (Go service might be down)`);
            }
        } catch (err) {
            logger.error(`[JobManager] Failed to trigger remote job: ${err.message}`);
            throw err;
        }
    }

    stop(name) {
        const job = this.jobs.get(name);
        if (job && job.timer) {
            clearInterval(job.timer);
            job.timer = null;
            job.status = 'stopped';
            logger.info(`[JobManager] Job stopped: ${name}`);
        }
    }

    stopAll() {
        for (const name of this.jobs.keys()) {
            this.stop(name);
        }
    }

    getJobStatus(name) {
        return this.jobs.get(name);
    }
    
    async getAllJobs() {
        // 1. 获取本地 Node.js 任务
        const localJobs = Array.from(this.jobs.values()).map(j => ({
            name: j.name,
            description: j.description,
            interval: j.interval,
            lastRun: j.lastRun,
            nextRun: j.nextRun,
            lastResult: j.lastResult,
            status: j.status
        }));

        // 2. 获取远程 Go Service 任务状态
        // 如果 Redis 未就绪，直接返回本地任务
        if (!this.redis) {
            return localJobs;
        }

        const remoteKeys = ['sys:job:token_refresh', 'sys:job:db_sync'];
        const remoteJobs = [];

        try {
            for (const key of remoteKeys) {
                const val = await this.redis.get(key);
                if (val) {
                    try {
                        const jobData = JSON.parse(val);
                        remoteJobs.push({
                            name: jobData.name,
                            description: jobData.description,
                            interval: jobData.interval,
                            lastRun: jobData.lastRun, // String (ISO) from Go json.Marshal
                            nextRun: jobData.nextRun,
                            lastResult: jobData.lastResult,
                            status: jobData.status,
                            isRemote: true // 标记为远程任务
                        });
                    } catch (e) {
                        logger.warn(`[JobManager] Failed to parse remote job data for ${key}: ${e.message}`);
                    }
                }
            }
        } catch (err) {
            logger.error(`[JobManager] Failed to fetch remote jobs: ${err.message}`);
        }

        return [...localJobs, ...remoteJobs];
    }
}

module.exports = new JobManager();
