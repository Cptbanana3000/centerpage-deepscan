import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null, // Required by BullMQ v4 (avoids deprecation warning)
});

// Default job retention: remove completed immediately, keep last 100 failures
const defaultJobOptions = {
  removeOnComplete: { age: 3600 },
  removeOnFail: 100,
};

// Queue that will hold deep-scan jobs
const analysisQueue = new Queue('analysisQueue', {
  connection,
  defaultJobOptions,
});

export { analysisQueue, connection };