// ./services/pdfGenerator.js
// Advanced PDF generator using PDFKit to create professional, styled reports.

import PDFDocument from 'pdfkit';
import fs from 'fs'; // Used to load the logo image

// --- Helper Functions for Styling and Drawing ---

/**
 * Draws the header on each page.
 * @param {PDFDocument} doc - The PDFKit document instance.
 * @param {string} brandName - The brand name for the report.
 */
function drawHeader(doc, brandName) {
  // NOTE: Replace './assets/logo.png' with the actual path to your logo file.
  // If you don't have a logo, you can comment out the next line.
  // doc.image('./assets/logo.png', 50, 45, { width: 150 });

  doc.font('Helvetica-Bold').fontSize(20).text('Brand Analysis Report', { align: 'right' });
  doc.fontSize(14).text(brandName, { align: 'right' });
  doc.moveDown(0.5);
  doc.lineCap('butt').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
}

/**
 * Draws the footer on each page.
 * @param {PDFDocument} doc - The PDFKit document instance.
 */
function drawFooter(doc) {
  const pageNumber = doc.page.number;
  doc.lineCap('butt').moveTo(50, 780).lineTo(550, 780).stroke();
  doc.fontSize(8).text(`© ${new Date().getFullYear()} CenterPage. All rights reserved.`, 50, 790);
  doc.fontSize(8).text(`Page ${pageNumber}`, 500, 790, { align: 'right' });
}

/**
 * Draws a styled table for key metrics.
 * @param {PDFDocument} doc - The PDFKit document instance.
 * @param {object[]} tableData - Array of row data.
 * @param {number} startX - The starting X position of the table.
 * @param {number} startY - The starting Y position of the table.
 */
function drawStyledTable(doc, tableData, startX, startY) {
  const rowHeight = 25;
  const colWidths = [250, 100, 150];
  let currentY = startY;

  // Draw header
  doc.font('Helvetica-Bold').fontSize(10);
  tableData[0].forEach((header, i) => {
    doc.text(header, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0) + 10, currentY + 7);
  });

  doc.rect(startX, currentY, colWidths.reduce((a, b) => a + b, 0), rowHeight).stroke();
  currentY += rowHeight;

  // Draw rows
  doc.font('Helvetica').fontSize(10);
  tableData.slice(1).forEach(row => {
    row.forEach((cell, i) => {
      doc.text(cell, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0) + 10, currentY + 7);
    });
    doc.rect(startX, currentY, colWidths.reduce((a, b) => a + b, 0), rowHeight).stroke();
    currentY += rowHeight;
  });

  return currentY; // Return the Y position after the table
}

/**
 * Draws a score bar chart.
 * @param {PDFDocument} doc - The PDFKit document instance.
 * @param {string} label - The label for the bar.
 * @param {number} score - The score (0-100).
 * @param {number} x - The starting X position.
 * @param {number} y - The starting Y position.
 */
function drawScoreBar(doc, label, score, x, y) {
  const barMaxWidth = 200;
  const barHeight = 15;
  const barWidth = (score / 100) * barMaxWidth;
  
  // Determine color
  let color = '#dc3545'; // Red
  if (score >= 50) color = '#ffc107'; // Orange
  if (score >= 75) color = '#28a745'; // Green

  doc.font('Helvetica').fontSize(10).fillColor('black').text(label, x, y + 3);
  doc.rect(x + 150, y, barWidth, barHeight).fill(color);
  doc.rect(x + 150, y, barMaxWidth, barHeight).stroke();
  doc.font('Helvetica-Bold').fontSize(10).text(`${score}`, x + 150 + barMaxWidth + 10, y + 3);
}

// --- Main PDF Generation Logic ---

/**
 * Generates a professional PDF report from analysis data using PDFKit.
 * @param {object} analysisData - The core analysis data from Firestore.
 * @param {string} brandName - The name of the brand.
 * @param {string} category - The category of the analysis.
 * @returns {Promise<Buffer>} - A promise that resolves with the PDF buffer.
 */
