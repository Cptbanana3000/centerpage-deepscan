Project Brief: Decoupling Intensive Services from the centerpage Frontend
Objective:
Our primary goal is to refactor the https://github.com/Cptbanana3000/centerpage.git monorepo. We need to extract the resource-intensive, long-running tasks—specifically the Puppeteer-based web scraping (DeepScanService) and PDF generation—into a new, dedicated backend service. The existing Next.js application will be refactored to communicate with this new service via a secure API.

Problem Analysis:
The current architecture executes Puppeteer within Next.js API routes, which are hosted on Vercel's serverless infrastructure. This is causing two major problems:

Environment Limitations: Serverless functions on Vercel have strict execution time limits (e.g., 10-60 seconds) and memory caps. Web scraping and PDF generation are long-running and memory-heavy processes that frequently exceed these limits, causing timeouts and failures.

Deployment Instability: The dependencies required for Puppeteer (@sparticuz/chromium) are large and complex, leading to slower, more fragile deployments on Vercel.

Proposed Architecture: The Proxy Pattern

We will move to a decoupled, two-service architecture:

centerpage (Next.js Frontend on Vercel):

Role: Remains the user-facing application. It will handle all UI, user authentication, and initial requests.

Key Change: Its API routes (/api/deep-scan, /api/export-pdf) will no longer contain the core logic. Instead, they will act as secure proxies. They will perform user authentication and credit checks first, then pass the validated request to our new backend service.

centerpage-backend (Node.js/Express on Render):

Role: A new, standalone microservice dedicated to running Puppeteer tasks.

Functionality: It will expose its own internal API with two endpoints: one for deep scans and one for PDF exports. This service will be optimized for long-running, memory-intensive workloads.

This model allows each platform to do what it does best: Vercel for fast, scalable frontend delivery, and Render for reliable, long-running backend processes.

Execution Plan:
1. Create the New Backend Service (centerpage-backend)

Technology Stack: Node.js with Express.

Core Logic Migration:

Migrate the entire DeepScanService class from src/services/deepscan.js into the new service.

Migrate the generatePdfFromHtml and generateProfessionalPdfHtml functions from src/app/api/export-pdf/route.js into the new service.

API Implementation:

Create a POST /deep-scan endpoint that accepts { brandName, category, competitorUrls }, runs the DeepScanService, and returns the resulting JSON data.

Create a POST /export-pdf endpoint that accepts { analysisData, brandName, ... }, runs the PDF generation logic, and returns the PDF file buffer.

Security: This service's endpoints must be protected. Implement a simple API key check. The key will be passed in an x-api-key header from our Next.js proxy.

2. Refactor the Next.js Frontend (centerpage)

API Route Transformation (Proxying):

Go into src/app/api/deep-scan/route.js. Remove the call to the local DeepScanService.

Keep the user authentication (verifyIdToken) and credit deduction (databaseService.checkAndDeductCredits) logic.

After the checks pass, make an axios or fetch call to the new EXTERNAL_BACKEND_URL/deep-scan endpoint, forwarding the request body and including the secret EXTERNAL_BACKEND_API_KEY in the headers.

If the backend call fails, it's crucial to refund the user's credit.

Repeat the same refactoring process for src/app/api/export-pdf/route.js.

Dependency and Configuration Cleanup:

Uninstall the heavy dependencies from the Next.js project's package.json: puppeteer-core, @sparticuz/chromium, and cheerio.

Remove the experimental.serverComponentsExternalPackages configuration from next.config.mjs, as it is no longer needed.


deepscan.js


// Enhanced Deep Scan Service - v2.9 (Category-Aware)
// This version integrates the 'category' context into the Deep Scan analysis,
// making the AI reports significantly more specialized and insightful.

// --- Core Dependencies ---
const OpenAI = require('openai');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer'); // Use the full puppeteer library
const { getDomain } = require('tldts');

