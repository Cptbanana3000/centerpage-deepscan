import 'dotenv/config';
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
  concurrency: 4,
  // Removed rate limiter to allow multiple concurrent scans
  // If you need rate limiting, implement it at the API level per user
});

worker.on('completed', async (job, result) => {
  try {
    console.log(`🎯 Saving job ${job.id} results to Firestore document: deepScans/${job.id}`);
    const docRef = db.collection('deepScans').doc(job.id);
    
    // Extract the actual analysis data from the result structure
    const analysisData = result.success && result.data ? result.data : result;
    
    const dataToSave = {
      ...job.data,
      ...analysisData, // Save the actual analysis data, not the wrapper
      success: result.success,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    console.log(`📊 Data structure being saved:`, JSON.stringify(Object.keys(dataToSave), null, 2));
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