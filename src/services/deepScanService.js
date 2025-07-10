// Enhanced Deep Scan Service - v3.0 (Multi-Agent Pipeline)
// This version implements the full multi-agent architecture.

// --- Core Dependencies ---
import OpenAI from 'openai';
import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-core';
import { getDomain } from 'tldts';

// We no longer need to dynamically import chromium here as it's handled inside the method.

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
   * Performs a comprehensive analysis of a single competitor URL using the multi-agent pipeline.
   */
  async performDeepScan(competitorUrl, userBrandName, category = 'General') {
    try {
      console.log(`🔍 Starting Multi-Agent Deep Scan for: ${competitorUrl} in category: ${category}`);
      const analyzedData = await this.analyzeWebsite(competitorUrl);

      // Run agent pipeline for a single competitor
      const [techReport, contentReport, visualReport] = await Promise.all([
        this.runTechnicalAnalysisAgent(analyzedData),
        this.runContentSeoAgent(analyzedData),
        analyzedData.screenshot ? this.runVisualUxAgent(analyzedData.screenshot) : Promise.resolve(null)
      ]);

      const singleCompetitorReport = {
        competitors: [{
            url: analyzedData.url,
            raw_data_summary: {
              wordCount: analyzedData.wordCount,
              performance: analyzedData.performance,
              techStack: analyzedData.technologyStack
            },
            specialist_reports: {
              technical: techReport,
              content: contentReport,
              visual_ux: visualReport
            }
        }]
      };

      // Generate final analysis from the Chief Strategist
      const analysis = await this.runChiefStrategistAgent(singleCompetitorReport, userBrandName, category);
      
      return {
        success: true,
        competitorUrl: competitorUrl,
        analysis: analysis, // The final synthesized report
        detailedAgentReports: singleCompetitorReport.competitors[0].specialist_reports,
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
   * Orchestrates the multi-agent deep scan for multiple competitors.
   */
  async performMultipleDeepScan(competitorUrls, brandName, category = 'General', progressCallback = () => {}) {
    console.log(`🚀 Starting multi-agent deep scan for brand: ${brandName} in category: ${category}`);
    try {
      const uniqueCompetitors = this.deduplicateByDomain(competitorUrls);
      console.log(`🎯 Analyzing ${uniqueCompetitors.length} unique competitors...`);
      const urlsToProcess = uniqueCompetitors.slice(0, 5);
      
      let completedCrawls = 0;
      const total = urlsToProcess.length;

      // Step 1: Analyze all websites to get raw data and screenshots
      const analysisPromises = urlsToProcess.map(async (url) => {
        try {
          const data = await this.analyzeWebsite(url);
          return { status: 'fulfilled', value: data };
        } catch (err) {
          return { status: 'rejected', reason: err };
        } finally {
          completedCrawls += 1;
          const percent = Math.round((completedCrawls / total) * 50); // Initial analysis is 50% of the work
          try { progressCallback(percent); } catch (_) {}
        }
      });
      const settledResults = await Promise.all(analysisPromises);
      
      const successfulAnalyses = [];
      settledResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          successfulAnalyses.push(result.value);
        } else {
          console.error(`Analysis failed for ${urlsToProcess[index]}: ${result.reason?.message || 'Unknown error'}`);
        }
      });
      
      if (successfulAnalyses.length === 0) {
        throw new Error(`No competitor data could be analyzed. All attempts failed.`);
      }

      console.log(`🤖 [Orchestrator] Running specialist agents for ${successfulAnalyses.length} competitors...`);
      let completedAgentRuns = 0;

      // Step 2: Run the specialist agents for each successful analysis
      const agentReportPromises = successfulAnalyses.map(async (data) => {
        try {
          console.log(`[Agent Pipeline] Running Technical and Content agents for ${data.url}...`);
          const [techReport, contentReport] = await Promise.all([
            this.runTechnicalAnalysisAgent(data),
            this.runContentSeoAgent(data),
          ]);
          
          console.log(`[Agent Pipeline] Running Visual agent for ${data.url}...`);
          const visualReport = data.screenshot 
            ? await this.runVisualUxAgent(data.screenshot) 
            : { strengths: [], weaknesses: ["Screenshot not available"] };
          
          console.log(`[Agent Pipeline] All agents finished for ${data.url}.`);

          return {
            url: data.url,
            raw_data_summary: { wordCount: data.wordCount, performance: data.performance, techStack: data.technologyStack },
            specialist_reports: { technical: techReport, content: contentReport, visual_ux: visualReport }
          };
        } catch (agentError) {
          console.error(`[Agent Pipeline] Failed for ${data.url}:`, agentError.message);
          return { url: data.url, error: `Agent analysis failed: ${agentError.message}` };
        } finally {
            completedAgentRuns += 1; 
            const percent = Math.round(50 + (completedAgentRuns / successfulAnalyses.length) * 50);
            try { progressCallback(percent); } catch (_) {}
        }
      });

      const allAgentReports = await Promise.all(agentReportPromises);

      console.log(`🧠 [Orchestrator] Synthesizing final report with Chief Strategist...`);
      // Step 3: Run the Chief Strategist Agent for the final synthesis
      const finalReport = await this.runChiefStrategistAgent({ competitors: allAgentReports }, brandName, category);
      
      try { progressCallback(100); } catch (_) {}

      return {
        success: true,
        data: {
          brandName: brandName,
          competitorsAnalyzed: successfulAnalyses.map(a => ({url: a.url, title: a.title})),
          analysis: finalReport,
          detailedAgentReports: allAgentReports,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('❌ Multi-competitor deep scan failed:', error);
      try { progressCallback(100); } catch (_) {}
      return { success: false, error: error.message };
    }
  }

  /**
   * Analyzes a website using Puppeteer as primary, with a fallback.
   */
  async analyzeWebsite(url) {
    if (!/^(https?:\/\/)/i.test(url)) url = 'https://' + url;
    try { new URL(url); } catch (e) { throw new Error(`Invalid URL format: ${url}`); }

    console.log(`📡 [Analyzer] Attempting robust browser analysis for: ${url}`);
    try {
      return await this.analyzWithPuppeteer(url);
    } catch (puppeteerError) {
      console.warn(`⚠️ Browser analysis failed for ${url}, trying fast fallback:`, puppeteerError.message);
      return await this.analyzeWithFallback(url);
    }
  }

  /**
   * Analyzes website using Puppeteer with stealth and retries.
   */
  async analyzWithPuppeteer(url) {
    console.log(`🚀 Launching headless browser to analyze: ${url}`);
    let browser;
    let chromium;

    let puppeteerLib;
    if (process.env.NODE_ENV === 'production') {
      puppeteerLib = (await import('puppeteer-core')).default;
      try {
        chromium = (await import('@sparticuz/chromium')).default;
      } catch (e) {
        console.warn('Could not import @sparticuz/chromium', e);
      }
    } else {
      const puppeteerExtra = (await import('puppeteer-extra')).default;
      const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
      puppeteerExtra.use(StealthPlugin());
      puppeteerLib = puppeteerExtra;
    }

    try {
      let launchOptions = {
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-setuid-sandbox', '--no-first-run', '--no-zygote', '--single-process', '--disable-extensions'],
        headless: true,
        timeout: 30000
      };

      if (process.env.NODE_ENV === 'production' && chromium) {
        launchOptions.executablePath = await chromium.executablePath();
        launchOptions.args = [...launchOptions.args, ...chromium.args];
      }

      browser = await puppeteerLib.launch(launchOptions);
      const page = await browser.newPage();
      
      await page.setRequestInterception(true);
      page.on('request', req => {
        const type = req.resourceType();
        if (type === 'image' || type === 'font') return req.abort();
        req.continue();
      });

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
            break;
      } catch (navigationError) {
            console.warn(`⚠️ Navigation attempt ${attempt + 1} failed for ${url}: ${navigationError.message}`);
            if (attempt === 1) throw navigationError;
        }
      }

      // Take screenshot after page is stable
      const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: true });
      const screenshotBase64 = screenshotBuffer.toString('base64');
      
      const finalUrl = page.url();
      const htmlContent = await page.content();
      const $ = cheerio.load(htmlContent);

      const techClues = this.extractTechClues($);
      const technologies = await this.detectTechnologiesAI(techClues, finalUrl);
      
      const performanceMetrics = await page.evaluate(() => {
        try {
        const paintTimings = performance.getEntriesByType('paint');
        const fcp = paintTimings.find(entry => entry.name === 'first-contentful-paint')?.startTime;
        const navTiming = performance.getEntriesByType("navigation")[0];
        return {
          firstContentfulPaint: fcp ? `${fcp.toFixed(0)} ms` : 'N/A',
          domLoadTime: navTiming ? `${(navTiming.domContentLoadedEventEnd - navTiming.startTime).toFixed(0)} ms` : 'N/A',
          pageLoadTime: navTiming ? `${(navTiming.loadEventEnd - navTiming.startTime).toFixed(0)} ms` : 'N/A',
        };
        } catch (e) {
            return { firstContentfulPaint: 'N/A', domLoadTime: 'N/A', pageLoadTime: 'N/A' };
        }
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
        analysisMethod: 'PUPPETEER_SUCCESS',
        screenshot: screenshotBase64,
      };

      console.log(`✅ Puppeteer analysis complete for ${finalUrl}`);
      return analyzedData;
    } catch (error) {
      console.error(`[Puppeteer Analysis] Failed for ${url}:`, error.message);
      throw new Error(`Puppeteer failed to analyze ${url}: ${error.message}`);
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Fast analysis via HTTP GET request, used as a fallback.
   */
  async analyzeWithFallback(url) {
    try {
        const response = await axios.get(url, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36' }
        });
        const htmlContent = response.data;
        const $ = cheerio.load(htmlContent);

        const techClues = this.extractTechClues($);
        const technologies = await this.detectTechnologiesAI(techClues, url);

        return {
            url: url,
            title: $('title').text().trim() || 'No title found',
            metaDescription: $('meta[name="description"]').attr('content')?.trim() || 'No meta description found',
            h1: $('h1').first().text().trim() || 'No H1 found',
            h2Count: $('h2').length,
            wordCount: this.estimateWordCount($('body').text()),
            internalLinks: this.countLinks($, url, true),
            externalLinks: this.countLinks($, url, false),
            technologyStack: technologies,
            analysisMethod: 'FALLBACK_SUCCESS',
            screenshot: null, // No screenshot available in fallback
        };
    } catch (error) {
        console.error(`[Fallback Analysis] Failed for ${url}:`, error.message);
        throw new Error(`Both Puppeteer and Fallback methods failed for ${url}.`);
    }
  }

  // --- UTILITY AND HELPER FUNCTIONS ---

  deduplicateByDomain(urls) {
    const uniqueDomains = new Set();
    return urls.filter(url => {
        const domain = getDomain(url);
        if (!domain || uniqueDomains.has(domain)) return false;
        uniqueDomains.add(domain);
        return true;
    });
  }

  estimateWordCount(text) {
    return text.trim().split(/\s+/).length;
  }

  countLinks($, baseUrl, internal = true) {
    const domain = getDomain(baseUrl);
    let count = 0;
    $('a[href]').each((i, link) => {
        const href = $(link).attr('href');
        if (!href) return;
        try {
            const linkDomain = getDomain(href);
            if (internal && linkDomain === domain) count++;
            if (!internal && linkDomain && linkDomain !== domain) count++;
        } catch (e) { /* ignore invalid URLs */ }
    });
    return count;
  }

  extractTechClues($) {
    const scripts = $('script[src]').map((i, el) => $(el).attr('src')).get();
    const styles = $('link[rel="stylesheet"]').map((i, el) => $(el).attr('href')).get();
    const metaGenerator = $('meta[name="generator"]').attr('content');
    const html = $('html').html();
    return { scripts, styles, metaGenerator, html };
  }

  async detectTechnologiesAI(techClues, url) {
    const prompt = `You are a world-class web technology detective. Your mission is to exhaustively identify every significant technology used on a website based on the provided clues. Do not stop at the obvious; look for subtle hints.

**Clues from ${url}:**
      \`\`\`json
${JSON.stringify(techClues, null, 2).substring(0, 8000)}
      \`\`\`

**Instructions:**
1.  **Be Comprehensive:** Identify as many technologies as you can.
2.  **Analyze Deeply:**
    *   **Scripts & Links:** Check URLs for hints (e.g., 'wp-content' implies WordPress, 'gtm.js' implies Google Tag Manager).
    *   **HTML & Body:** Look for framework-specific attributes (e.g., \`data-reactroot\`, \`ng-app\`).
    *   **Meta Tags:** The \`generator\` meta tag is a strong indicator of a CMS.
3.  **Categorize Your Findings (if possible):** Mentally group technologies into Frontend, UI, Backend, CMS, Analytics, Advertising, Hosting/CDN, etc., to ensure broad coverage.

**Output Format:**
Return a JSON object with a single key "technologies", which is an array of strings. Be specific. For example, if you see evidence for Next.js, list both "Next.js" and "React".

Example: \`{"technologies": ["Next.js", "React", "Node.js", "Vercel", "Stripe", "Google Analytics", "Facebook Pixel"]}\``;
    try {
        const completion = await this.openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [{ role: "system", content: "You are a web technology detection expert." }, { role: "user", content: prompt }],
            response_format: { type: "json_object" },
        });
        const result = JSON.parse(completion.choices[0].message.content);
        // Ensure we handle both { "technologies": [...] } and a direct array [] for robustness
        return Array.isArray(result) ? result : result.technologies || ['AI Detection Failed'];
    } catch (e) {
        console.error(`[Tech Detect] AI parsing failed: ${e.message}`);
        return ['AI Detection Failed'];
    }
  }

  // --- DEPRECATED FUNCTIONS ---
  async generateAIAnalysis() { console.warn("DEPRECATED: generateAIAnalysis is no longer used."); return "Deprecated."; }
  async generateComparativeAIReport() { console.warn("DEPRECATED: generateComparativeAIReport is no longer used."); return "Deprecated."; }


  // --- PHASE 2: MULTI-AGENT PIPELINE ---

  /**
   * AGENT 1: Technical SEO Analyst
   */
  async runTechnicalAnalysisAgent(data) {
    const prompt = `You are a Senior Technical SEO Analyst. Your analysis is precise and data-driven. Based on the following data, provide a technical assessment in JSON format. Focus on performance, mobile-friendliness (inferred from stack), and SEO best practices.
      Data: \`\`\`json\n${JSON.stringify({ performance: data.performance, technologyStack: data.technologyStack, schemaMarkup: data.schemaMarkup, metaRobots: data.metaRobots }, null, 2)}\n\`\`\`
      Return a JSON object with two keys: "strengths" and "weaknesses" (each an array of strings).`;
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "system", content: "You are a technical SEO expert that returns only JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    return JSON.parse(completion.choices[0].message.content);
  }

  /**
   * AGENT 2: Content Marketing Strategist
   */
  async runContentSeoAgent(data) {
    const prompt = `You are a Content Marketing Strategist. You are evaluating a competitor's content effectiveness. Based on the following data, provide a content & SEO assessment in JSON format. Focus on clarity of messaging, keyword targeting (inferred from H1/title), and call-to-action signals.
      Data: \`\`\`json\n${JSON.stringify({ title: data.title, metaDescription: data.metaDescription, h1: data.h1, wordCount: data.wordCount, h2Count: data.h2Count }, null, 2)}\n\`\`\`
      Return a JSON object with two keys: "strengths" and "weaknesses" (each an array of strings).`;
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "system", content: "You are a content marketing expert that returns only JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    return JSON.parse(completion.choices[0].message.content);
  }

  /**
   * AGENT 3: UI/UX Design Consultant
   */
  async runVisualUxAgent(screenshotBase64) {
    const prompt = `You are a professional UI/UX Design Consultant. Analyze this screenshot of a webpage. Provide your assessment of its visual branding, layout, and user experience. Focus on professionalism, clarity, and trustworthiness.
      Return a JSON object with two keys: "strengths" and "weaknesses" (each an array of strings).`;
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4.1-mini", // Changed from gpt-4o for cost savings, as it supports vision
      messages: [
        { role: "system", content: "You are a UI/UX design expert that returns only JSON." },
        { role: "user", content: [ { type: "text", text: prompt }, { type: "image_url", image_url: { "url": `data:image/jpeg;base64,${screenshotBase64}` } } ] }
      ],
      response_format: { type: "json_object" },
    });
    return JSON.parse(completion.choices[0].message.content);
  }

  /**
   * AGENT 4: Chief Marketing Strategist ("Aura")
   */
  async runChiefStrategistAgent(allAgentReports, userBrandName, category) {
    const prompt = `You are "Aura," a Chief Marketing Strategist specializing in the "${category}" industry. You are briefing your client, "${userBrandName}", on the competitive landscape.
      **Specialist Agent Reports:** \`\`\`json\n${JSON.stringify(allAgentReports, null, 2)}\n\`\`\`
      **Your Task:** Synthesize this data into a high-level STRATEGIC BATTLE PLAN. Do not just list the data; interpret it. Provide actionable insights.
      **Report Structure:**
      1.  **## Market Overview:** Summarize the competitive landscape. What are the common trends, strengths, and weaknesses?
      2.  **## Competitor Tier List:**
          * **Top Threat:** Identify the strongest competitor and explain why, citing data.
          * **Primary Target:** Identify the most vulnerable competitor and detail their weaknesses, citing data.
      3.  **## The Decisive Advantage:** What is the single most important strategic advantage "${userBrandName}" must build to win?
      4.  **## Immediate Quick Wins:** List 3 "quick win" actions based on common flaws you observed.`;
    const completion = await this.openai.chat.completions.create({
        model: "gpt-4.1-mini", // Changed from gpt-4o to reduce cost
        messages: [{ role: "system", content: `You are Aura, a Chief Marketing Strategist for the ${category} industry.` }, { role: "user", content: prompt }],
        max_tokens: 2500,
        temperature: 0.5,
    });
    return completion.choices[0].message.content.trim();
  }
}

// Create a single, shared instance of the service
const deepScanService = new DeepScanService();

// Export the main function for the worker
export async function performMultipleDeepScan(competitorUrls, brandName, category) {
  return await deepScanService.performMultipleDeepScan(competitorUrls, brandName, category);
}