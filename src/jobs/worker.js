import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import DeepScanService from '../services/deepScanService.js';

// Separate connection for the worker process
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null, // suppress BullMQ deprecation warning
});

const deepScanService = new DeepScanService(process.env.OPENAI_API_KEY);

// Worker to process jobs from the queue
const worker = new Worker(
  'analysisQueue',
  async (job) => {
    const { competitorUrls, brandName, category } = job.data;

    try {
      job.updateProgress(0);
      const result = await deepScanService.performMultipleDeepScan(
        competitorUrls,
        brandName,
        category,
        (percent) => job.updateProgress(percent)
      );
      return result;
    } catch (err) {
      console.error(`❌ Job ${job.id} failed:`, err);
      throw err; // BullMQ will mark as failed
    }
  },
  { connection }
);

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed.`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err);
}); 