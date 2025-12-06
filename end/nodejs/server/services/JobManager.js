const logger = require('./LoggerService');

class JobManager {
    constructor() {
        this.jobs = new Map(); // name -> { interval, timer, lastRun, status, callback }
        this.isRunning = false;
    }

    /**
     * 注册并启动一个定时任务
     * @param {string} name 任务名称
     * @param {string|number} interval 时间间隔 (ms) 或 cron 表达式 (暂仅支持 ms)
     * @param {function} callback 任务回调函数
     */
    schedule(name, interval, callback) {
        if (this.jobs.has(name)) {
            this.stop(name);
        }

        const job = {
            name,
            interval,
            callback,
            lastRun: null,
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
                logger.info(`[JobManager] Job completed: ${name} in ${duration}ms`);
            } catch (error) {
                const duration = Date.now() - startTime;
                job.status = 'failed';
                job.lastRun = new Date();
                logger.error(`[JobManager] Job failed: ${name} in ${duration}ms. Error: ${error.message}`);
            }
        };

        // 立即执行一次 (可选，这里选择不立即执行，等待 interval)
        // run(); 

        job.timer = setInterval(run, job.interval);
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
    
    getAllJobs() {
        return Array.from(this.jobs.values()).map(j => ({
            name: j.name,
            interval: j.interval,
            lastRun: j.lastRun,
            status: j.status
        }));
    }
}

module.exports = new JobManager();