class DeepScanService {
  /**
   * Initializes the service with necessary API keys.
   * @param {string} openaiApiKey - Your OpenAI API key.
   */
  constructor(openaiApiKey) {
    if (!openaiApiKey && !process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is required for DeepScanService');
    }
    
    this.openai = new OpenAI({
      apiKey: openaiApiKey || process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Performs a comprehensive analysis of a single competitor URL, now with category context.
   * @param {string} competitorUrl - The URL of the competitor's website.
   * @param {string} userBrandName - The user's brand name for context.
   * @param {string} category - The industry category for tailored analysis.
   * @returns {Promise<object>} - An object containing the scan results.
   */
  async performDeepScan(competitorUrl, userBrandName, category = 'General') {
    try {
      console.log(`🔍 Starting Enhanced Deep Scan for: ${competitorUrl} in category: ${category}`);
      const analyzedData = await this.analyzeWebsite(competitorUrl);
      // Pass the category to the AI analysis function
      const analysis = await this.generateAIAnalysis(analyzedData, userBrandName, category);
      
      return {
        success: true,
        competitorUrl: competitorUrl,
        analyzedData: analyzedData,
        analysis: analysis,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`[DeepScanService] Top-level error for ${competitorUrl}:`, error.message);
      return {
        success: false,
        error: error.message,
        competitorUrl: competitorUrl
      };
    }
  }

  /**
   * Analyzes a website using Puppeteer. (No changes needed here for category).
   * @param {string} url - The URL to analyze.
   * @returns {Promise<object>} - A detailed object of website data.
   */
  async analyzeWebsite(url) {
    // Validate and clean URL
    if (!/^(https?:\/\/)/i.test(url)) {
        url = 'https://' + url;
      }
    
    // Basic URL validation
    try {
      new URL(url);
    } catch (e) {
      throw new Error(`Invalid URL format: ${url}`);
    }

    console.log(`📡 Attempting browser analysis for: ${url}`);
    
    // Try Puppeteer first, fall back to simple HTTP if it fails
    try {
      return await this.analyzWithPuppeteer(url);
    } catch (puppeteerError) {
      console.warn(`⚠️ Puppeteer failed for ${url}, trying fallback method:`, puppeteerError.message);
      return await this.analyzeWithFallback(url);
    }
  }

  /**
   * Analyzes website using Puppeteer (original method)
   */
  async analyzWithPuppeteer(url) {
    console.log(`📡 Launching headless browser to analyze: ${url}`);
    let browser;
    try {
      let launchOptions = {
        args: [
          '--no-sandbox', 
          '--disable-dev-shm-usage', 
          '--disable-gpu',
          '--disable-setuid-sandbox',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-extensions'
        ],
        headless: true,
        timeout: 30000
      };

      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();
      
      // Set longer timeout and better error handling
      await page.setDefaultNavigationTimeout(30000);
      await page.setDefaultTimeout(30000);
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (navigationError) {
        console.warn(`⚠️ Navigation timeout for ${url}, trying with reduced wait conditions...`);
        await page.goto(url, { waitUntil: 'load', timeout: 15000 });
      }
      const finalUrl = page.url();
      const htmlContent = await page.content();
      const $ = cheerio.load(htmlContent);

      const techClues = this.extractTechClues($);
      const technologies = await this.detectTechnologiesAI(techClues, finalUrl);
      
      const performanceMetrics = await page.evaluate(() => {
        const paintTimings = performance.getEntriesByType('paint');
        const fcp = paintTimings.find(entry => entry.name === 'first-contentful-paint')?.startTime;
        const navTiming = performance.getEntriesByType("navigation")[0];
        
        return {
          firstContentfulPaint: fcp ? `${fcp.toFixed(0)} ms` : 'N/A',
          domLoadTime: navTiming ? `${(navTiming.domContentLoadedEventEnd - navTiming.startTime).toFixed(0)} ms` : 'N/A',
          pageLoadTime: navTiming ? `${(navTiming.loadEventEnd - navTiming.startTime).toFixed(0)} ms` : 'N/A',
        };
      });

      const analyzedData = {
        url: finalUrl,
        title: $('title').text().trim() || 'No title found',
        metaDescription: $('meta[name="description"]').attr('content')?.trim() || 'No meta description found',
        h1: $('h1').first().text().trim() || 'No H1 found',
        h2Count: $('h2').length,
        h3Count: $('h3').length,
        wordCount: this.estimateWordCount($('body').text()),
        internalLinks: this.countLinks($, finalUrl, true),
        externalLinks: this.countLinks($, finalUrl, false),
        images: $('img').length,
        imagesWithAlt: $('img[alt][alt!=""]').length,
        schemaMarkup: $('script[type="application/ld+json"]').length > 0,
        canonicalUrl: $('link[rel="canonical"]').attr('href') || null,
        metaRobots: $('meta[name="robots"]').attr('content') || null,
        performance: performanceMetrics,
        technologyStack: technologies,
      };

      console.log(`✅ Analysis complete for ${finalUrl}`);
      return analyzedData;

    } catch (error) {
      console.error(`[AnalyzeWebsite] Failed for ${url}:`, error.message);
      throw new Error(`Failed to analyze ${url}: ${error.message}`);
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Extracts clues from the HTML for the AI to analyze.
   */
  extractTechClues($) {
    const scripts = [];
    $('script[src]').each((_, el) => {
      scripts.push($(el).attr('src'));
    });

    const links = [];
    $('link[href]').each((_, el) => {
      links.push($(el).attr('href'));
    });
    
    const generator = $('meta[name="generator"]').attr('content');

    return { scripts, links, generator };
  }

  /**
   * Uses AI to detect technologies based on HTML clues.
   */
  async detectTechnologiesAI(techClues, url) {
    console.log(`🤖 Detecting technologies with AI for: ${url}`);
    const prompt = `
      You are a web technology expert. Based on the following list of JavaScript files, CSS files, and generator tags from the website ${url}, identify the key technologies being used.
      Focus on major frameworks, platforms, and analytics tools.
      Return ONLY as a JSON array of strings. Example: { "technologies": ["React", "Shopify"] }
    `;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [{ role: "system", content: "You are a web technology expert that returns only JSON." }, { role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0].message.content);
      const techArray = result.technologies || result.tech || (Array.isArray(result) ? result : []);
      
      if (Array.isArray(techArray)) {
         console.log(`[AI Tech Detection] Detected: ${techArray.join(', ') || 'None'}`);
         return techArray;
      }
      return [];
    } catch (error) {
      console.error("[AI Tech Detection] Failed:", error.message);
      return [];
    }
  }

  /**
   * ENHANCED: Generates a sophisticated AI analysis tailored to a specific industry category.
   * @param {object} analyzedData - The data from analyzeWebsite.
   * @param {string} userBrandName - The user's brand for context.
   * @param {string} category - The industry category for tailored analysis.
   * @returns {Promise<string>} - The AI-generated analysis text.
   */
  async generateAIAnalysis(analyzedData, userBrandName, category) {
    console.log(`🧠 Generating category-aware AI insights for ${analyzedData.url}...`);
    const domain = new URL(analyzedData.url).hostname;

    const prompt = `
      You are "Aura," an expert-level Digital Marketing Strategist specializing in the **"${category}"** industry. Your analysis is brutally honest, data-driven, and focused on providing a decisive competitive edge.

      **Your Client's Brand Name:** "${userBrandName}"
      **Competitor Being Analyzed:** "${domain}"
      **Competitor's Industry:** "${category}"

      **Raw Competitor Data:**
\`\`\`json
${JSON.stringify(analyzedData, null, 2)}
\`\`\`

      **Your Task:**
      Generate a DEEP SCAN ANALYSIS report. As an expert in the "${category}" space, focus on the most critical factors for this industry.
      
      **Industry-Specific Focus Areas:**
      - If "Tech & SaaS": Analyze scalability, API mentions, and the modernity of the technologyStack.
      - If "E-commerce & Retail": Focus on user experience signals, product schema, and conversion-oriented language.
      - If "Games & Entertainment": Look for signs of community engagement, rich media, and event-based content.
      - If "Health & Wellness": Assess trustworthiness signals, certifications, and the clarity of information.
      - If "Blog / Content Site": Word count, heading structure (h2/h3), and performance are paramount.

      **Report Structure:**
      1.  **## Executive Summary:** Your overall assessment of this competitor *within their industry*.
      2.  **## Technical Analysis:** Evaluate their technical foundation based on your industry focus. Are they technically strong *for a ${category} company*?
      3.  **## Content & Marketing Strategy:** Analyze their content's depth, focus, and effectiveness *for their target market*.
      4.  **## Key Vulnerabilities:** Identify 3-4 specific weaknesses for "${userBrandName}" to exploit, tailored to the industry.
      5.  **## Actionable Battle Plan:** Provide concrete actions for "${userBrandName}" to outperform this competitor in the "${category}" market.
    `;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4.1-mini", // Using mini for speed in deep scans
        messages: [{ role: "system", content: `You are Aura, an expert marketing strategist for the ${category} industry.` }, { role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.4,
      });

      console.log('✅ AI analysis completed.');
      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error('[AIAnalysis] OpenAI API call failed:', error.message);
      throw new Error(`Failed to generate AI analysis: ${error.message}`);
    }
  }

  /**
   * Performs a multi-competitor scan, now with category context.
   * @param {string[]} competitorUrls - An array of competitor URLs.
   * @param {string} brandName - The user's brand name.
   * @param {string} category - The industry category for tailored analysis.
   */
  async performMultipleDeepScan(competitorUrls, brandName, category = 'General') {
    console.log(`🚀 Starting multi-competitor deep scan for brand: ${brandName} in category: ${category}`);
    try {
      const uniqueCompetitors = this.deduplicateByDomain(competitorUrls);
      console.log(`🎯 Analyzing ${uniqueCompetitors.length} unique competitors...`);
      const urlsToProcess = uniqueCompetitors.slice(0, 5);
      
      const analysisPromises = urlsToProcess.map(url => this.analyzeWebsite(url));
      const settledResults = await Promise.allSettled(analysisPromises);
      
      const successfulAnalyses = [];
      const failedAnalyses = [];
      settledResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          console.log(`✅ Successfully analyzed: ${urlsToProcess[index]}`);
          successfulAnalyses.push(result.value);
        } else {
          const failureInfo = {
            url: urlsToProcess[index],
            error: result.reason.message
          };
          failedAnalyses.push(failureInfo);
          console.error(`❌ Analysis failed for ${urlsToProcess[index]}:`, result.reason.message);
        }
      });
      
      console.log(`📊 Analysis Summary: ${successfulAnalyses.length} successful, ${failedAnalyses.length} failed`);
      
      if (successfulAnalyses.length === 0) {
        const errorDetails = failedAnalyses.map(f => `${f.url}: ${f.error}`).join(' | ');
        throw new Error(`No competitor data could be analyzed. All ${failedAnalyses.length} attempts failed: ${errorDetails}`);
      }
      
      console.log(`✅ Successfully analyzed ${successfulAnalyses.length} competitors.`);
      console.log(`🤖 Generating category-aware strategic AI comparison...`);
      // Pass the category to the comparative report generator
      const comparativeAnalysis = await this.generateComparativeAIReport(successfulAnalyses, brandName, category);
      
      return {
        success: true,
        data: {
          brandName: brandName,
          competitorsAnalyzed: successfulAnalyses,
          comparativeAnalysis: comparativeAnalysis,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('❌ Multi-competitor deep scan failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * ENHANCED: Generates a comparative report tailored to the specific industry category.
   */
  async generateComparativeAIReport(competitorsData, userBrandName, category) {
    const prompt = `
      You are "Aura," a Chief Marketing Strategist specializing in the **"${category}"** industry. You are briefing your client, "${userBrandName}", on the competitive landscape.

      **Competitors' Data:**
\`\`\`json
      ${JSON.stringify(competitorsData, null, 2)}
\`\`\`

      **Your Task:**
      Synthesize this data into a high-level STRATEGIC BATTLE PLAN tailored for a company entering the "${category}" market.
      
      **Report Structure:**
      1.  **## Market Overview:** Summarize the competitive landscape. What are the common trends, strengths, and weaknesses for **${category}** companies in this space?
      2.  **## Competitor Tier List:**
          * **Top Threat:** Identify the strongest competitor and explain why they are dominant *in this industry*.
          * **Primary Target:** Identify the most vulnerable competitor and detail their primary weaknesses.
      3.  **## The Decisive Advantage for a "${category}" Brand:** What is the single most important strategic advantage "${userBrandName}" must build to win in this specific market?
      4.  **## Immediate Quick Wins:** List 3 "quick win" actions based on common flaws you observed.
    `;

    try {
        const completion = await this.openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [{ role: "system", content: `You are Aura, a Chief Marketing Strategist for the ${category} industry.` }, { role: "user", content: prompt }],
            max_tokens: 2000,
            temperature: 0.5,
        });
        return completion.choices[0].message.content.trim();
    } catch (error) {
        console.error('[AIComparativeReport] OpenAI API call failed:', error.message);
        throw new Error('Failed to generate comparative AI report.');
    }
  }

  // --- Helper Functions (no changes needed) ---
  estimateWordCount(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  countLinks($, baseUrl, internal = true) {
    const domain = new URL(baseUrl).hostname;
    let count = 0;
    $('a[href]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (!href) return;
      try {
        const linkUrl = new URL(href, baseUrl);
        if (internal && linkUrl.hostname.includes(domain)) count++;
        if (!internal && !linkUrl.hostname.includes(domain)) count++;
      } catch (e) { /* Ignore invalid URLs */ } 
    });
    return count;
  }

  deduplicateByDomain(urls) {
    const domainMap = new Map();
    urls.forEach(url => {
      try {
        const cleanUrl = !/^(https?:\/\/)/i.test(url) ? `https://${url}` : url;
        const hostname = new URL(cleanUrl).hostname;
        const rootDomain = getDomain(hostname) || hostname;
        if (!domainMap.has(rootDomain)) domainMap.set(rootDomain, cleanUrl);
      } catch (error) {
        console.warn(`Skipping invalid URL for deduplication: ${url}`);
      }
    });
    return Array.from(domainMap.values());
  }

  /**
   * Fallback analysis method using simple HTTP requests
   */
  async analyzeWithFallback(url) {
    console.log(`🔄 Using fallback HTTP analysis for: ${url}`);
    
    try {
      const axios = (await import('axios')).default;
      
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      const finalUrl = response.request?.responseURL || url;

      const analyzedData = {
        url: finalUrl,
        title: $('title').text().trim() || 'No title found',
        metaDescription: $('meta[name="description"]').attr('content')?.trim() || 'No meta description found',
        h1: $('h1').first().text().trim() || 'No H1 found',
        h2Count: $('h2').length,
        h3Count: $('h3').length,
        wordCount: this.estimateWordCount($('body').text()),
        internalLinks: this.countLinks($, finalUrl, true),
        externalLinks: this.countLinks($, finalUrl, false),
        images: $('img').length,
        imagesWithAlt: $('img[alt][alt!=""]').length,
        schemaMarkup: $('script[type="application/ld+json"]').length > 0,
        canonicalUrl: $('link[rel="canonical"]').attr('href') || null,
        metaRobots: $('meta[name="robots"]').attr('content') || null,
        performance: {
          firstContentfulPaint: 'N/A (Fallback mode)',
          domLoadTime: 'N/A (Fallback mode)',
          pageLoadTime: 'N/A (Fallback mode)',
        },
        technologyStack: await this.detectTechnologiesFromHTML($),
        analysisMethod: 'HTTP_FALLBACK'
      };

      console.log(`✅ Fallback analysis complete for ${finalUrl}`);
      return analyzedData;

    } catch (error) {
      console.error(`[Fallback Analysis] Failed for ${url}:`, error.message);
      throw new Error(`Failed to analyze ${url} with fallback method: ${error.message}`);
    }
  }

  /**
   * Detect technologies from HTML without AI (for fallback)
   */
  async detectTechnologiesFromHTML($) {
    const technologies = [];
    
    // Check for common frameworks/platforms
    const scripts = [];
    $('script[src]').each((_, el) => {
      scripts.push($(el).attr('src'));
    });
    
    const scriptText = scripts.join(' ').toLowerCase();
    
    if (scriptText.includes('react')) technologies.push('React');
    if (scriptText.includes('vue')) technologies.push('Vue.js');
    if (scriptText.includes('angular')) technologies.push('Angular');
    if (scriptText.includes('jquery')) technologies.push('jQuery');
    if (scriptText.includes('shopify')) technologies.push('Shopify');
    if (scriptText.includes('wordpress')) technologies.push('WordPress');
    if (scriptText.includes('woocommerce')) technologies.push('WooCommerce');
    if (scriptText.includes('gtag') || scriptText.includes('analytics')) technologies.push('Google Analytics');
    
    // Check meta tags
    const generator = $('meta[name="generator"]').attr('content');
    if (generator) {
      if (generator.toLowerCase().includes('wordpress')) technologies.push('WordPress');
      if (generator.toLowerCase().includes('shopify')) technologies.push('Shopify');
      if (generator.toLowerCase().includes('squarespace')) technologies.push('Squarespace');
    }
    
    return technologies.length > 0 ? technologies : ['Unknown'];
  }
}

module.exports = DeepScanService;



pdfGeneration.js

import { NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import databaseService from '@/services/database';
import puppeteer from 'puppeteer-core';

// Import Vercel-compatible Chromium for production
let chromium;
if (process.env.NODE_ENV === 'production') {
  try {
    chromium = (await import('@sparticuz/chromium')).default;
  } catch (error) {
    console.warn('Failed to import @sparticuz/chromium:', error);
  }
}

export async function POST(request) {
  const token = request.headers.get('Authorization')?.split('Bearer ')[1];

  if (!token) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  const decodedToken = await verifyIdToken(token);
  if (!decodedToken) {
    return NextResponse.json({ message: 'Invalid authentication token' }, { status: 401 });
  }

  if (!decodedToken.email_verified) {
    return NextResponse.json({ 
      message: 'Email not verified. Please check your inbox for a verification link.',
      code: 'EMAIL_NOT_VERIFIED'
    }, { status: 403 });
  }
  
  const userId = decodedToken.uid;

  // Check and deduct deepScans credits for PDF export
  const userHasCredits = await databaseService.checkAndDeductCredits(userId, 'deepScans');
  if (!userHasCredits) {
    return NextResponse.json({
      message: 'Insufficient Deep Scan credits. PDF exports require 1 Deep Scan credit.',
      code: 'INSUFFICIENT_CREDITS'
    }, { status: 402 }); // 402 Payment Required
  }

  try {
    const { analysisData, reportData, brandName, category, deepScanData } = await request.json();
    
    // Support legacy payloads that used "reportData" instead of "analysisData"
    const finalAnalysisData = analysisData || reportData;
    
    // Attach deep scan data if available
    if (deepScanData) {
      finalAnalysisData.deepScanData = deepScanData;
      console.log('Deep scan data structure:', JSON.stringify(deepScanData, null, 2));
    }
    
    if (!finalAnalysisData || !brandName) {
      // Refund credit if required data is missing
      await databaseService.refundCredit(userId, 'deepScans');
      return NextResponse.json({ message: 'Missing required parameters' }, { status: 400 });
    }

    // Track PDF export analytics
    await databaseService.updateAnalytics('pdf_export_started', brandName, { category, userId });

    // Generate professional PDF
    const pdfHtml = generateProfessionalPdfHtml(finalAnalysisData, brandName, category);
    const pdfBuffer = await generatePdfFromHtml(pdfHtml);
    
    const filename = `${brandName.replace(/[^a-zA-Z0-9]/g, '-')}-brand-analysis-report.pdf`;

    await databaseService.updateAnalytics('pdf_export_completed', brandName, { 
      category,
      userId,
      filename: filename
    });

    // Return the raw PDF buffer directly in the response with appropriate headers.
    // This avoids base64 encoding and lets the browser handle the file directly.
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('PDF Export endpoint error:', error);
    // Refund credit on error
    await databaseService.refundCredit(userId, 'deepScans');
    await databaseService.updateAnalytics('pdf_export_error', 'unknown', { error: error.message, userId });
    
    // For errors, return a standard JSON response so the client can display the message.
    return NextResponse.json({ success: false, message: 'An error occurred during PDF export' }, { status: 500 });
  }
}

async function generatePdfFromHtml(html) {
  let browser;
  try {
    let launchOptions = {
      args: [
        '--no-sandbox', 
        '--disable-dev-shm-usage', 
        '--disable-gpu',
        '--disable-setuid-sandbox',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions'
      ],
      headless: true,
      timeout: 30000
    };

    // Use Vercel-compatible Chromium in production
    if (process.env.NODE_ENV === 'production' && chromium) {
      launchOptions.executablePath = await chromium.executablePath();
      launchOptions.args = [...launchOptions.args, ...chromium.args];
    }

    browser = await puppeteer.launch(launchOptions);
    
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      },
      printBackground: true,
      preferCSSPageSize: true
    });
    
    return pdfBuffer;
  } catch (error) {
    console.error('PDF generation failed:', error);
    throw new Error('Failed to generate PDF');
  } finally {
    if (browser) await browser.close();
  }
}

function generateProfessionalPdfHtml(analysisData, brandName, category) {
  const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const getScoreColor = (score) => {
    if (score >= 80) return '#059669'; // Green
    if (score >= 60) return '#d97706'; // Orange  
    return '#dc2626'; // Red
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    return 'Needs Attention';
  };

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Brand Analysis Report - ${brandName}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
            line-height: 1.6; 
            color: #374151; 
            background: #ffffff;
        }
        
