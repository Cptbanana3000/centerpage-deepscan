import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  lazyConnect: true,
  // Set Redis configuration to prevent eviction
  commandTimeout: 5000,
  retryDelayOnClusterDown: 300,
  maxRetriesPerRequest: null,
});

// Test Redis connection
connection.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

connection.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

connection.on('ready', async () => {
  console.log('✅ Redis is ready');
  
  // Set Redis eviction policy to noeviction to prevent data loss
  try {
    await connection.config('SET', 'maxmemory-policy', 'noeviction');
    console.log('✅ Redis eviction policy set to noeviction');
  } catch (error) {
    console.warn('⚠️ Could not set Redis eviction policy:', error.message);
  }
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