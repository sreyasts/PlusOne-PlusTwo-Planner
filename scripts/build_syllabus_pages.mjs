import fs from 'fs';
import path from 'path';

const summaryPath = path.resolve('src/data/all-syllabus-summary.json');
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

const SUBJECT_META = {
  'Physics': { icon: 'fa-atom', bg: 'bg-blue-100', text: 'text-blue-600', streams: ['science'], desc: 'Mechanics, Electromagnetism, Optics & Modern Physics' },
  'Chemistry': { icon: 'fa-flask-vial', bg: 'bg-amber-100', text: 'text-amber-600', streams: ['science'], desc: 'Physical, Inorganic & Organic Reactions & Kinetics' },
  'Mathematics': { icon: 'fa-square-root-variable', bg: 'bg-indigo-100', text: 'text-indigo-600', streams: ['science', 'commerce'], desc: 'Calculus, Algebra, Probability & Vectors' },
  'Computer Science': { icon: 'fa-code', bg: 'bg-emerald-100', text: 'text-emerald-600', streams: ['science'], desc: 'C++, Python, Web Technologies, PHP & SQL' },
  'Botany': { icon: 'fa-seedling', bg: 'bg-teal-100', text: 'text-teal-600', streams: ['science'], desc: 'Plant Physiology, Morphology, Cell Biology & Genetics' },
  'Zoology': { icon: 'fa-dna', bg: 'bg-rose-100', text: 'text-rose-600', streams: ['science'], desc: 'Animal Kingdom, Human Physiology, Biotechnology & Evolution' },
  'Accountancy': { icon: 'fa-calculator', bg: 'bg-cyan-100', text: 'text-cyan-700', streams: ['commerce'], desc: 'Financial Statements, Partnership, Companies & Analysis' },
  'Business Studies': { icon: 'fa-briefcase', bg: 'bg-orange-100', text: 'text-orange-600', streams: ['commerce'], desc: 'Management Principles, Business Finance & Marketing' },
  'Economics': { icon: 'fa-chart-line', bg: 'bg-violet-100', text: 'text-violet-600', streams: ['commerce', 'humanities'], desc: 'Microeconomics, Macroeconomics, Statistics & Indian Economy' },
  'Computer Applications': { icon: 'fa-laptop-code', bg: 'bg-sky-100', text: 'text-sky-600', streams: ['commerce'], desc: 'Business Computing, Web Designing, RDBMS & Enterprise Tools' },
  'History': { icon: 'fa-landmark', bg: 'bg-stone-100', text: 'text-stone-700', streams: ['humanities'], desc: 'Themes in World History & Indian History (Ancient to Modern)' },
  'Political Science': { icon: 'fa-scale-balanced', bg: 'bg-red-100', text: 'text-red-600', streams: ['humanities'], desc: 'Indian Constitution, Political Theory & World Politics' },
  'Sociology': { icon: 'fa-users', bg: 'bg-fuchsia-100', text: 'text-fuchsia-600', streams: ['humanities'], desc: 'Indian Society, Social Change & Demographic Structure' }
};