        .page { 
            max-width: 800px; 
            margin: 0 auto; 
            background: white;
        }
        
        /* Header Section */
        .header {
            background: #f9fafb;
            border-bottom: 3px solid #1f2937;
            color: #1f2937;
            padding: 40px 30px;
            text-align: center;
        }
        
        .logo {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 16px;
            color: #1f2937;
        }
        
        .header h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 12px;
            color: #374151;
        }
        
        .brand-info {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 8px;
            color: #1f2937;
        }
        
        .date-info {
            font-size: 14px;
            color: #6b7280;
        }
        
        /* Executive Summary */
        .executive-summary {
            padding: 40px 30px;
            background: #ffffff;
            border-left: 4px solid #1f2937;
            margin: 20px 0;
        }
        
        .executive-summary h2 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 16px;
            color: #1f2937;
        }
        
        .summary-content {
            font-size: 14px;
            line-height: 1.7;
            color: #4b5563;
        }
        
        /* Score Section */
        .score-section {
            padding: 40px 30px;
            text-align: center;
            background: #f9fafb;
            border: 1px solid #e5e7eb;
        }
        
        .score-container {
            display: inline-block;
            position: relative;
            margin-bottom: 20px;
        }
        
        .score-circle {
            width: 120px;
            height: 120px;
            border-radius: 50%;
            border: 8px solid #e5e7eb;
            border-top: 8px solid ${getScoreColor(analysisData.overallScore || 0)};
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto;
        }
        
        .score-number {
            font-size: 28px;
            font-weight: 700;
            color: ${getScoreColor(analysisData.overallScore || 0)};
        }
        
        .score-description {
            font-size: 16px;
            font-weight: 600;
            color: #374151;
            margin-top: 16px;
        }
        
        /* Metrics Grid */
        .metrics-section {
            padding: 40px 30px;
            background: #ffffff;
        }
        
        .metrics-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 24px;
            text-align: center;
            color: #1f2937;
        }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
        }
        
        .metric-card {
            background: #f9fafb;
            padding: 20px;
            border: 1px solid #e5e7eb;
            text-align: center;
        }
        
        .metric-value {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        
        .metric-title {
            font-size: 12px;
            font-weight: 500;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        /* Data Table Section */
        .data-section {
            padding: 40px 30px;
            background: #ffffff;
        }
        
        .data-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #1f2937;
        }
        
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        
        .data-table th {
            background: #f9fafb;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            font-size: 12px;
            color: #374151;
            border-bottom: 2px solid #e5e7eb;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .data-table td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 14px;
            color: #4b5563;
        }
        
        /* Domain Section */
        .domains-section {
            padding: 40px 30px;
            background: #f9fafb;
        }
        
        .domains-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #1f2937;
        }
        
        .domain-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            margin-bottom: 8px;
        }
        
        .domain-name {
            font-weight: 500;
            color: #1f2937;
        }
        
        .domain-status {
            font-weight: 600;
            font-size: 12px;
            padding: 4px 8px;
            border: 1px solid;
            text-transform: uppercase;
        }
        
        .available {
            color: #059669;
            border-color: #059669;
            background: #ecfdf5;
        }
        
        .taken {
            color: #dc2626;
            border-color: #dc2626;
            background: #fef2f2;
        }
        
        /* Recommendation Section */
        .recommendation-section {
            padding: 40px 30px;
            background: #ffffff;
            border-top: 2px solid #e5e7eb;
        }
        
        .recommendation-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            color: #1f2937;
        }
        
        .recommendation-content {
            font-size: 14px;
            line-height: 1.7;
            color: #4b5563;
        }
        
        /* Footer */
        .footer {
            padding: 30px;
            text-align: center;
            background: #f9fafb;
            border-top: 1px solid #e5e7eb;
        }
        
        .footer-logo {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 8px;
        }
        
        .footer-text {
            font-size: 11px;
            color: #6b7280;
            line-height: 1.5;
        }
        
        /* Competitive Analysis Table */
        .competitors-section {
            padding: 40px 30px;
            background: #ffffff;
        }
        
        .competitors-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #1f2937;
        }
        
        .competitor-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            margin-bottom: 8px;
        }
        
        .competitor-name {
            font-weight: 500;
            color: #1f2937;
            flex: 1;
        }
        
        .competitor-score {
            font-weight: 600;
            font-size: 14px;
            color: #374151;
            width: 60px;
            text-align: center;
        }
        
        /* Deep Scan Premium Section */
        .deep-scan-section {
            padding: 40px 30px;
            background: #ffffff;
        }
        
        .premium-header {
            text-align: center;
            margin-bottom: 40px;
            padding: 30px;
            background: #f8fafc;
            border: 2px solid #e5e7eb;
        }
        
        .premium-badge {
            display: inline-block;
            background: #1f2937;
            color: white;
            padding: 6px 16px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1px;
            margin-bottom: 16px;
        }
        
        .deep-scan-title {
            font-size: 24px;
            font-weight: 700;
            color: #1f2937;
            margin-bottom: 8px;
        }
        
        .deep-scan-subtitle {
            font-size: 14px;
            color: #6b7280;
            margin: 0;
        }
        
        .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 20px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e5e7eb;
        }
        
        .deep-competitors-section {
            margin-bottom: 40px;
        }
        
        .deep-competitor-card {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            padding: 24px;
            margin-bottom: 20px;
        }
        
        .competitor-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        
        .competitor-header h4 {
            font-size: 16px;
            font-weight: 600;
            color: #1f2937;
            margin: 0;
        }
        
        .competitor-metrics {
            display: flex;
            gap: 8px;
        }
        
        .metric-badge {
            background: #e5e7eb;
            color: #374151;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
        }
        
        .threat-direct {
            background: #fee2e2;
            color: #dc2626;
        }
        
        .threat-indirect {
            background: #fef3c7;
            color: #d97706;
        }
        
        .threat-low {
            background: #ecfdf5;
            color: #059669;
        }
        
        .competitor-analysis {
            margin-bottom: 16px;
        }
        
        .competitor-analysis h5 {
            font-size: 14px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 8px;
        }
        
        .competitor-analysis p {
            font-size: 13px;
            line-height: 1.6;
            color: #4b5563;
            margin: 0;
        }
        
        .competitor-insights {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        
        .insights-column h6 {
            font-size: 13px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 8px;
        }
        
        .insights-column ul {
            margin: 0;
            padding-left: 16px;
        }
        
        .insights-column li {
            font-size: 12px;
            color: #4b5563;
            margin-bottom: 4px;
        }
        
        .comparative-analysis-section {
            margin-bottom: 40px;
        }
        
        .analysis-content p {
            font-size: 14px;
            line-height: 1.7;
            color: #4b5563;
            margin-bottom: 12px;
        }
        
        .market-insights-section {
            margin-bottom: 40px;
        }
        
        .insights-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
        }
        
        .insight-item {
            background: #f9fafb;
            padding: 16px;
            border: 1px solid #e5e7eb;
        }
        
        .insight-item h6 {
            font-size: 13px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 8px;
        }
        
        .insight-item p {
            font-size: 12px;
            color: #4b5563;
            margin: 0;
            line-height: 1.5;
        }
        
        /* Page break */
        .page-break {
            page-break-before: always;
        }
    </style>
