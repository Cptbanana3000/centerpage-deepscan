import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

// Test Redis connection
connection.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

connection.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

connection.on('ready', () => {
  console.log('✅ Redis is ready');
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