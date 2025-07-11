import { Worker } from 'bullmq';
import { performMultipleDeepScan } from '../services/deepScanService.js';
import db from '../services/firestoreService.js';
import admin from 'firebase-admin';
import { connection } from './queue.js';

const worker = new Worker('analysisQueue', async job => {
  const { brandName, category, competitorUrls } = job.data;
  console.log(`Processing job ${job.id} for brand: ${brandName}`);
  console.log(`🔍 Job details - ID: ${job.id}, Name: ${job.name}, Data:`, JSON.stringify(job.data, null, 2));
  const analysis = await performMultipleDeepScan(competitorUrls, brandName, category);
  return analysis;
}, { 
  connection,
  concurrency: 1,
  limiter: {
    max: 5,
    duration: 60000,
  },
});

worker.on('completed', async (job, result) => {
  try {
    console.log(`🎯 Saving job ${job.id} results to Firestore document: deepScans/${job.id}`);
    const docRef = db.collection('deepScans').doc(job.id);
    const dataToSave = {
      ...job.data,
      ...result,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await docRef.set(dataToSave);
    console.log(`✅ Job ${job.id} completed and results saved to Firestore.`);
  } catch (error) {
    console.error(`❌ Failed to save job ${job.id} results to Firestore:`, error);
  }
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message, err.stack);
});

console.log('Worker is ready for jobs on analysisQueue.');