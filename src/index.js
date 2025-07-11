import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import crypto from 'crypto';
import { generatePdfFromHtml, generateProfessionalPdfHtml } from './services/pdfGenerator.js';
import { analysisQueue } from './jobs/queue.js';
import db from './services/firestoreService.js';

// --- SERVER SETUP ---
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' })); // Allow large JSON payloads
app.use(cors()); // Allow requests from your frontend

// --- SECURITY MIDDLEWARE ---
// This function acts as a bouncer, checking for the secret API key.
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === process.env.BACKEND_API_KEY) {
    return next(); // Key is correct, proceed.
  }
  return res.status(401).json({ message: 'Unauthorized' }); // Block the request.
};

// --- API ENDPOINTS ---

// Health Check: A simple endpoint to confirm the service is running.
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Deep Scan Endpoint: Receives a request and performs the web scraping.
app.post(['/deep-scan', '/api/deep-scan'], apiKeyAuth, async (req, res) => {
  try {
    const { brandName, category, competitorUrls } = req.body;

    if (!brandName || !Array.isArray(competitorUrls) || competitorUrls.length === 0) {
      return res.status(400).json({ message: 'brandName and competitorUrls are required.' });
    }

    // Create deterministic jobId to prevent duplicates
    const sortedUrls = [...competitorUrls].sort();
    const fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify({ brandName, category: category || 'General', competitorUrls: sortedUrls }))
      .digest('hex')
      .substring(0, 16); // Use first 16 chars for shorter jobId

    const job = await analysisQueue.add(
      'deepScan', 
      { brandName, category, competitorUrls },
      { jobId: fingerprint } // This prevents duplicate jobs
    );
    
    console.log(`🎯 Job ${job.id} queued for brand: ${brandName} (${competitorUrls.length} competitors)`);
    return res.status(202).json({ jobId: job.id });
  } catch (error) {
    console.error('Deep Scan Queueing Error:', error);
    return res.status(500).json({ message: error.message });
  }
});

// Polling endpoint to check job status and fetch result
app.get(['/analysis-status/:jobId', '/api/analysis-status/:jobId'], apiKeyAuth, async (req, res) => {
  const { jobId } = req.params;
  console.log(`🔍 Status check for jobId: ${jobId}`);
  
  try {
    const job = await analysisQueue.getJob(jobId);
    if (!job) {
      console.log(`❌ Job ${jobId} not found in queue`);
      return res.status(404).json({ message: 'Job not found' });
    }

    const state = await job.getState();
    const progress = typeof job.progress === 'number' ? job.progress : 0;
    console.log(`📊 Job ${jobId} state: ${state}, progress: ${progress}`);
    
    const response = { state, progress };

    if (state === 'completed') {
      console.log(`🔍 Job ${jobId} completed, fetching from Firestore: deepScans/${jobId}`);
      const docRef = db.collection('deepScans').doc(jobId);
      const doc = await docRef.get();
      if (!doc.exists) {
        console.log(`❌ Job ${jobId} completed but no Firestore document found`);
        return res.status(404).json({ message: 'Result not found in database.' });
      }
      console.log(`✅ Job ${jobId} result found in Firestore`);
      response.result = doc.data();
    } else if (state === 'failed') {
      response.error = job.failedReason;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error(`❌ Status Endpoint Error for jobId ${jobId}:`, error);
    return res.status(500).json({ message: error.message });
  }
});

// PDF Export Endpoint: Receives report data and generates a PDF file.
app.post(['/export-pdf', '/api/export-pdf'], apiKeyAuth, async (req, res) => {
  try {
    const { analysisData, brandName, category } = req.body;
    const html = generateProfessionalPdfHtml(analysisData, brandName, category);
    const pdfBuffer = await generatePdfFromHtml(html);
    
    const filename = `${brandName.replace(/[^a-zA-Z0-9]/g, '-')}-report.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF Export Endpoint Error:', error);
    return res.status(500).json({ message: error.message });
  }
});

// --- START THE SERVER ---
app.listen(port, () => {
  console.log(`Backend service is live on port ${port}`);
});