// ./services/pdfGenerator.js
// Rewritten with PDFKit for efficient, browser-less PDF generation.

import PDFDocument from 'pdfkit';

/**
 * Helper function to determine the color for a score.
 * @param {number} score - The score from 0 to 100.
 * @returns {string} - A hex color code.
 */
function getScoreColor(score) {
  if (score >= 75) return '#28a745'; // Green for Strong
  if (score >= 50) return '#ffc107'; // Orange for Average
  return '#dc3545'; // Red for Needs Improvement
}

/**
 * Helper function to get a human-readable label for a score.
 * @param {number} score - The score from 0 to 100.
 * @returns {string} - A descriptive label.
 */
function getScoreLabel(score) {
  if (score >= 75) return 'Strong';
  if (score >= 50) return 'Average';
  return 'Needs Improvement';
}

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
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `${brandName} Analysis Report`,
          Author: 'Your Brand/App Name',
        },
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // --- PDF Header ---
      doc.font('Helvetica-Bold').fontSize(24).text(`${brandName} Analysis Report`, { align: 'center' });
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(12).text(`Category: ${category} | Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(2);

      // --- Performance Metrics Section ---
      doc.font('Helvetica-Bold').fontSize(16).text('Overall Performance Scores');
      doc.moveDown(0.5);
      const scores = analysisData.analysis?.scores || {};
      const metrics = [
        { label: 'Domain Strength', score: scores.domainStrength },
        { label: 'Social Media Presence', score: scores.socialPresence },
        { label: 'SEO Performance', score: scores.seoScore },
      ];
      
      metrics.forEach(({ label, score = 0 }) => {
        const roundedScore = Math.round(score);
        const scoreText = `${roundedScore}/100 - ${getScoreLabel(roundedScore)}`;
        doc.fontSize(12).fillColor('black').text(`${label}: `, { continued: true })
           .font('Helvetica-Bold').fillColor(getScoreColor(roundedScore)).text(scoreText);
        doc.font('Helvetica').moveDown(0.5);
      });

      // --- Top Competitors Section ---
      if (analysisData.competitorsAnalyzed && analysisData.competitorsAnalyzed.length > 0) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(16).fillColor('black').text('Top Competitors Analyzed');
        doc.moveDown(1);
        
        analysisData.competitorsAnalyzed.forEach((competitor, index) => {
          doc.font('Helvetica-Bold').fontSize(12).text(`${index + 1}. ${competitor.title || 'N/A'}`);
          doc.font('Helvetica').fontSize(10).fillColor('blue').text(competitor.link || '', { link: competitor.link, underline: true });
          doc.moveDown(0.75);
        });
      }

      // --- Detailed Recommendations Section ---
      if (analysisData.analysis?.recommendations && analysisData.analysis.recommendations.length > 0) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(16).fillColor('black').text('Strategic Recommendations');
        doc.moveDown(1);
        
        doc.font('Helvetica').fontSize(12).list(analysisData.analysis.recommendations, {
          bulletRadius: 2.5,
          textIndent: 20,
          lineGap: 4,
        });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