export async function generatePdfWithKit(analysisData, brandName, category) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 }, bufferPages: true });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      console.log('🔍 [PDF] Generating PDF with data keys:', Object.keys(analysisData));
      console.log('🔍 [PDF] Has detailedAgentReports:', !!analysisData.detailedAgentReports);
      console.log('🔍 [PDF] Has analysis:', !!analysisData.analysis);
      console.log('🔍 [PDF] Has competitorsAnalyzed:', !!analysisData.competitorsAnalyzed);

      // --- Page 1: Title and Executive Summary ---
      drawHeader(doc, brandName);
      doc.moveDown(3);
      
      // Executive Summary
      doc.font('Helvetica-Bold').fontSize(14).text('Executive Summary');
      doc.moveDown(1);
      doc.font('Helvetica').fontSize(10).text(
        `This comprehensive brand analysis evaluates "${brandName}" for market viability in the ${category} industry. Our AI-powered deep scan analyzed ${analysisData.competitorsAnalyzed?.length || 0} competitors using advanced web scraping and multi-agent analysis to provide data-driven insights for strategic decision making.`,
        { width: 500, align: 'justify' }
      );
      
      doc.moveDown(2);

      // Competitors Analyzed Summary
      if (analysisData.competitorsAnalyzed && analysisData.competitorsAnalyzed.length > 0) {
        doc.font('Helvetica-Bold').fontSize(12).text('Competitors Analyzed');
        doc.moveDown(0.5);
        
        analysisData.competitorsAnalyzed.forEach((competitor, index) => {
          doc.font('Helvetica').fontSize(9)
            .text(`${index + 1}. ${competitor.url || 'Unknown URL'}`, { indent: 20 })
            .text(`   ${competitor.title || 'No title available'}`, { indent: 20, color: '#666666' });
        });
        
        doc.moveDown(2);
      }

      // Check if we need a new page
      if (doc.y > 650) {
        doc.addPage();
        drawHeader(doc, brandName);
        doc.moveDown(2);
      }

      // --- AI Strategic Analysis ---
      if (analysisData.analysis) {
        doc.font('Helvetica-Bold').fontSize(14).text('AI Strategic Analysis');
        doc.moveDown(1);
        
        // Split analysis into paragraphs and render
        const paragraphs = analysisData.analysis.split('\n').filter(p => p.trim());
        paragraphs.forEach(paragraph => {
          if (doc.y > 700) {
            doc.addPage();
            drawHeader(doc, brandName);
            doc.moveDown(2);
          }
          doc.font('Helvetica').fontSize(10).text(paragraph.trim(), { 
            width: 500, 
            align: 'justify',
            lineGap: 2
          });
          doc.moveDown(0.8);
        });
      }
      
      drawFooter(doc);

      // --- Page 2+: Detailed Agent Reports ---
      if (analysisData.detailedAgentReports && analysisData.detailedAgentReports.length > 0) {
        doc.addPage();
        drawHeader(doc, brandName);
        doc.moveDown(2);
        
        doc.font('Helvetica-Bold').fontSize(16).text('Detailed Competitor Analysis', { align: 'center' });
        doc.font('Helvetica').fontSize(10).text('AI-Powered Multi-Agent Intelligence Reports', { align: 'center', color: '#666666' });
        doc.moveDown(2);
        
        analysisData.detailedAgentReports.forEach((competitor, index) => {
          // Check if we need a new page for each competitor
          if (index > 0 || doc.y > 600) {
            doc.addPage();
            drawHeader(doc, brandName);
            doc.moveDown(2);
          }
          
          // Competitor Header
          doc.font('Helvetica-Bold').fontSize(14).text(`Competitor ${index + 1}: ${competitor.url || 'Unknown'}`);
          doc.moveDown(0.5);
          
          // Raw Data Summary
          if (competitor.raw_data_summary) {
            doc.font('Helvetica-Bold').fontSize(11).text('Website Metrics:');
            doc.font('Helvetica').fontSize(9)
              .text(`• Word Count: ${competitor.raw_data_summary.wordCount || 'N/A'}`, { indent: 20 })
              .text(`• Technology Stack: ${competitor.raw_data_summary.techStack?.join(', ') || 'Not detected'}`, { indent: 20 });
            
            if (competitor.raw_data_summary.performance) {
              doc.text(`• Performance: ${JSON.stringify(competitor.raw_data_summary.performance)}`, { indent: 20 });
            }
            doc.moveDown(1);
          }
          
          // Specialist Reports
          if (competitor.specialist_reports) {
            const reports = competitor.specialist_reports;
            
            // Technical Analysis
            if (reports.technical) {
              doc.font('Helvetica-Bold').fontSize(11).text('🔧 Technical Analysis:');
              if (reports.technical.strengths && reports.technical.strengths.length > 0) {
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#28a745').text('Strengths:', { indent: 20 });
                reports.technical.strengths.forEach(strength => {
                  doc.font('Helvetica').fontSize(8).fillColor('black').text(`• ${strength}`, { indent: 40, width: 460 });
                });
              }
              if (reports.technical.weaknesses && reports.technical.weaknesses.length > 0) {
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#dc3545').text('Weaknesses:', { indent: 20 });
                reports.technical.weaknesses.forEach(weakness => {
                  doc.font('Helvetica').fontSize(8).fillColor('black').text(`• ${weakness}`, { indent: 40, width: 460 });
                });
              }
              doc.moveDown(1);
            }
            
            // Content & SEO Analysis
            if (reports.content) {
              doc.font('Helvetica-Bold').fontSize(11).text('📝 Content & SEO Analysis:');
              if (reports.content.strengths && reports.content.strengths.length > 0) {
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#28a745').text('Strengths:', { indent: 20 });
                reports.content.strengths.forEach(strength => {
                  doc.font('Helvetica').fontSize(8).fillColor('black').text(`• ${strength}`, { indent: 40, width: 460 });
                });
              }
              if (reports.content.weaknesses && reports.content.weaknesses.length > 0) {
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#dc3545').text('Weaknesses:', { indent: 20 });
                reports.content.weaknesses.forEach(weakness => {
                  doc.font('Helvetica').fontSize(8).fillColor('black').text(`• ${weakness}`, { indent: 40, width: 460 });
                });
              }
              doc.moveDown(1);
            }
            
            // Visual & UX Analysis
            if (reports.visual_ux) {
              doc.font('Helvetica-Bold').fontSize(11).text('🎨 Visual & UX Analysis:');
              if (reports.visual_ux.strengths && reports.visual_ux.strengths.length > 0) {
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#28a745').text('Strengths:', { indent: 20 });
                reports.visual_ux.strengths.forEach(strength => {
                  doc.font('Helvetica').fontSize(8).fillColor('black').text(`• ${strength}`, { indent: 40, width: 460 });
                });
              }
              if (reports.visual_ux.weaknesses && reports.visual_ux.weaknesses.length > 0) {
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#dc3545').text('Weaknesses:', { indent: 20 });
                reports.visual_ux.weaknesses.forEach(weakness => {
                  doc.font('Helvetica').fontSize(8).fillColor('black').text(`• ${weakness}`, { indent: 40, width: 460 });
                });
              }
              doc.moveDown(2);
            }
          }
          
          // Add separator line between competitors
          if (index < analysisData.detailedAgentReports.length - 1) {
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(1);
          }
        });
        
        drawFooter(doc);
      }
      
      // Final page with timestamp and metadata
      doc.addPage();
      drawHeader(doc, brandName);
      doc.moveDown(3);
      
      doc.font('Helvetica-Bold').fontSize(14).text('Report Metadata', { align: 'center' });
      doc.moveDown(2);
      
      const metadata = [
        ['Report Generated:', new Date().toLocaleString()],
        ['Brand Name:', brandName || 'Unknown'],
        ['Category:', category || 'General'],
        ['Competitors Analyzed:', analysisData.competitorsAnalyzed?.length || 0],
        ['Analysis Timestamp:', analysisData.timestamp || 'Unknown'],
        ['Analysis Method:', 'AI Multi-Agent Deep Scan']
      ];
      
      metadata.forEach(([label, value]) => {
        doc.font('Helvetica-Bold').fontSize(10).text(`${label}`, 50, doc.y, { continued: true });
        doc.font('Helvetica').text(` ${value}`);
        doc.moveDown(0.5);
      });
      
      drawFooter(doc);
      
      // Finalize the PDF and send the buffer
      doc.end();

    } catch (error) {
      console.error('Failed inside generatePdfWithKit:', error);
      reject(error);
    }
  });
}
