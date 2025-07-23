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

      // --- Page 1: Title and Executive Summary ---
      drawHeader(doc, brandName);
      doc.moveDown(4);
      doc.font('Helvetica-Bold').fontSize(12).text('Executive Summary');
      doc.font('Helvetica').fontSize(10).text(
        `This comprehensive brand analysis evaluates "${brandName}" for market viability in the ${category} industry. Our analysis examines domain availability, competitive landscape, and market positioning to provide data-driven insights for strategic decision making.`,
        { width: 500 }
      );
      
      doc.moveDown(2);

      // Overall Score Box
      const score = Math.round(analysisData.analysis?.scores?.overallViability || 12);
      doc.fillColor('#EFEFEF').rect(50, doc.y, 500, 50).fill();
      doc.fillColor('black').font('Helvetica-Bold').fontSize(14).text('Overall Brand Viability Score', 65, doc.y + 18);
      doc.font('Helvetica-Bold').fontSize(14).text(`${score}/100`, 450, doc.y - 14, { align: 'right' });


      doc.moveDown(4);

      // --- Analysis Breakdown Table ---
      doc.font('Helvetica-Bold').fontSize(12).text('Analysis Breakdown');
      const table = [
        ['METRIC', 'SCORE', 'STATUS'],
        ['Domain Availability', `${Math.round(analysisData.analysis?.scores?.domainStrength || 0)}/100`, 'Needs Attention'],
        ['Competition Level', `${Math.round(analysisData.analysis?.scores?.competition || 0)}/100`, 'Needs Attention'],
        ['SEO Difficulty', `${Math.round(analysisData.analysis?.scores?.seoScore || 0)}/100`, 'Needs Attention'],
      ];
      drawStyledTable(doc, table, 50, doc.y + 10);
      
      drawFooter(doc);

      // --- Page 2: Deep Dive Analysis ---
      doc.addPage();
      drawHeader(doc, brandName);
      
      doc.moveDown(2);
      doc.font('Helvetica-Bold').fontSize(12).text('Deep Scan Intelligence Report');
      
      if (analysisData.competitorsAnalyzed && analysisData.competitorsAnalyzed.length > 0) {
        doc.font('Helvetica-Bold').fontSize(10).text('AI Specialist Analysis:', { underline: true });
        const competitor = analysisData.competitorsAnalyzed[0]; // Assuming we show the first one
        
        doc.moveDown(1);
        doc.font('Helvetica-Bold').fontSize(10).text('Technical Analysis:');
        doc.font('Helvetica').fontSize(9).list(competitor.analysis.technical.strengths.map(s => `✓ ${s}`), { bulletRadius: 1.5 });
        doc.font('Helvetica').fontSize(9).list(competitor.analysis.technical.weaknesses.map(w => `⚠ ${w}`), { bulletRadius: 1.5 });
        
        doc.moveDown(1);
        doc.font('Helvetica-Bold').fontSize(10).text('Content & SEO Analysis:');
        doc.font('Helvetica').fontSize(9).list(competitor.analysis.content.strengths.map(s => `✓ ${s}`), { bulletRadius: 1.5 });
        doc.font('Helvetica').fontSize(9).list(competitor.analysis.content.weaknesses.map(w => `⚠ ${w}`), { bulletRadius: 1.5 });
      }
      
      drawFooter(doc);
      
      // Finalize the PDF and send the buffer
      doc.end();

    } catch (error) {
      console.error('Failed inside generatePdfWithKit:', error);
      reject(error);
    }
  });
}
