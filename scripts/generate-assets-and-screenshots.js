import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { buildIntelligentPlan } from '../src/engine/planner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');
const assetsDir = path.join(rootDir, 'assets');
const screenshotsDir = path.join(assetsDir, 'screenshots');
const publicScreenshotsDir = path.join(publicDir, 'assets', 'screenshots');
const distScreenshotsDir = path.join(distDir, 'assets', 'screenshots');

[screenshotsDir, publicScreenshotsDir, distScreenshotsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const SOURCE_ICON = path.join(rootDir, 'icon.png');

async function generatePwaIcons() {
  console.log('1. Generating high-resolution icons from single master icon.png...');

  const icon192 = await sharp(SOURCE_ICON)
    .resize(192, 192, { fit: 'contain', background: { r: 37, g: 99, b: 235, alpha: 0 } })
    .png({ quality: 95 })
    .toBuffer();

  const icon512 = await sharp(SOURCE_ICON)
    .resize(512, 512, { fit: 'contain', background: { r: 37, g: 99, b: 235, alpha: 0 } })
    .png({ quality: 95 })
    .toBuffer();

  const inner192 = await sharp(SOURCE_ICON).resize(150, 150, { fit: 'contain' }).toBuffer();
  const maskable192 = await sharp({
    create: { width: 192, height: 192, channels: 4, background: { r: 37, g: 99, b: 235, alpha: 1 } },
  })
    .composite([{ input: inner192, gravity: 'center' }])
    .png({ quality: 95 })
    .toBuffer();

  const inner512 = await sharp(SOURCE_ICON).resize(400, 400, { fit: 'contain' }).toBuffer();
  const maskable512 = await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 37, g: 99, b: 235, alpha: 1 } },
  })
    .composite([{ input: inner512, gravity: 'center' }])
    .png({ quality: 95 })
    .toBuffer();

  const appleTouch = await sharp(SOURCE_ICON)
    .resize(180, 180, { fit: 'contain', background: { r: 37, g: 99, b: 235, alpha: 1 } })
    .png({ quality: 95 })
    .toBuffer();

  const favicon32 = await sharp(SOURCE_ICON)
    .resize(32, 32, { fit: 'contain' })
    .png({ quality: 95 })
    .toBuffer();

  const iconMap = [
    { name: 'icon-192.png', buffer: icon192 },
    { name: 'icon-512.png', buffer: icon512 },
    { name: 'icon-maskable-192.png', buffer: maskable192 },
    { name: 'icon-maskable-512.png', buffer: maskable512 },
    { name: 'apple-touch-icon.png', buffer: appleTouch },
    { name: 'favicon-32.png', buffer: favicon32 },
  ];

  iconMap.forEach(({ name, buffer }) => {
    fs.writeFileSync(path.join(rootDir, name), buffer);
    fs.writeFileSync(path.join(publicDir, name), buffer);
    fs.writeFileSync(path.join(distDir, name), buffer);
    fs.writeFileSync(path.join(publicDir, 'icons', name), buffer);
  });

  console.log('   All PWA & search icons generated and synchronized.');
}

function startStaticServer(port = 3333) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(distDir, reqPath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.json': 'application/json',
          '.xml': 'application/xml',
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(port, () => {
      resolve(server);
    });
  });
}

