import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import DeepScanService from './services/deepScanService.js';
import { generatePdfFromHtml, generateProfessionalPdfHtml } from './services/pdfGenerator.js';

// --- SERVER SETUP ---
const app = express();
const port = process.env.PORT || 10000;
const deepScanService = new DeepScanService(process.env.OPENAI_API_KEY);

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
app.post('/deep-scan', apiKeyAuth, async (req, res) => {
  try {
    const { brandName, category, competitorUrls } = req.body;
    const result = await deepScanService.performMultipleDeepScan(competitorUrls, brandName, category);
    if (result.success) {
      return res.status(200).json(result);
    }
    throw new Error(result.error || 'Deep scan service failed.');
  } catch (error) {
    console.error('Deep Scan Endpoint Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PDF Export Endpoint: Receives report data and generates a PDF file.
app.post('/export-pdf', apiKeyAuth, async (req, res) => {
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