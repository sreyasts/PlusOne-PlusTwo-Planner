import { describe, it, expect } from 'vitest';
import { generateQrSvg } from '../src/utils/qr.js';

describe('Offline Vector QR Code Generator', () => {
  it('generates valid vector SVG markup for URLs', async () => {
    const url = 'https://hss-planner.web.app/?stream=cs';
    const svg = await generateQrSvg(url, { width: 120 });

    expect(svg).toBeDefined();
    expect(typeof svg).toBe('string');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>\n') || svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox');
  });

  it('handles empty or invalid input gracefully without crashing', async () => {
    const nullResult = await generateQrSvg(null);
    expect(nullResult).toBeNull();

    const emptyResult = await generateQrSvg('');
    expect(emptyResult).toBeNull();
  });
});
