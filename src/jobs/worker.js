import 'dotenv/config';
import { Worker } from 'bullmq';
import { performMultipleDeepScan } from '../services/deepScanService.js';
import db from '../services/firestoreService.js';
import admin from 'firebase-admin';
import { connection } from './queue.js';

const worker = new Worker('analysisQueue', async job => {
  const { brandName, category, competitorUrls } = job.data;
  console.log(`🚀 [WORKER] Starting job ${job.id} for brand: ${brandName}`);
  console.log(`🔍 [WORKER] Job details - ID: ${job.id}, Name: ${job.name}, Data:`, JSON.stringify(job.data, null, 2));
  
  // Add job isolation check
  const jobStartTime = new Date().toISOString();
  console.log(`⏰ [WORKER] Job ${job.id} started at: ${jobStartTime}`);
  
  const analysis = await performMultipleDeepScan(competitorUrls, brandName, category);
  
  console.log(`✅ [WORKER] Job ${job.id} for brand: ${brandName} completed successfully`);
  return analysis;
}, { 
  connection,
  concurrency: 1,
  limiter: {
    max: 20, // Max 20 jobs
    duration: 60000, // per 60 seconds
  },
});

worker.on('completed', async (job, result) => {
  try {
    const { brandName } = job.data;
    console.log(`🎯 [WORKER] Saving job ${job.id} (${brandName}) results to Firestore document: deepScans/${job.id}`);
    const docRef = db.collection('deepScans').doc(job.id);
    
    // Extract the actual analysis data from the result structure
    const analysisData = result.success && result.data ? result.data : result;
    
    const dataToSave = {
      ...job.data,
      ...analysisData, // Save the actual analysis data, not the wrapper
      success: result.success,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    console.log(`📊 [WORKER] Data structure being saved for ${brandName}:`, JSON.stringify(Object.keys(dataToSave), null, 2));
    await docRef.set(dataToSave);
    console.log(`✅ [WORKER] Job ${job.id} (${brandName}) completed and results saved to Firestore.`);
  } catch (error) {
    console.error(`❌ [WORKER] Failed to save job ${job.id} results to Firestore:`, error);
  }
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message, err.stack);
});

console.log('Worker is ready for jobs on analysisQueue.');