function generateSyllabusHtml(defaultGrade) {
  const canonicalUrl = defaultGrade === '+1' ? 'https://hss-planner.web.app/pages/syllabus-plus-one' : 'https://hss-planner.web.app/pages/syllabus-plus-two';
  const pageTitle = defaultGrade === '+1'
    ? 'Kerala Plus One Syllabus Daily Planner & DHSE Scheme of Work 2026–2027 (+1 & +2)'
    : 'Kerala Higher Secondary Syllabus Daily Planner & DHSE Scheme of Work 2026–2027 (+1 & +2)';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script id="canonical-domain-bridge">
    (function() {
        try {
            var CANONICAL_HOST = 'hss-planner.web.app';
            var currentHost = window.location.hostname;
            var isLocal = currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost.startsWith('192.168.');
            if (!isLocal && currentHost !== CANONICAL_HOST && (currentHost.includes('github.io') || currentHost.includes('plusone-plustwo-planner.web.app') || currentHost.includes('mission-plustwo.web.app') || currentHost.includes('hssplanner.web.app'))) {
                var cleanPath = window.location.pathname.replace(/^\\/intelligent-study-planner-for-plus-two-?/, '');
                if (!cleanPath || cleanPath === '') cleanPath = '/';
                var target = 'https://' + CANONICAL_HOST + cleanPath + window.location.search + window.location.hash;
                window.location.replace(target);
            }
        } catch(e) {}
    })();
    </script>
    <title>${pageTitle}</title>
    <meta name="description" content="Comprehensive Kerala Higher Secondary syllabus daily planner for Class 11 (+1) and Class 12 (+2). Official DHSE Scheme of Work covering Science (CS/Bio), Commerce, and Humanities.">
    <meta name="keywords" content="Plus One study planner, Plus One planner, Plus Two study planner, Plus Two planner, planner, HSS planner, HSS level planner, plan, study plan, How can I complete my Plus Two syllabus, How to complete HSS syllabus, custom syllabus planner, Plus Two, Plus One, HSS, kerala higher secondary syllabus daily planner, kerala plus two syllabus 2026, dhse scheme of work daily study planner, plus two daily planner kerala, scert plus two syllabus plan, hsslive plus two, plus two study planner">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
    <meta name="thumbnail" content="https://hss-planner.web.app/og-image.png">
    <meta name="image" content="https://hss-planner.web.app/og-image.png">
    <link rel="canonical" href="${canonicalUrl}">
    <link rel="icon" href="/favicon.ico" sizes="48x48">
    <link rel="icon" type="image/png" sizes="48x48" href="/icon-48.png">
    <link rel="icon" type="image/png" sizes="96x96" href="/icon-96.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
    <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="shortcut icon" href="/favicon.ico">

    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:site_name" content="HSS Planner">
    <meta property="og:title" content="${pageTitle}">
    <meta property="og:description" content="Official Kerala Higher Secondary syllabus mapped into actionable daily study timetables with automated pacing and revision buffers for Science, Commerce, and Humanities.">
    <meta property="og:image" content="https://hss-planner.web.app/og-image.png">
    <meta property="og:logo" content="https://hss-planner.web.app/icon.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="https://hss-planner.web.app/og-image.png">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">

    <script type="application/ld+json">
    [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "HSS Planner",
            "item": "https://hss-planner.web.app/"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Kerala Higher Secondary Syllabus Daily Planner",
            "item": "${canonicalUrl}"
          }
        ]
      },
      {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "Kerala Higher Secondary Syllabus Daily Planner",
        "url": "${canonicalUrl}",
        "applicationCategory": "EducationalApplication",
        "applicationSubCategory": "Syllabus Pacing & Daily Timetable Planner",
        "operatingSystem": "All",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "INR"
        },
        "description": "Daily study planner mapped to the Kerala DHSE Higher Secondary Scheme of Work for Science, Commerce, and Humanities across Plus One and Plus Two."
      }
    ]
    </script>
    <style>
        html, body { overflow-x: clip; }
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
    </style>
