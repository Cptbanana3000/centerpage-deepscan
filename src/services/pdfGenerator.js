/**
 * @fileoverview This module provides functionalities to generate a professional PDF report
 * from structured analysis data. It uses Puppeteer and a headless Chromium instance
 * to convert a dynamically generated HTML document into a PDF.
 *
 * @module pdfGenerator
 * @requires puppeteer-core
 * @requires @sparticuz/chromium
 */

import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// --- Helper Functions ---

/**
 * Determines the color for a score value.
 * @param {number} score - The score, typically between 0 and 100.
 * @returns {string} A hex color code.
 */
const getScoreColor = (score = 0) => {
  if (score >= 80) return '#059669'; // Green for Excellent
  if (score >= 60) return '#d97706'; // Orange for Good
  return '#dc2626'; // Red for Needs Attention
};

/**
 * Determines the descriptive label for a score value.
 * @param {number} score - The score, typically between 0 and 100.
 * @returns {string} A descriptive label.
 */
const getScoreLabel = (score = 0) => {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  return 'Needs Attention';
};


// --- HTML Component Renderers ---

/**
 * Generates the CSS styles for the PDF report.
 * @param {object} analysisData - The main data object for dynamic styling.
 * @returns {string} The complete <style> block for the HTML.
 */
const renderStyles = (analysisData) => `
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
    
    /* Header & Footer */
    .header {
        background: #f9fafb;
        border-bottom: 3px solid #1f2937;
        color: #1f2937;
        padding: 40px 30px;
        text-align: center;
    }
    .footer {
        padding: 30px;
        text-align: center;
        background: #f9fafb;
        border-top: 1px solid #e5e7eb;
        font-size: 11px;
        color: #6b7280;
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
    }
    .brand-info {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 8px;
    }
    .date-info {
        font-size: 14px;
        color: #6b7280;
    }

    /* Sections */
    .section {
        padding: 40px 30px;
        margin-bottom: 20px;
    }
    .section-title {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 20px;
        color: #1f2937;
    }
    
    /* Executive Summary */
    .executive-summary {
        background: #ffffff;
        border-left: 4px solid #1f2937;
        margin-top: 20px;
    }
    .summary-content {
        font-size: 14px;
        line-height: 1.7;
        color: #4b5563;
    }
    
    /* Score Section */
    .score-section {
        text-align: center;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
    }
    .score-circle {
        width: 120px;
        height: 120px;
        border-radius: 50%;
        border: 8px solid #e5e7eb;
        border-top-color: ${getScoreColor(analysisData.overallScore)};
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
    }
    .score-number {
        font-size: 28px;
        font-weight: 700;
        color: ${getScoreColor(analysisData.overallScore)};
    }
    .score-description {
        font-size: 16px;
        font-weight: 600;
        color: #374151;
    }
    
    /* Metrics Grid */
    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        text-align: center;
    }
    .metric-card {
        background: #f9fafb;
        padding: 20px;
        border: 1px solid #e5e7eb;
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
    
    /* Data Table */
    .data-table {
        width: 100%;
        border-collapse: collapse;
    }
    .data-table th, .data-table td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #e5e7eb;
    }
    .data-table th {
        background: #f9fafb;
        font-weight: 600;
        font-size: 12px;
        color: #374151;
        text-transform: uppercase;
    }
    .data-table td {
        font-size: 14px;
        color: #4b5563;
    }
    
    /* Domain & Competitor Lists */
    .list-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        margin-bottom: 8px;
    }
    .item-name {
        font-weight: 500;
        color: #1f2937;
    }
    .item-status {
        font-weight: 600;
        font-size: 12px;
        padding: 4px 8px;
        border: 1px solid;
        text-transform: uppercase;
    }
    .available { color: #059669; border-color: #059669; background: #ecfdf5; }
    .taken { color: #dc2626; border-color: #dc2626; background: #fef2f2; }
    
    /* Deep Scan Premium Section */
    .deep-scan-section {
        padding-top: 20px;
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
        margin-bottom: 8px;
    }
    .deep-scan-subtitle {
        font-size: 14px;
        color: #6b7280;
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
    }
    .competitor-analysis h5 {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 8px;
    }
    .competitor-analysis p, .competitor-analysis li {
        font-size: 12px;
        color: #4b5563;
    }
    .competitor-analysis ul {
        padding-left: 16px;
        margin-top: 4px;
    }
    .strength { color: #059669; font-weight: 600; }
    .weakness { color: #dc2626; font-weight: 600; }

    .page-break {
        page-break-before: always;
    }
</style>
`;

/**
 * Renders the domain availability list.
 * @param {Array<object>} domains - Array of domain objects.
 * @returns {string} HTML string for the domain section.
 */
const renderDomainAvailability = (domains = []) => {
    if (!domains || domains.length === 0) {
        return '<div class="list-item"><span class="item-name">No domain data available</span></div>';
    }
    return domains.map(domain => `
        <div class="list-item">
            <span class="item-name">${domain.domain || 'Unknown domain'}</span>
            <span class="item-status ${domain.isAvailable ? 'available' : 'taken'}">
                ${domain.isAvailable ? 'Available' : 'Taken'}
            </span>
        </div>
    `).join('');
};