</head>
<body>
    <div class="page">
        <!-- Header -->
    <div class="header">
            <div class="logo">CenterPage</div>
        <h1>Brand Analysis Report</h1>
            <div class="brand-info">${brandName || 'Unknown Brand'}</div>
            <div class="brand-info">${category || 'General'} Industry</div>
            <div class="date-info">Generated on ${currentDate}</div>
        </div>

        <!-- Executive Summary -->
        <div class="executive-summary">
            <h2>Executive Summary</h2>
            <div class="summary-content">
                This comprehensive brand analysis evaluates "<strong>${brandName || 'your brand'}</strong>" for market viability in the ${category || 'business'} industry. Our analysis examines domain availability, competitive landscape, and market positioning to provide data-driven insights for strategic decision making.
            </div>
    </div>

        <!-- Score Section -->
    <div class="score-section">
            <h2 style="margin-bottom: 20px; color: #1f2937;">Overall Brand Viability Score</h2>
            <div class="score-container">
                <div class="score-circle">
                    <div class="score-number">${Math.round(analysisData.overallScore || 0)}</div>
                </div>
            </div>
            <div class="score-description">${getScoreLabel(analysisData.overallScore || 0)} - ${Math.round(analysisData.overallScore || 0)}/100</div>
    </div>

        <!-- Metrics -->
        <div class="metrics-section">
            <div class="metrics-title">Key Performance Indicators</div>
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-value" style="color: ${getScoreColor(analysisData.scores?.domainStrength || 0)}">${Math.round(analysisData.scores?.domainStrength || 0)}</div>
            <div class="metric-title">Domain Strength</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value" style="color: ${getScoreColor(analysisData.scores?.competitionIntensity || 0)}">${Math.round(analysisData.scores?.competitionIntensity || 0)}</div>
                    <div class="metric-title">Competition (Higher = Easier)</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value" style="color: ${getScoreColor(analysisData.scores?.seoDifficulty || 0)}">${Math.round(analysisData.scores?.seoDifficulty || 0)}</div>
                    <div class="metric-title">SEO Difficulty (Higher = Easier)</div>
                </div>
            </div>
        </div>

        <!-- Data Analysis Table -->
        <div class="data-section">
            <div class="data-title">Analysis Breakdown</div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Score</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Domain Availability</td>
                        <td>${Math.round(analysisData.scores?.domainStrength || 0)}/100</td>
                        <td>${getScoreLabel(analysisData.scores?.domainStrength || 0)}</td>
                    </tr>
                    <tr>
                        <td>Competition Level</td>
                        <td>${Math.round(analysisData.scores?.competitionIntensity || 0)}/100</td>
                        <td>${getScoreLabel(analysisData.scores?.competitionIntensity || 0)}</td>
                    </tr>
                    <tr>
                        <td>SEO Difficulty</td>
                        <td>${Math.round(analysisData.scores?.seoDifficulty || 0)}/100</td>
                        <td>${getScoreLabel(analysisData.scores?.seoDifficulty || 0)}</td>
                    </tr>
                    <tr>
                        <td>Overall Viability</td>
                        <td>${Math.round(analysisData.overallScore || 0)}/100</td>
                        <td>${getScoreLabel(analysisData.overallScore || 0)}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Domain Availability -->
        <div class="domains-section">
            <div class="domains-title">Domain Availability Analysis</div>
            ${(() => {
                const domains = analysisData.detailedAnalysis?.domainAvailability;
                if (!domains || !Array.isArray(domains) || domains.length === 0) {
                    return '<div class="domain-item"><span class="domain-name">No domain data available</span></div>';
                }
                return domains.map(domain => `
                    <div class="domain-item">
                        <span class="domain-name">${domain.domain || 'Unknown domain'}</span>
                        <span class="domain-status ${domain.isAvailable ? 'available' : 'taken'}">${domain.isAvailable ? 'Available' : 'Taken'}</span>
                    </div>
                `).join('');
            })()}
        </div>

        <!-- Competitive Analysis -->
        ${(() => {
            const competitors = analysisData.competitors;
            if (competitors && Array.isArray(competitors) && competitors.length > 0) {
                return `
                <div class="competitors-section">
                    <div class="competitors-title">Competitive Landscape</div>
                    ${competitors.slice(0, 10).map(competitor => `
                        <div class="competitor-row">
                            <span class="competitor-name">${competitor.name || competitor.url || 'Unknown'}</span>
                            <span class="competitor-score">${competitor.relevanceScore || 'N/A'}</span>
                        </div>
                    `).join('')}
                </div>
                `;
            }
            return '';
        })()}

        <!-- Deep Scan Analysis (Premium) -->
        ${(() => {
            const deepScanData = analysisData.deepScanData || analysisData.detailedAnalysis?.deepScanData;
            // Check if deepScanData exists and has the right structure
            if (deepScanData && (deepScanData.competitorsAnalyzed || deepScanData.comparativeAnalysis || deepScanData.competitors)) {
                return `
                <div class="page-break"></div>
                <div class="deep-scan-section">
                    <div class="premium-header">
                        <div class="premium-badge">PREMIUM ANALYSIS</div>
                        <h2 class="deep-scan-title">Deep Scan Intelligence Report</h2>
                        <p class="deep-scan-subtitle">Advanced AI-powered competitive analysis with live-scraped data</p>
    </div>

                    ${(deepScanData.competitorsAnalyzed || deepScanData.competitors) && (deepScanData.competitorsAnalyzed || deepScanData.competitors).length > 0 ? `
                    <div class="deep-competitors-section">
                        <h3 class="section-title">Detailed Competitor Analysis</h3>
                        ${(deepScanData.competitorsAnalyzed || deepScanData.competitors).map(competitor => `
                            <div class="deep-competitor-card">
                                <div class="competitor-header">
                                    <h4 class="competitor-name">${competitor.name || competitor.url || 'Unknown Competitor'}</h4>
                                    <div class="competitor-metrics">
                                        ${competitor.relevanceScore ? `<span class="metric-badge">Relevance: ${competitor.relevanceScore}</span>` : ''}
                                        ${competitor.threatLevel ? `<span class="metric-badge threat-${competitor.threatLevel}">${competitor.threatLevel}</span>` : ''}
                                    </div>
                                </div>
                                ${competitor.analysis ? `
                                <div class="competitor-analysis">
                                    <h5>Strategic Analysis</h5>
                                    <p>${competitor.analysis}</p>
                                </div>
                                ` : ''}
                                ${competitor.strengths || competitor.weaknesses ? `
                                <div class="competitor-insights">
                                    ${competitor.strengths ? `
                                    <div class="insights-column">
                                        <h6>Key Strengths</h6>
                                        <ul>
                                            ${competitor.strengths.map(strength => `<li>${strength}</li>`).join('')}
                                        </ul>
                                    </div>
                                    ` : ''}
                                    ${competitor.weaknesses ? `
                                    <div class="insights-column">
                                        <h6>Potential Gaps</h6>
                                        <ul>
                                            ${competitor.weaknesses.map(weakness => `<li>${weakness}</li>`).join('')}
                                        </ul>
                                    </div>
                                    ` : ''}
                                </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}

                    ${deepScanData.comparativeAnalysis ? `
                    <div class="comparative-analysis-section">
                        <h3 class="section-title">AI Strategic Analysis</h3>
                        <div class="analysis-content">
                            ${deepScanData.comparativeAnalysis.split('\n').map(paragraph => 
                                paragraph.trim() ? `<p>${paragraph.trim()}</p>` : ''
                            ).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${deepScanData.marketInsights ? `
                    <div class="market-insights-section">
                        <h3 class="section-title">Market Intelligence</h3>
                        <div class="insights-grid">
                            ${Object.entries(deepScanData.marketInsights).map(([key, value]) => `
                                <div class="insight-item">
                                    <h6>${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</h6>
                                    <p>${value}</p>
            </div>
        `).join('')}
    </div>
                    </div>
                    ` : ''}
                </div>
                `;
            }
            return '';
        })()}

        <!-- Strategic Recommendations -->
        <div class="recommendation-section">
            <div class="recommendation-title">Strategic Recommendations</div>
            <div class="recommendation-content">
                ${analysisData.recommendation || analysisData.summary || `Based on our analysis of "${brandName || 'this brand'}" in the ${category || 'this'} industry, we recommend careful consideration of the competitive landscape and domain availability. Focus on building a strong brand identity that differentiates from existing market players.`}
            </div>
    </div>

        <!-- Footer -->
    <div class="footer">
            <div class="footer-logo">CenterPage</div>
            <div class="footer-text">
                This report was generated by CenterPage's AI-powered brand analysis engine.<br>
                © ${new Date().getFullYear()} CenterPage. All rights reserved. | Professional Brand Intelligence
            </div>
        </div>
    </div>
</body>
</html>
  `;
} 