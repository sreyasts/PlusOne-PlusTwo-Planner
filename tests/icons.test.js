import { describe, it, expect } from 'vitest';
import { getSvgIcon } from '../src/ui/icons.js';

describe('getSvgIcon', () => {
  it('renders a standard icon with default classes', () => {
    const svg = getSvgIcon('book');
    expect(svg).toContain('<svg class="w-4 h-4 inline-block"');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('</svg>');
  });

  it('applies custom classes when provided', () => {
    const svg = getSvgIcon('book', 'w-8 h-8 text-red-500');
    expect(svg).toContain('<svg class="w-8 h-8 text-red-500"');
  });

  it('strips font-awesome style prefixes', () => {
    // 'fa-times' and 'fa-solid fa-times' map to 'times', which is an alias for 'xmark'.
    const svg1 = getSvgIcon('fa-times');
    const svg2 = getSvgIcon('fa-solid fa-times');
    const svg3 = getSvgIcon('fa-brands fa-github');

    expect(svg1).toBe(svg2);
    // xmark path
    expect(svg1).toContain('<line x1="18" y1="6" x2="6" y2="18"/>');
    // github path
    expect(svg3).toContain('M9 18c-4.51 2-5-2-7-2');
  });

  it('maps aliases accurately using FA_ALIAS_MAP', () => {
    // 'graduation-cap' maps to 'graduation'
    const svg1 = getSvgIcon('graduation-cap');
    const svg2 = getSvgIcon('graduation');
    expect(svg1).toBe(svg2);
  });

  it('falls back to the info icon when an unknown name is provided', () => {
    const unknownSvg = getSvgIcon('this-icon-does-not-exist');
    const infoSvg = getSvgIcon('info');
    expect(unknownSvg).toBe(infoSvg);
  });
});
