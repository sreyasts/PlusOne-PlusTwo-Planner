/**
 * Offline QR Code Generator for +1 & +2 Planner
 * Generates vector SVG QR codes client-side with zero external network requests.
 * Used for printable schedules, desk wall study timetables, and peer-to-peer scanning.
 */

import QRCode from 'qrcode';

/**
 * Generate a standalone, responsive SVG string for a given text or URL.
 * Works 100% offline, privacy-first, zero tracking.
 *
 * @param {string} text - The URL or string to encode in the QR code
 * @param {Object} options - QR generation options (margin, errorCorrectionLevel, width, colors)
 * @returns {Promise<string|null>} SVG markup string or null on failure
 */
export async function generateQrSvg(text, options = {}) {
  try {
    if (!text || typeof text !== 'string') {
      return null;
    }
    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: options.margin !== undefined ? options.margin : 1,
      errorCorrectionLevel: options.errorCorrectionLevel || 'M',
      width: options.width || 140,
      color: {
        dark: options.darkColor || '#0f172a',
        light: options.lightColor || '#ffffff',
      },
    });
    return svg;
  } catch (err) {
    console.warn('[QR] Failed to generate QR SVG:', err);
    return null;
  }
}
