import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import crypto from 'crypto';
import { generatePdfFromHtml, generateProfessionalPdfHtml } from './services/pdfGenerator.js';
import { analysisQueue } from './jobs/queue.js';
import db from './services/firestoreService.js';
import rateLimit from 'express-rate-limit';

// --- SERVER SETUP ---
const app = express();
const port = process.env.PORT || 10000;

// Trust proxy for proper rate limiting behind load balancers
app.set('trust proxy', 1);

app.use(express.json({ limit: '10mb' })); // Allow large JSON payloads
app.use(cors()); // Allow requests from your frontend

// --- ROUTE-SPECIFIC RATE LIMITERS ---
// Limits each IP to 20 requests per minute across all endpoints
// Limit deep-scan creation to 5 per minute per IP
const deepScanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

// Allow frequent polling: up to 120 per minute per IP
const statusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

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
    console.log(`🚀 Received deep scan request for: ${req.body.brandName}`);
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

    console.log(`📝 Adding job to queue with ID: ${fingerprint}`);
    const job = await analysisQueue.add(
      'deepScan', 
      { brandName, category, competitorUrls },
      { jobId: fingerprint } // This prevents duplicate jobs
    );
    
    console.log(`🎯 Job ${job.id} queued for brand: ${brandName} (${competitorUrls.length} competitors)`);
    
    // Log queue status
    const waiting = await analysisQueue.getWaiting();
    const active = await analysisQueue.getActive();
    console.log(`📊 Queue Status - Waiting: ${waiting.length}, Active: ${active.length}`);
    return res.status(202).json({ jobId: job.id });
  } catch (error) {
    console.error('Deep Scan Queueing Error:', error);
    if (error.message.includes('429') || error.message.includes('rate limit')) {
      console.error('🚨 RATE LIMIT ERROR DETECTED:', error);
    }
    return res.status(500).json({ message: error.message });
  }
});

// Polling endpoint to check job status and fetch result
app.get(['/analysis-status/:jobId', '/api/analysis-status/:jobId'], apiKeyAuth, statusLimiter, async (req, res) => {
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
      const firestoreData = doc.data();
      console.log(`✅ Job ${jobId} result found in Firestore`);
      console.log(`📊 Firestore data keys:`, Object.keys(firestoreData));
      console.log(`🔍 Has detailedAgentReports:`, !!firestoreData.detailedAgentReports);
      console.log(`🔍 Has analysis:`, !!firestoreData.analysis);
      console.log(`🔍 Has competitorsAnalyzed:`, !!firestoreData.competitorsAnalyzed);
      
      // Log the actual data structure being sent to frontend
      console.log(`📤 Sending to frontend:`, {
        state: response.state,
        progress: response.progress,
        resultKeys: Object.keys(firestoreData),
        hasDeepScanData: !!firestoreData.detailedAgentReports,
        analysisLength: firestoreData.analysis?.length || 0,
        competitorsCount: firestoreData.competitorsAnalyzed?.length || 0
      });
      
      // Restructure the data to match what frontend expects
      // Extract the core analysis data and put it at the top level
      const restructuredData = {
        // Core analysis data (what frontend expects)
        analysis: firestoreData.analysis,
        detailedAgentReports: firestoreData.detailedAgentReports,
        competitorsAnalyzed: firestoreData.competitorsAnalyzed,
        
        // Additional metadata (preserved but not at top level)
        metadata: {
          brandName: firestoreData.brandName,
          category: firestoreData.category,
          competitorUrls: firestoreData.competitorUrls,
          timestamp: firestoreData.timestamp,
          success: firestoreData.success,
          createdAt: firestoreData.createdAt
        }
      };
      
      response.result = restructuredData;
    } else if (state === 'failed') {
      response.error = job.failedReason;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error(`❌ Status Endpoint Error for jobId ${jobId}:`, error);
    return res.status(500).json({ message: error.message });
  }
});

// View Report Endpoint: Get report data by brand name and category
app.get(['/view-report', '/api/view-report'], apiKeyAuth, async (req, res) => {
  try {
    const { brandName, category } = req.query;
    console.log(`🔍 View report request for: ${brandName} in ${category}`);
    
    if (!brandName) {
      return res.status(400).json({ message: 'brandName is required' });
    }

    // Search for the most recent report for this brand
    const reportsRef = db.collection('deepScans');
    const snapshot = await reportsRef
      .where('brandName', '==', brandName)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log(`❌ No reports found for brand: ${brandName}`);
      return res.status(404).json({ message: 'Report not found' });
    }

    const doc = snapshot.docs[0];
    const reportData = doc.data();
    
    console.log(`✅ Found report for ${brandName}:`, {
      jobId: doc.id,
      hasDeepScanData: !!reportData.detailedAgentReports,
      analysisLength: reportData.analysis?.length || 0
    });

    // Restructure the data to match what frontend expects
    const restructuredData = {
      // Core analysis data (what frontend expects)
      analysis: reportData.analysis,
      detailedAgentReports: reportData.detailedAgentReports,
      competitorsAnalyzed: reportData.competitorsAnalyzed,
      
      // Additional metadata (preserved but not at top level)
      metadata: {
        brandName: reportData.brandName,
        category: reportData.category,
        competitorUrls: reportData.competitorUrls,
        timestamp: reportData.timestamp,
        success: reportData.success,
        createdAt: reportData.createdAt
      }
    };

    return res.status(200).json({
      success: true,
      data: restructuredData,
      jobId: doc.id
    });
  } catch (error) {
    console.error('View Report Endpoint Error:', error);
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