// Enhanced Deep Scan Service - v2.9 (Category-Aware)
// This version integrates the 'category' context into the Deep Scan analysis,
// making the AI reports significantly more specialized and insightful.

// --- Core Dependencies ---
import OpenAI from 'openai';
import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-core';
import { getDomain } from 'tldts';

// Import Vercel-compatible Chromium
let chromium;
if (process.env.NODE_ENV === 'production') {
  try {
    chromium = (await import('@sparticuz/chromium')).default;
  } catch (error) {
    console.warn('Failed to import @sparticuz/chromium:', error);
  }
}

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

      // Use Vercel-compatible Chromium in production
      if (process.env.NODE_ENV === 'production' && chromium) {
        launchOptions.executablePath = await chromium.executablePath();
        launchOptions.args = [...launchOptions.args, ...chromium.args];
      }

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

export default DeepScanService;
