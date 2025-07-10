import 'dotenv/config';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { performMultipleDeepScan } from '../services/deepScanService.js';
import db from '../services/firestoreService.js';
import admin from 'firebase-admin';

// Load environment variables
import 'dotenv/config';

const connection = new Redis(process.env.REDIS_URL, { 
    maxRetriesPerRequest: null,
    enableReadyCheck: false
});

console.log('✅ Worker is ready for jobs.');

const worker = new Worker('analysisQueue', async (job) => {
    const { competitorUrls, brandName, category } = job.data;
    console.log(`Processing job ${job.id} for brand: ${brandName}`);

    try {
        const result = await performMultipleDeepScan(competitorUrls, brandName, category);

        if (!result.success) {
            throw new Error(result.error || 'Analysis failed with no specific error message.');
        }
        
        console.log(`✅ Job ${job.id} completed.`);
        return result;
    } catch (error) {
        console.error(`❌ Job ${job.id} failed:`, error.message);
        throw error; // Re-throw the error to mark the job as failed in BullMQ
    }
}, { 
    connection,
    concurrency: 1, // Process one job at a time
    limiter: { // Limit to 5 jobs per 60 seconds to avoid overwhelming the system
        max: 5,
        duration: 60000
    },
    // Increase timeout to 5 minutes to handle long-running analyses
    lockDuration: 300000 
}); 

worker.on('completed', async (job, result) => {
    try {
        const docRef = db.collection('deepScans').doc(job.id);
        const dataToSave = {
            ...job.data,
            analysisResult: result,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await docRef.set(dataToSave);
        console.log(`Job ${job.id} completed and results saved to Firestore.`);
    } catch (error) {
        console.error(`Failed to save job ${job.id} results to Firestore:`, error);
    }
});

worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} failed:`, err.message, err.stack);
});

console.log('Worker is ready for jobs on analysisQueue.');