/**
 * Renders the competitor list.
 * @param {Array<object>} competitors - Array of competitor objects.
 * @returns {string} HTML string for the competitor section, or empty string if no data.
 */
const renderCompetitorList = (competitors = []) => {
    if (!competitors || competitors.length === 0) {
        return '';
    }
    const competitorRows = competitors.slice(0, 10).map(c => `
        <div class="list-item">
            <span class="item-name">${c.name || c.url || 'Unknown'}</span>
            <span>${c.relevanceScore || 'N/A'}</span>
        </div>
    `).join('');

    return `
    <div class="section">
        <h2 class="section-title">Competitive Landscape</h2>
        ${competitorRows}
    </div>
    `;
};

/**
 * Renders the detailed AI analysis of a single competitor.
 * @param {object} report - The specialist report object for a competitor.
 * @param {string} title - The title of the analysis section (e.g., "Technical Analysis").
 * @returns {string} HTML string for the analysis details.
 */
const renderSpecialistReport = (report, title) => {
    if (!report) return '';
    const renderList = (items) => items && items.length > 0 ? `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>` : '';
    
    return `
        <div style="margin-bottom: 16px;">
            <strong>${title}:</strong>
            ${report.strengths ? `<div><span class="strength">✓ Strengths:</span>${renderList(report.strengths)}</div>` : ''}
            ${report.weaknesses ? `<div style="margin-top: 8px;"><span class="weakness">⚠ Weaknesses:</span>${renderList(report.weaknesses)}</div>` : ''}
        </div>
    `;
};

/**
 * Renders the premium deep scan analysis section.
 * @param {object} deepScanData - The data object for the deep scan.
 * @returns {string} HTML string for the deep scan section, or empty string if no data.
 */
const renderDeepScanSection = (deepScanData = {}) => {
    const { detailedAgentReports, analysis, competitorsAnalyzed } = deepScanData;

    if (!detailedAgentReports && !analysis && !competitorsAnalyzed) {
        return ''; // No deep scan data to render
    }

    const competitorReportsHtml = detailedAgentReports?.map(competitor => `
        <div class="deep-competitor-card">
            <div class="competitor-header">
                <h4>${competitor.url || 'Unknown Competitor'}</h4>
            </div>
            <div class="competitor-analysis">
                <h5>AI Specialist Analysis</h5>
                ${renderSpecialistReport(competitor.specialist_reports?.technical, 'Technical Analysis')}
                ${renderSpecialistReport(competitor.specialist_reports?.content, 'Content & SEO Analysis')}
                ${renderSpecialistReport(competitor.specialist_reports?.visual_ux, 'Visual & UX Analysis')}
            </div>
        </div>
    `).join('') || '';

    const strategicAnalysisHtml = analysis ? `
        <div class="section">
            <h3 class="section-title">AI Strategic Analysis</h3>
            <div class="analysis-content">${analysis.split('\n').map(p => p.trim() ? `<p>${p.trim()}</p>` : '').join('')}</div>
        </div>
    ` : '';
    
    return `
        <div class="page-break"></div>
        <div class="deep-scan-section">
            <div class="premium-header">
                <div class="premium-badge">PREMIUM ANALYSIS</div>
                <h2 class="deep-scan-title">Deep Scan Intelligence Report</h2>
                <p class="deep-scan-subtitle">Advanced AI-powered competitive analysis with live-scraped data</p>
            </div>
            ${competitorReportsHtml ? `
                <div class="section">
                    <h3 class="section-title">Detailed Competitor Analysis</h3>
                    ${competitorReportsHtml}
                </div>
            ` : ''}
            ${strategicAnalysisHtml}
        </div>
    `;
};


// --- Main PDF Generation Functions ---

/**
 * Generates a professional HTML report from analysis data.
 * This function constructs the entire HTML document by assembling modular components.
 *
 * @param {object} analysisData - The core object containing all analysis results.
 * @param {string} brandName - The name of the brand being analyzed.
 * @param {string} category - The industry or category of the brand.
 * @returns {string} A complete HTML document as a string.
 */