</head>
<body class="bg-slate-50 text-slate-800 antialiased min-h-screen flex flex-col">
    <!-- Header -->
    <header class="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div class="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <a href="/" class="flex items-center gap-3">
                <img src="/icon.png" alt="HSS Planner Logo" class="w-10 h-10 rounded-xl shadow-md shadow-blue-500/20 object-contain">
                <div>
                    <span class="text-base font-extrabold text-slate-900 tracking-tight block">HSS <span class="text-blue-600">Planner</span></span>
                    <p class="text-[11px] text-slate-500">Kerala Higher Secondary Daily Planner</p>
                </div>
            </a>
            <div class="flex items-center gap-2">
                <a href="/pages/plus-two-timetable" class="hidden sm:inline-flex px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 transition-colors">Timetable</a>
                <a href="/pages/exam-countdown" class="hidden sm:inline-flex px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 transition-colors">Countdown</a>
                <a href="/" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md transition flex items-center gap-1.5 active:scale-95 transition-transform">
                    <i class="fa-solid fa-calendar-check"></i>
                    <span>Open Planner</span>
                </a>
            </div>
        </div>
    </header>

    <!-- Hero -->
    <main class="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex-grow w-full">
        <div class="text-center mb-8">
            <span class="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                Kerala DHSE 2026–2027 Official Curriculum & Scheme of Work
            </span>
            <h1 class="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-3 mb-2 tracking-tight">
                Kerala Higher Secondary Syllabus Daily Planner
            </h1>
            <p class="text-sm text-slate-600 max-w-2xl mx-auto">
                Official NCERT & SCERT rationalized syllabus mapped for <strong class="text-slate-900">Class 11 (+1)</strong> and <strong class="text-slate-900">Class 12 (+2)</strong> across Science, Commerce, and Humanities.
            </p>
        </div>

        <!-- Grade & Stream Controls Card -->
        <div class="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm mb-8 space-y-4">
            <!-- Grade Switcher Tabs -->
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select Academic Level</label>
                <div class="grid grid-cols-2 gap-2" id="gradeSelector">
                    <button type="button" id="btn-grade-p2" onclick="setGrade('+2')" class="py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-extrabold border-2 transition flex items-center justify-center gap-2 cursor-pointer">
                        <i class="fa-solid fa-graduation-cap text-blue-600"></i>
                        <span>Plus Two (+2 / Class 12)</span>
                    </button>
                    <button type="button" id="btn-grade-p1" onclick="setGrade('+1')" class="py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-extrabold border-2 transition flex items-center justify-center gap-2 cursor-pointer">
                        <i class="fa-solid fa-book-open text-emerald-600"></i>
                        <span>Plus One (+1 / Class 11)</span>
                    </button>
                </div>
            </div>

            <!-- Stream Filter Tabs -->
            <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Filter by Stream</label>
                <div class="flex flex-wrap gap-2" id="streamTabs">
                    <button type="button" onclick="setStream('all')" data-stream="all" class="stream-pill px-3.5 py-1.5 rounded-xl text-xs font-bold border transition">
                        All Subjects (13)
                    </button>
                    <button type="button" onclick="setStream('science')" data-stream="science" class="stream-pill px-3.5 py-1.5 rounded-xl text-xs font-bold border transition">
                        Science (Bio & CS)
                    </button>
                    <button type="button" onclick="setStream('commerce')" data-stream="commerce" class="stream-pill px-3.5 py-1.5 rounded-xl text-xs font-bold border transition">
                        Commerce
                    </button>
                    <button type="button" onclick="setStream('humanities')" data-stream="humanities" class="stream-pill px-3.5 py-1.5 rounded-xl text-xs font-bold border transition">
                        Humanities
                    </button>
                </div>
            </div>

            <!-- Instant Search Input -->
            <div class="relative pt-2">
                <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-5 text-slate-400 text-xs"></i>
                <input type="text" id="syllabusSearch" oninput="onSearchInput()" placeholder="Search any chapter, numerical or topic (e.g. Calculus, Magnetism, Accounting, Pointers)..." class="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm focus:border-blue-500 focus:bg-white focus:outline-none transition">
            </div>
        </div>

        <!-- Subjects Container (Populated dynamically) -->
        <div id="subjectsContainer" class="space-y-8">
            <!-- Rendered by JavaScript -->
        </div>

        <!-- CTA Box -->
        <div class="mt-10 p-8 rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white text-center shadow-xl">
            <h2 class="text-2xl font-bold mb-2">Ready to master your syllabus on schedule?</h2>
            <p class="text-sm text-blue-100 max-w-md mx-auto mb-6">
                Create a customized, day-by-day study schedule with automatic revision buffers for Plus One and Plus Two.
            </p>
            <a href="/" class="inline-flex items-center gap-2 bg-white text-blue-600 hover:bg-blue-50 font-bold py-3 px-6 rounded-2xl shadow-lg transition transform active:scale-95">
                <span>Start Free Study Planner</span>
                <i class="fa-solid fa-arrow-right"></i>
            </a>
        </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-slate-200 py-6 px-4 text-center text-xs text-slate-500 bg-white mt-12">
        <div class="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>HSS Planner • Free & Open Source for Kerala Higher Secondary (+1 & +2)</div>
            <div class="flex gap-4">
                <a href="/" class="hover:text-blue-600">Planner</a>
                <a href="/pages/plus-two-timetable" class="hover:text-blue-600">Timetable</a>
                <a href="/pages/exam-countdown" class="hover:text-blue-600">Countdown</a>
                <a href="/pages/study-hours-calculator" class="hover:text-blue-600">Hours Calculator</a>
                <a href="/pages/backlog-recovery-planner" class="hover:text-blue-600">Backlog Recovery</a>
                <a href="/pages/privacy" class="hover:text-blue-600">Privacy</a>
            </div>
        </div>
    </footer>

    <script>
    const SYLLABUS_DATA = ${JSON.stringify(summary)};
    const SUBJECT_META = ${JSON.stringify(SUBJECT_META)};

    let currentGrade = '${defaultGrade}';
    let currentStream = 'all';
    let searchQuery = '';

    // Parse initial URL query params if present
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('grade') === '+1' || params.get('grade') === '11') currentGrade = '+1';
        if (params.get('grade') === '+2' || params.get('grade') === '12') currentGrade = '+2';
        if (params.get('stream')) currentStream = params.get('stream').toLowerCase();
    } catch (_) {}

    function setGrade(grade) {
        currentGrade = grade;
        render();
    }

    function setStream(stream) {
        currentStream = stream;
        render();
    }

    function onSearchInput() {
        const input = document.getElementById('syllabusSearch');
        searchQuery = (input ? input.value : '').trim().toLowerCase();
        render();
    }

    function render() {
        // 1. Update Grade UI buttons
        const btnP2 = document.getElementById('btn-grade-p2');
        const btnP1 = document.getElementById('btn-grade-p1');
        if (btnP2 && btnP1) {
            if (currentGrade === '+2') {
                btnP2.className = 'py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-extrabold border-2 border-blue-600 bg-blue-50 text-blue-800 shadow-xs flex items-center justify-center gap-2 cursor-pointer';
                btnP1.className = 'py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-extrabold border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2 cursor-pointer';
            } else {
                btnP1.className = 'py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-extrabold border-2 border-emerald-600 bg-emerald-50 text-emerald-800 shadow-xs flex items-center justify-center gap-2 cursor-pointer';
                btnP2.className = 'py-2.5 px-4 rounded-2xl text-xs sm:text-sm font-extrabold border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2 cursor-pointer';
            }
        }

        // 2. Update Stream UI buttons
        document.querySelectorAll('.stream-pill').forEach(btn => {
            const s = btn.getAttribute('data-stream');
            if (s === currentStream) {
                btn.className = 'stream-pill px-3.5 py-1.5 rounded-xl text-xs font-bold border border-blue-600 bg-blue-600 text-white shadow-xs cursor-pointer';
            } else {
                btn.className = 'stream-pill px-3.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer';
            }
        });

        // 3. Filter subjects
        const gradeKey = currentGrade === '+1' ? 'plusOne' : 'plusTwo';
        const subjectsData = SYLLABUS_DATA[gradeKey] || {};
        const container = document.getElementById('subjectsContainer');
        if (!container) return;

        const subjectEntries = Object.entries(subjectsData);
        let renderedCount = 0;
        let html = '';

        for (const [subName, chapters] of subjectEntries) {
            const meta = SUBJECT_META[subName] || { icon: 'fa-book', bg: 'bg-slate-100', text: 'text-slate-600', streams: ['science'], desc: '' };
            
            // Check stream match
            if (currentStream !== 'all' && !meta.streams.includes(currentStream)) {
                continue;
            }

            // Check search filter against subject name or chapter names
            let filteredChapters = chapters;
            if (searchQuery) {
                const subMatches = subName.toLowerCase().includes(searchQuery);
                filteredChapters = chapters.filter(c => subMatches || c.name.toLowerCase().includes(searchQuery));
                if (filteredChapters.length === 0) continue;
            }

            renderedCount++;
            const totalHours = Math.round(filteredChapters.reduce((sum, c) => sum + (c.mins || 60), 0) / 60);
            const streamBadges = meta.streams.map(s => {
                if (s === 'science') return '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Science</span>';
                if (s === 'commerce') return '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Commerce</span>';
                if (s === 'humanities') return '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">Humanities</span>';
                return '';
            }).join(' ');

            html += \`
                <section class="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm animate-fade-in">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-100">
                        <div class="flex items-center gap-3">
                            <div class="w-11 h-11 rounded-2xl \${meta.bg} \${meta.text} flex items-center justify-center text-xl font-bold shrink-0">
                                <i class="fa-solid \${meta.icon}"></i>
                            </div>
                            <div>
                                <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                                    <span>\${subName} (\${filteredChapters.length} Chapters)</span>
                                    <span class="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">\${currentGrade}</span>
                                </h2>
                                <p class="text-xs text-slate-500 mt-0.5">\${meta.desc} • ~\${totalHours} Study Hours</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 flex-wrap">
                            \${streamBadges}
                            <a href="/?grade=\${encodeURIComponent(currentGrade)}&subject=\${encodeURIComponent(subName)}" class="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 transition flex items-center gap-1 active:scale-95">
                                <span>Study in Planner &rarr;</span>
                            </a>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        \${filteredChapters.map(c => {
                            const termPill = c.term === 1 ? '<span class="text-blue-600 font-bold ml-1">• Term 1</span>' :
                                             c.term === 2 ? '<span class="text-amber-600 font-bold ml-1">• Term 2</span>' :
                                                            '<span class="text-purple-600 font-bold ml-1">• Term 3</span>';
                            return \`<div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2 hover:bg-slate-100/70 transition">
                                <span class="font-medium text-slate-800">\${c.num}. \${c.name} \${termPill}</span>
                                <span class="text-[10px] text-slate-400 shrink-0">\${c.mins || 60}m</span>
                            </div>\`;
                        }).join('')}
                    </div>
                </section>
            \`;
        }

        if (renderedCount === 0) {
            html = \`
                <div class="text-center py-12 bg-white rounded-3xl border border-slate-200 p-6">
                    <i class="fa-solid fa-magnifying-glass text-3xl text-slate-300 mb-3"></i>
                    <h3 class="text-base font-bold text-slate-800 mb-1">No chapters found</h3>
                    <p class="text-xs text-slate-500 max-w-sm mx-auto mb-4">No matching chapters found for "\${searchQuery}" under \${currentGrade}. Try searching another term or resetting filters.</p>
                    <button type="button" onclick="document.getElementById('syllabusSearch').value=''; searchQuery=''; render();" class="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Clear Search</button>
                </div>
            \`;
        }

        container.innerHTML = html;
    }

    // Initial render on page load
    document.addEventListener('DOMContentLoaded', render);
    render();
    </script>
</body>
</html>`;
}

fs.writeFileSync('pages/syllabus-plus-two.html', generateSyllabusHtml('+2'), 'utf8');
console.log('Successfully wrote pages/syllabus-plus-two.html');

fs.writeFileSync('pages/syllabus-plus-one.html', generateSyllabusHtml('+1'), 'utf8');
console.log('Successfully wrote pages/syllabus-plus-one.html');