async function captureScreenshots() {
  console.log('2. Starting Playwright headless browser for authentic UI screenshots...');
  const server = await startStaticServer(3333);

  // Generate realistic populated plan state for Science stream
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const planState = buildIntelligentPlan({
    stream: 'cs',
    startDateStr: todayStr,
    deadlineDateStr: '2027-03-01',
    termScope: 3,
  });

  // Ensure today's day has active tasks to showcase the real study checklist
  const todayDay = planState.plan.find((d) => d.dateStr === todayStr) || planState.plan[0];
  todayDay.dateStr = todayStr;
  todayDay.isRestDay = false;
  todayDay.tasks = [
    {
      id: 'task-p2-physics-c1-p1',
      subject: 'Physics',
      chapterNumber: 1,
      chapterName: 'Electric Charges and Fields',
      partNumber: 1,
      totalParts: 2,
      partTitle: 'Electric Charges, Conductors & Coulomb\'s Law',
      estimatedMinutes: 65,
      grade: 12,
      isRevision: false,
      completed: true,
    },
    {
      id: 'task-p2-chemistry-c1-p1',
      subject: 'Chemistry',
      chapterNumber: 1,
      chapterName: 'Solutions',
      partNumber: 1,
      totalParts: 3,
      partTitle: 'Solubility, Henry\'s Law & Ideal Solutions',
      estimatedMinutes: 60,
      grade: 12,
      isRevision: false,
      completed: false,
    },
  ];
  planState.currentStreak = 3;
  planState.totalCompletedTasks = 12;

  const browser = await chromium.launch();

  try {
    // 1. Desktop Dashboard Screenshot
    console.log('   Capturing Desktop Dashboard (1280x800)...');
    const desktopPage = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });

    await desktopPage.addInitScript((state) => {
      localStorage.setItem('plusTwoMissionState_v2', JSON.stringify(state));
      localStorage.setItem('plusTwoPlanState', JSON.stringify(state));
      localStorage.setItem('plustwo_theme', 'light');
    }, planState);

    await desktopPage.goto('http://127.0.0.1:3333');
    await desktopPage.waitForLoadState('networkidle');
    await desktopPage.waitForTimeout(1000);

    const desktopBuf = await desktopPage.screenshot({ type: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'screenshot-desktop.png'), desktopBuf);
    fs.writeFileSync(path.join(publicScreenshotsDir, 'screenshot-desktop.png'), desktopBuf);
    fs.writeFileSync(path.join(distScreenshotsDir, 'screenshot-desktop.png'), desktopBuf);

    // 2. Full Plan View Screenshot
    console.log('   Capturing Desktop Full Plan Timetable (1280x800)...');
    const planTab = desktopPage.locator('#nav-btn-plan, button:has-text("Full Plan")').first();
    if (await planTab.isVisible()) {
      await planTab.click();
      await desktopPage.waitForTimeout(1000);
    }
    const planBuf = await desktopPage.screenshot({ type: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'screenshot-plan.png'), planBuf);
    fs.writeFileSync(path.join(publicScreenshotsDir, 'screenshot-plan.png'), planBuf);
    fs.writeFileSync(path.join(distScreenshotsDir, 'screenshot-plan.png'), planBuf);

    // 3. Exam Countdown Screenshot
    console.log('   Capturing Kerala DHSE Exam Countdown (1280x800)...');
    const countdownPage = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    await countdownPage.goto('http://127.0.0.1:3333/pages/exam-countdown.html');
    await countdownPage.waitForLoadState('networkidle');
    await countdownPage.waitForTimeout(1000);
    const countdownBuf = await countdownPage.screenshot({ type: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'screenshot-countdown.png'), countdownBuf);
    fs.writeFileSync(path.join(publicScreenshotsDir, 'screenshot-countdown.png'), countdownBuf);
    fs.writeFileSync(path.join(distScreenshotsDir, 'screenshot-countdown.png'), countdownBuf);
    await countdownPage.close();

    // 4. Mobile View Screenshot (390x844)
    console.log('   Capturing Mobile View (390x844)...');
    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await mobilePage.addInitScript((state) => {
      localStorage.setItem('plusTwoMissionState_v2', JSON.stringify(state));
      localStorage.setItem('plusTwoPlanState', JSON.stringify(state));
      localStorage.setItem('plustwo_theme', 'light');
    }, planState);

    await mobilePage.goto('http://127.0.0.1:3333');
    await mobilePage.waitForLoadState('networkidle');
    await mobilePage.waitForTimeout(1000);

    const mobileBuf = await mobilePage.screenshot({ type: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, 'screenshot-mobile.png'), mobileBuf);
    fs.writeFileSync(path.join(publicScreenshotsDir, 'screenshot-mobile.png'), mobileBuf);
    fs.writeFileSync(path.join(distScreenshotsDir, 'screenshot-mobile.png'), mobileBuf);
    await mobilePage.close();

    await desktopPage.close();
    console.log('   All screenshots captured successfully.');
  } finally {
    await browser.close();
    server.close();
  }
}

