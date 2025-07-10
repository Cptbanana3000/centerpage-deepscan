import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

const defaultJobOptions = {
  removeOnComplete: { age: 3600 },
  removeOnFail: 100,
};

export const analysisQueue = new Queue('analysisQueue', {
  connection,
  defaultJobOptions,
});

export { connection };