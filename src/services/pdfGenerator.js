import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/**
 * PDF Generator Service
 * Professional brand analysis report generator with PDF export capabilities
 */

export async function generatePdfFromHtml(html) {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      printBackground: true,
    });

    return pdfBuffer;
  } finally {
    if (browser) await browser.close();
  }
}

export function generateProfessionalPdfHtml(analysisData, brandName, category) {
    const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', month: 'long', day: 'numeric' 
    });
  
  // Helper Functions
    const getScoreColor = (score) => {
    if (score >= 80) return '#059669';
    if (score >= 60) return '#d97706';
    return '#dc2626';
    };
  
    const getScoreLabel = (score) => {
      if (score >= 80) return 'Excellent';
      if (score >= 60) return 'Good';
      return 'Needs Attention';
    };
  
  // Component Generators
  const generateHeader = () => `
      <div class="header">
              <div class="logo">CenterPage</div>
          <h1>Brand Analysis Report</h1>
              <div class="brand-info">${brandName || 'Unknown Brand'}</div>
              <div class="brand-info">${category || 'General'} Industry</div>
              <div class="date-info">Generated on ${currentDate}</div>
          </div>
  `;
  
  const generateExecutiveSummary = () => `
          <div class="executive-summary">
              <h2>Executive Summary</h2>
              <div class="summary-content">
        This comprehensive brand analysis evaluates "<strong>${brandName || 'your brand'}</strong>" 
        for market viability in the ${category || 'business'} industry. Our analysis examines domain 
        availability, competitive landscape, and market positioning to provide data-driven insights 
        for strategic decision making.
      </div>
    </div>
  `;
  
  const generateScoreSection = () => `
      <div class="score-section">
      <h2>Overall Brand Viability Score</h2>
              <div class="score-container">
        <div class="score-circle" style="border-top-color: ${getScoreColor(analysisData.overallScore || 0)}">
          <div class="score-number" style="color: ${getScoreColor(analysisData.overallScore || 0)}">
            ${Math.round(analysisData.overallScore || 0)}
          </div>
                  </div>
              </div>
      <div class="score-description">
        ${getScoreLabel(analysisData.overallScore || 0)} - ${Math.round(analysisData.overallScore || 0)}/100
      </div>
    </div>
  `;
  
  const generateMetrics = () => `
          <div class="metrics-section">
              <div class="metrics-title">Key Performance Indicators</div>
              <div class="metrics-grid">
                  <div class="metric-card">
          <div class="metric-value" style="color: ${getScoreColor(analysisData.scores?.domainStrength || 0)}">
            ${Math.round(analysisData.scores?.domainStrength || 0)}
          </div>
              <div class="metric-title">Domain Strength</div>
                  </div>
                  <div class="metric-card">
          <div class="metric-value" style="color: ${getScoreColor(analysisData.scores?.competitionIntensity || 0)}">
            ${Math.round(analysisData.scores?.competitionIntensity || 0)}
          </div>
                      <div class="metric-title">Competition (Higher = Easier)</div>
                  </div>
                  <div class="metric-card">
          <div class="metric-value" style="color: ${getScoreColor(analysisData.scores?.seoDifficulty || 0)}">
            ${Math.round(analysisData.scores?.seoDifficulty || 0)}
          </div>
                      <div class="metric-title">SEO Difficulty (Higher = Easier)</div>
                  </div>
              </div>
          </div>
  `;
  
  const generateDataTable = () => `
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
  `;
  
  const generateDomainSection = () => {
    const domains = analysisData.detailedAnalysis?.domainAvailability;
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return `
          <div class="domains-section">
              <div class="domains-title">Domain Availability Analysis</div>
          <div class="domain-item">
            <span class="domain-name">No domain data available</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="domains-section">
        <div class="domains-title">Domain Availability Analysis</div>
        ${domains.map(domain => `
                      <div class="domain-item">
                          <span class="domain-name">${domain.domain || 'Unknown domain'}</span>
            <span class="domain-status ${domain.isAvailable ? 'available' : 'taken'}">
              ${domain.isAvailable ? 'Available' : 'Taken'}
            </span>
          </div>
        `).join('')}
      </div>
    `;
  };
  
  const generateCompetitorSection = () => {
              const competitors = analysisData.competitors;
    if (!competitors || !Array.isArray(competitors) || competitors.length === 0) {
      return '';
    }

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
  };

  const generateDeepScanSection = () => {
    const deepScanData = analysisData.deepScanData || 
                        analysisData.detailedAnalysis?.deepScanData || 
                        analysisData.data || 
                        analysisData;

    if (!deepScanData || (!deepScanData.competitorsAnalyzed && !deepScanData.analysis && !deepScanData.detailedAgentReports)) {
      return '';
    }

    const generateCompetitorAnalysis = () => {
      if (!deepScanData.detailedAgentReports || deepScanData.detailedAgentReports.length === 0) {
              return '';
      }

      return `
        <div class="deep-competitors-section">
          <h3 class="section-title">Detailed Competitor Analysis</h3>
          ${deepScanData.detailedAgentReports.map(competitor => `
            <div class="deep-competitor-card">
              <div class="competitor-header">
                <h4>${competitor.url || 'Unknown Competitor'}</h4>
                <div class="competitor-metrics">
                  ${competitor.raw_data_summary ? `<span class="metric-badge">Words: ${competitor.raw_data_summary.wordCount || 'N/A'}</span>` : ''}
                  ${competitor.specialist_reports ? `<span class="metric-badge">AI Analyzed</span>` : ''}
                </div>
              </div>
              ${generateSpecialistReports(competitor.specialist_reports)}
            </div>
          `).join('')}
        </div>
      `;
    };

    const generateSpecialistReports = (reports) => {
      if (!reports) return '';

      const generateReportSection = (title, report) => {
        if (!report) return '';
        
        return `
          <div class="report-section">
            <strong>${title}:</strong>
            ${report.strengths && report.strengths.length > 0 ? `
              <div class="strengths">
                <span class="label success">✓ Strengths:</span>
                <ul>${report.strengths.map(item => `<li>${item}</li>`).join('')}</ul>
              </div>
            ` : ''}
            ${report.weaknesses && report.weaknesses.length > 0 ? `
              <div class="weaknesses">
                <span class="label warning">⚠ Weaknesses:</span>
                <ul>${report.weaknesses.map(item => `<li>${item}</li>`).join('')}</ul>
              </div>
            ` : ''}
          </div>
        `;
      };

      return `
        <div class="competitor-analysis">
          <h5>AI Specialist Analysis</h5>
          ${generateReportSection('Technical Analysis', reports.technical)}
          ${generateReportSection('Content & SEO Analysis', reports.content)}
          ${generateReportSection('Visual & UX Analysis', reports.visual_ux)}
        </div>
      `;
    };

                  return `
                  <div class="page-break"></div>
                  <div class="deep-scan-section">
                      <div class="premium-header">
                          <div class="premium-badge">PREMIUM ANALYSIS</div>
                          <h2 class="deep-scan-title">Deep Scan Intelligence Report</h2>
                          <p class="deep-scan-subtitle">Advanced AI-powered competitive analysis with live-scraped data</p>
      </div>
        ${generateCompetitorAnalysis()}
        ${deepScanData.analysis ? `
                      <div class="comparative-analysis-section">
                          <h3 class="section-title">AI Strategic Analysis</h3>
                          <div class="analysis-content">
              ${deepScanData.analysis.split('\n').map(p => p.trim() ? `<p>${p.trim()}</p>` : '').join('')}
                          </div>
                      </div>
                      ` : ''}
        ${deepScanData.competitorsAnalyzed && deepScanData.competitorsAnalyzed.length > 0 ? `
                      <div class="market-insights-section">
            <h3 class="section-title">Competitors Analyzed</h3>
                          <div class="insights-grid">
              ${deepScanData.competitorsAnalyzed.map(competitor => `
                                  <div class="insight-item">
                  <h6>${competitor.url || 'Unknown URL'}</h6>
                  <p>${competitor.title || 'No title available'}</p>
              </div>
          `).join('')}
      </div>
                      </div>
                      ` : ''}
                  </div>
                  `;
  };
  
  const generateRecommendations = () => `
          <div class="recommendation-section">
              <div class="recommendation-title">Strategic Recommendations</div>
              <div class="recommendation-content">
        ${analysisData.recommendation || analysisData.summary || 
          `Based on our analysis of "${brandName || 'this brand'}" in the ${category || 'this'} industry, 
          we recommend careful consideration of the competitive landscape and domain availability. 
          Focus on building a strong brand identity that differentiates from existing market players.`}
      </div>
    </div>
  `;
  
  const generateFooter = () => `
      <div class="footer">
              <div class="footer-logo">CenterPage</div>
              <div class="footer-text">
                  This report was generated by CenterPage's AI-powered brand analysis engine.<br>
                  © ${new Date().getFullYear()} CenterPage. All rights reserved. | Professional Brand Intelligence
              </div>
          </div>
  `;

  // CSS Styles
  const styles = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
      
      * { margin: 0; padding: 0; box-sizing: border-box; }
      
      body { 
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
        line-height: 1.6; color: #374151; background: #ffffff;
      }
      
      .page { max-width: 800px; margin: 0 auto; background: white; }
      
      .header {
        background: #f9fafb; border-bottom: 3px solid #1f2937; color: #1f2937;
        padding: 40px 30px; text-align: center;
      }
      
      .logo { font-size: 28px; font-weight: 700; margin-bottom: 16px; color: #1f2937; }
      
      .header h1 { font-size: 24px; font-weight: 600; margin-bottom: 12px; color: #374151; }
      
      .brand-info { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #1f2937; }
      
      .date-info { font-size: 14px; color: #6b7280; }
      
      .executive-summary {
        padding: 40px 30px; background: #ffffff; border-left: 4px solid #1f2937; margin: 20px 0;
      }
      
      .executive-summary h2 { font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #1f2937; }
      
      .summary-content { font-size: 14px; line-height: 1.7; color: #4b5563; }
      
      .score-section {
        padding: 40px 30px; text-align: center; background: #f9fafb; border: 1px solid #e5e7eb;
      }
      
      .score-container { display: inline-block; position: relative; margin-bottom: 20px; }
      
      .score-circle {
        width: 120px; height: 120px; border-radius: 50%; border: 8px solid #e5e7eb;
        display: flex; align-items: center; justify-content: center; margin: 0 auto;
      }
      
      .score-number { font-size: 28px; font-weight: 700; }
      
      .score-description { font-size: 16px; font-weight: 600; color: #374151; margin-top: 16px; }
      
      .metrics-section { padding: 40px 30px; background: #ffffff; }
      
      .metrics-title { font-size: 18px; font-weight: 600; margin-bottom: 24px; text-align: center; color: #1f2937; }
      
      .metrics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
      
      .metric-card { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; text-align: center; }
      
      .metric-value { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
      
      .metric-title { font-size: 12px; font-weight: 500; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
      
      .data-section { padding: 40px 30px; background: #ffffff; }
      
      .data-title { font-size: 18px; font-weight: 600; margin-bottom: 20px; color: #1f2937; }
      
      .data-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
      
      .data-table th {
        background: #f9fafb; padding: 12px; text-align: left; font-weight: 600; font-size: 12px;
        color: #374151; border-bottom: 2px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.5px;
      }
      
      .data-table td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #4b5563; }
      
      .domains-section { padding: 40px 30px; background: #f9fafb; }
      
      .domains-title { font-size: 18px; font-weight: 600; margin-bottom: 20px; color: #1f2937; }
      
      .domain-item {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 16px; background: #ffffff; border: 1px solid #e5e7eb; margin-bottom: 8px;
      }
      
      .domain-name { font-weight: 500; color: #1f2937; }
      
      .domain-status {
        font-weight: 600; font-size: 12px; padding: 4px 8px; border: 1px solid; text-transform: uppercase;
      }
      
      .available { color: #059669; border-color: #059669; background: #ecfdf5; }
      
      .taken { color: #dc2626; border-color: #dc2626; background: #fef2f2; }
      
      .competitors-section { padding: 40px 30px; background: #ffffff; }
      
      .competitors-title { font-size: 18px; font-weight: 600; margin-bottom: 20px; color: #1f2937; }
      
      .competitor-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 16px; background: #f9fafb; border: 1px solid #e5e7eb; margin-bottom: 8px;
      }
      
      .competitor-name { font-weight: 500; color: #1f2937; flex: 1; }
      
      .competitor-score { font-weight: 600; font-size: 14px; color: #374151; width: 60px; text-align: center; }
      
      .deep-scan-section { padding: 40px 30px; background: #ffffff; }
      
      .premium-header {
        text-align: center; margin-bottom: 40px; padding: 30px; background: #f8fafc; border: 2px solid #e5e7eb;
      }
      
      .premium-badge {
        display: inline-block; background: #1f2937; color: white; padding: 6px 16px;
        font-size: 11px; font-weight: 700; letter-spacing: 1px; margin-bottom: 16px;
      }
      
      .deep-scan-title { font-size: 24px; font-weight: 700; color: #1f2937; margin-bottom: 8px; }
      
      .deep-scan-subtitle { font-size: 14px; color: #6b7280; margin: 0; }
      
      .section-title {
        font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 20px;
        padding-bottom: 8px; border-bottom: 2px solid #e5e7eb;
      }
      
      .deep-competitors-section { margin-bottom: 40px; }
      
      .deep-competitor-card { background: #f9fafb; border: 1px solid #e5e7eb; padding: 24px; margin-bottom: 20px; }
      
      .competitor-header {
        display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
      }
      
      .competitor-header h4 { font-size: 16px; font-weight: 600; color: #1f2937; margin: 0; }
      
      .competitor-metrics { display: flex; gap: 8px; }
      
      .metric-badge {
        background: #e5e7eb; color: #374151; padding: 4px 8px; border-radius: 4px;
        font-size: 11px; font-weight: 600;
      }
      
      .competitor-analysis { margin-bottom: 16px; }
      
      .competitor-analysis h5 { font-size: 14px; font-weight: 600; color: #1f2937; margin-bottom: 8px; }
      
      .report-section { margin-bottom: 16px; }
      
      .label { font-size: 11px; font-weight: 600; }
      
      .success { color: #059669; }
      
      .warning { color: #dc2626; }
      
      .strengths, .weaknesses { margin-top: 8px; }
      
      .strengths ul, .weaknesses ul { margin: 4px 0; padding-left: 16px; }
      
      .strengths li, .weaknesses li { font-size: 11px; color: #4b5563; }
      
      .comparative-analysis-section { margin-bottom: 40px; }
      
      .analysis-content p { font-size: 14px; line-height: 1.7; color: #4b5563; margin-bottom: 12px; }
      
      .market-insights-section { margin-bottom: 40px; }
      
      .insights-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
      
      .insight-item { background: #f9fafb; padding: 16px; border: 1px solid #e5e7eb; }
      
      .insight-item h6 { font-size: 13px; font-weight: 600; color: #1f2937; margin-bottom: 8px; }
      
      .insight-item p { font-size: 12px; color: #4b5563; margin: 0; line-height: 1.5; }
      
      .recommendation-section {
        padding: 40px 30px; background: #ffffff; border-top: 2px solid #e5e7eb;
      }
      
      .recommendation-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #1f2937; }
      
      .recommendation-content { font-size: 14px; line-height: 1.7; color: #4b5563; }
      
      .footer {
        padding: 30px; text-align: center; background: #f9fafb; border-top: 1px solid #e5e7eb;
      }
      
      .footer-logo { font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 8px; }
      
      .footer-text { font-size: 11px; color: #6b7280; line-height: 1.5; }
      
      .page-break { page-break-before: always; }
    </style>
  `;

  // Generate Complete HTML
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Brand Analysis Report - ${brandName}</title>
      ${styles}
    </head>
    <body>
      <div class="page">
        ${generateHeader()}
        ${generateExecutiveSummary()}
        ${generateScoreSection()}
        ${generateMetrics()}
        ${generateDataTable()}
        ${generateDomainSection()}
        ${generateCompetitorSection()}
        ${generateDeepScanSection()}
        ${generateRecommendations()}
        ${generateFooter()}
      </div>
  </body>
  </html>
    `;
  } 