async function generateOgPromoBanner() {
  console.log('3. Generating 1200x630 OpenGraph & Google Search Promotional Banner (og-image.png)...');

  // Resize icon to 96x96 for clean header placement
  const logoBuf = await sharp(SOURCE_ICON)
    .resize(96, 96, { fit: 'contain' })
    .png()
    .toBuffer();

  // Resize desktop screenshot for mockup card
  const screenshotPath = path.join(screenshotsDir, 'screenshot-desktop.png');
  let mockupBuf = null;
  if (fs.existsSync(screenshotPath)) {
    const rawMockup = await sharp(screenshotPath)
      .resize(580, 360, { fit: 'cover', position: 'top' })
      .png()
      .toBuffer();

    // Add rounded corners to mockup
    const roundedCornersSvg = Buffer.from(
      `<svg width="580" height="360"><rect x="0" y="0" width="580" height="360" rx="16" ry="16" fill="#fff"/></svg>`
    );
    mockupBuf = await sharp(rawMockup)
      .composite([{ input: roundedCornersSvg, blend: 'dest-in' }])
      .png()
      .toBuffer();
  }

  // Build the high-contrast SVG overlay for text, badges, and card frame
  const svgOverlay = Buffer.from(`
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0a0f1d" />
          <stop offset="50%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1e3a8a" />
        </linearGradient>
        <linearGradient id="blueAccent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#3b82f6" />
          <stop offset="100%" stop-color="#60a5fa" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="16" stdDeviation="30" flood-color="#000000" flood-opacity="0.6"/>
        </filter>
      </defs>

      <!-- Base Gradient -->
      <rect width="1200" height="630" fill="url(#bgGrad)" />

      <!-- Subtle Accent Circles -->
      <circle cx="180" cy="120" r="300" fill="#2563eb" opacity="0.15" filter="blur(60px)" />
      <circle cx="950" cy="450" r="280" fill="#3b82f6" opacity="0.15" filter="blur(70px)" />

      <!-- Top Badge (aligned beside 96px logo) -->
      <g transform="translate(195, 90)">
        <rect width="325" height="34" rx="17" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
        <circle cx="18" cy="17" r="5" fill="#10b981" />
        <text x="32" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="700" fill="#94a3b8" letter-spacing="1">KERALA DHSE (CLASS 12)</text>
      </g>

      <!-- Main Headline -->
      <text x="75" y="245" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="52" font-weight="900" fill="#ffffff" letter-spacing="-1">
        Mission <tspan fill="url(#blueAccent)">PlusTwo</tspan>
      </text>

      <!-- Subtitle -->
      <text x="75" y="295" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="700" fill="#93c5fd" letter-spacing="-0.3">
        Intelligent Daily Study Planner &amp; Timetable
      </text>

      <!-- Key Benefits / Description -->
      <text x="75" y="345" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="500" fill="#cbd5e1">
        Adaptive daily pacing, +1 improvement interleaving,
      </text>
      <text x="75" y="372" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="500" fill="#cbd5e1">
        and dedicated revision buffers for Kerala board exams.
      </text>

      <!-- Stream Pills -->
      <g transform="translate(75, 420)">
        <!-- Science -->
        <rect x="0" y="0" width="135" height="38" rx="12" fill="#1e293b" stroke="#3b82f6" stroke-width="1.5" />
        <text x="67" y="24" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">🔬 Science</text>

        <!-- Commerce -->
        <rect x="145" y="0" width="150" height="38" rx="12" fill="#1e293b" stroke="#3b82f6" stroke-width="1.5" />
        <text x="220" y="24" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">📊 Commerce</text>

        <!-- Humanities -->
        <rect x="305" y="0" width="155" height="38" rx="12" fill="#1e293b" stroke="#3b82f6" stroke-width="1.5" />
        <text x="382" y="24" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">🏛️ Humanities</text>
      </g>

      <!-- Footer Tags -->
      <g transform="translate(75, 545)">
        <text x="0" y="0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#64748b">
          ⚡ 100% Free &amp; Open Source • 📱 Offline PWA • 🌐 hss-planner.web.app
        </text>
      </g>

      <!-- Mockup Card Frame Shadow & Border -->
      <rect x="560" y="130" width="580" height="360" rx="16" fill="#0b1120" stroke="#3b82f6" stroke-width="2" filter="url(#shadow)" opacity="0.6"/>
    </svg>
  `);

  const composites = [
    { input: svgOverlay, top: 0, left: 0 },
    { input: logoBuf, top: 60, left: 75 },
  ];

  if (mockupBuf) {
    composites.push({ input: mockupBuf, top: 130, left: 560 });
  }

  const ogBuffer = await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 10, g: 15, b: 29, alpha: 1 },
    },
  })
    .composite(composites)
    .png({ quality: 95 })
    .toBuffer();

  fs.writeFileSync(path.join(rootDir, 'og-image.png'), ogBuffer);
  fs.writeFileSync(path.join(publicDir, 'og-image.png'), ogBuffer);
  fs.writeFileSync(path.join(distDir, 'og-image.png'), ogBuffer);

  console.log('   og-image.png (1200x630) promotional banner generated successfully!');
}

async function run() {
  await generatePwaIcons();
  await captureScreenshots();
  await generateOgPromoBanner();
  console.log('\nSUCCESS! All icons, authentic UI screenshots, and promotional assets ready.');
}

run().catch((err) => {
  console.error('Asset generation failed:', err);
  process.exit(1);
});