export function generateProfessionalPdfHtml(analysisData, brandName, category) {
    // This console.log is useful for debugging data structure issues.
    // It's commented out but can be re-enabled if needed.
    /*
    console.log('🔍 PDF Generator - Analysis Data Structure:', {
        hasDeepScanData: !!analysisData.deepScanData,
        hasDetailedAnalysis: !!analysisData.detailedAnalysis,
        analysisDataKeys: Object.keys(analysisData)
    });
    */

    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const scores = analysisData.scores || {};
    const overallScore = analysisData.overallScore || 0;
    
    // Fallback logic to find deep scan data in various possible structures
    const deepScanData = analysisData.deepScanData || analysisData.detailedAnalysis?.deepScanData || analysisData.data || analysisData;

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Brand Analysis Report - ${brandName}</title>
        ${renderStyles(analysisData)}
    </head>
    <body>
        <div class="page">
            <header class="header">
                <div class="logo">CenterPage</div>
                <h1>Brand Analysis Report</h1>
                <div class="brand-info">${brandName || 'Unknown Brand'}</div>
                <div class="brand-info">${category || 'General'} Industry</div>
                <div class="date-info">Generated on ${currentDate}</div>
            </header>

            <main>
                <div class="section executive-summary">
                    <h2 class="section-title">Executive Summary</h2>
                    <div class="summary-content">
                        This comprehensive brand analysis evaluates "<strong>${brandName || 'your brand'}</strong>" for market viability in the ${category || 'business'} industry. Our analysis examines domain availability, competitive landscape, and market positioning to provide data-driven insights for strategic decision making.
                    </div>
                </div>

                <div class="section score-section">
                    <h2 class="section-title">Overall Brand Viability Score</h2>
                    <div class="score-circle">
                        <div class="score-number">${Math.round(overallScore)}</div>
                    </div>
                    <div class="score-description">${getScoreLabel(overallScore)} - ${Math.round(overallScore)}/100</div>
                </div>

                <div class="section">
                    <h2 class="section-title" style="text-align:center;">Key Performance Indicators</h2>
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="metric-value" style="color: ${getScoreColor(scores.domainStrength)}">${Math.round(scores.domainStrength || 0)}</div>
                            <div class="metric-title">Domain Strength</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" style="color: ${getScoreColor(scores.competitionIntensity)}">${Math.round(scores.competitionIntensity || 0)}</div>
                            <div class="metric-title">Competition (Higher = Easier)</div>
                        </div>
                        <div class="metric-card">
                            <div class="metric-value" style="color: ${getScoreColor(scores.seoDifficulty)}">${Math.round(scores.seoDifficulty || 0)}</div>
                            <div class="metric-title">SEO Difficulty (Higher = Easier)</div>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <h2 class="section-title">Analysis Breakdown</h2>
                    <table class="data-table">
                        <thead>
                            <tr><th>Metric</th><th>Score</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>Domain Availability</td><td>${Math.round(scores.domainStrength || 0)}/100</td><td>${getScoreLabel(scores.domainStrength)}</td></tr>
                            <tr><td>Competition Level</td><td>${Math.round(scores.competitionIntensity || 0)}/100</td><td>${getScoreLabel(scores.competitionIntensity)}</td></tr>
                            <tr><td>SEO Difficulty</td><td>${Math.round(scores.seoDifficulty || 0)}/100</td><td>${getScoreLabel(scores.seoDifficulty)}</td></tr>
                            <tr><td>Overall Viability</td><td>${Math.round(overallScore)}/100</td><td>${getScoreLabel(overallScore)}</td></tr>
                        </tbody>
                    </table>
                </div>

                <div class="section">
                    <h2 class="section-title">Domain Availability Analysis</h2>
                    ${renderDomainAvailability(analysisData.detailedAnalysis?.domainAvailability)}
                </div>

                ${renderCompetitorList(analysisData.competitors)}
                
                ${renderDeepScanSection(deepScanData)}

                <div class="section">
                    <h2 class="section-title">Strategic Recommendations</h2>
                    <p>${analysisData.recommendation || analysisData.summary || `Based on our analysis of "${brandName || 'this brand'}" in the ${category || 'this'} industry, we recommend careful consideration of the competitive landscape and domain availability. Focus on building a strong brand identity that differentiates from existing market players.`}</p>
                </div>
            </main>

            <footer class="footer">
                <div class="logo" style="font-size: 18px;">CenterPage</div>
                This report was generated by CenterPage's AI-powered brand analysis engine.<br>
                &copy; ${new Date().getFullYear()} CenterPage. All rights reserved.
            </footer>
        </div>
    </body>
    </html>
  `;
}

/**
 * Launches a headless browser instance and generates a PDF from an HTML string.
 * This function is optimized for serverless environments using @sparticuz/chromium.
 *
 * @param {string} html - The complete HTML content to be rendered into a PDF.
 * @returns {Promise<Buffer>} A promise that resolves with the generated PDF buffer.
 * @throws {Error} Throws an error if PDF generation fails.
 */
export async function generatePdfFromHtml(html) {
  let browser = null;
  try {
    // The @sparticuz/chromium package is designed for serverless environments (e.g., AWS Lambda)
    // to provide a compatible Chromium binary.
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    
    // Set the HTML content and wait for the network to be idle, ensuring all resources (like fonts) are loaded.
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate the PDF with specified formatting.
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      printBackground: true,
    });

    return pdfBuffer;
  } catch (error) {
      console.error("Error generating PDF:", error);
      throw new Error("Could not generate PDF from HTML.");
  } finally {
    // Ensure the browser is always closed to free up resources.
    if (browser) {
      await browser.close();
    }
  }
}
