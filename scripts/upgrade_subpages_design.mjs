import fs from 'fs';
import path from 'path';

const dirs = ['pages', 'public/pages'];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    let html = fs.readFileSync(fullPath, 'utf8');

    // 1. Brand name standardization
    html = html.replace(/Mission\s*<span[^>]*>PlusTwo<\/span>/gi, '+1 & +2 <span class="text-blue-600">Planner</span>');
    html = html.replace(/Mission\s*<span>PlusTwo<\/span>/gi, '+1 & +2 <span>Planner</span>');
    html = html.replace(/Mission\s*PlusTwo/gi, '+1 & +2 Planner');

    // 2. Remove AI-slop purple-blue gradients
    html = html.replace(/bg-gradient-to-r\s+from-blue-600\s+to-indigo-600\s+hover:from-blue-700\s+hover:to-indigo-700/g, 'bg-blue-600 hover:bg-blue-700');
    html = html.replace(/bg-gradient-to-tr\s+from-blue-600\s+to-indigo-600/g, 'bg-blue-600');

    // 3. Replace transition-all on buttons and cards with purposeful transitions
    html = html.replace(/\btransition-all\b/g, 'transition-colors duration-150');

    // 4. Ensure overflow-x: clip on body/html in style blocks
    if (html.includes('body { font-family:') && !html.includes('overflow-x: clip')) {
      html = html.replace('body { font-family:', 'html, body { overflow-x: clip; }\n        body { font-family:');
    }

    // 5. Add tactile active states to primary CTAs
    html = html.replace(/class="([^"]*\bbg-blue-600\b[^"]*)"/g, (match, classes) => {
      if (!classes.includes('active:scale-95') && !classes.includes('badge')) {
        return `class="${classes} active:scale-95 transition-transform"`;
      }
      return match;
    });

    fs.writeFileSync(fullPath, html, 'utf8');
    console.log('Upgraded design craft on:', fullPath);
  });
});
