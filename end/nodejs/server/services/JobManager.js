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
        const job = this.jobs.get(name);
        if (!job) throw new Error(`Job ${name} not found`);

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

            // 重置定时器，让下一次自动执行从现在开始计算
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
            nextRun: j.nextRun,
            lastResult: j.lastResult,
            status: j.status
        }));
    }
}

module.exports = new JobManager();
