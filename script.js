/* ═══════════════════════════════════════════════
   CVnexa — script.js
   Author : Saad Iqbal Esti
   Email  : estisaad@gmail.com
   LinkedIn: https://www.linkedin.com/in/saad-iqbal-esti-ba8b41340
   NOTE: All button events wired in JS — zero inline onclick needed
═══════════════════════════════════════════════ */
'use strict';

/* ─────────────────────────────────────
   STATE
───────────────────────────────────── */
let selectedFile = null;

/* ─────────────────────────────────────
   MESH CANVAS BACKGROUND
───────────────────────────────────── */
const meshInstances = {};

function initMesh(id) {
  if (meshInstances[id]) return;          // don't double-init
  const canvas = document.getElementById(id);
  if (!canvas) return;
  meshInstances[id] = true;

  const ctx = canvas.getContext('2d');
  const orbs = [
    { x:.15, y:.15, r:.38, c:'rgba(255,77,28,0.17)',  spd:.0003, ph:0   },
    { x:.82, y:.12, r:.32, c:'rgba(255,140,0,0.13)',  spd:.0004, ph:1.2 },
    { x:.65, y:.75, r:.36, c:'rgba(255,77,28,0.10)',  spd:.00035,ph:2.4 },
    { x:.10, y:.72, r:.28, c:'rgba(204,58,18,0.12)',  spd:.00025,ph:0.8 },
    { x:.50, y:.45, r:.22, c:'rgba(255,122,80,0.08)', spd:.00045,ph:1.8 },
  ];

  function resize() {
    canvas.width  = canvas.offsetWidth  || window.innerWidth;
    canvas.height = canvas.offsetHeight || window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  let t = 0;
  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const W = canvas.width, H = canvas.height;
    orbs.forEach(o => {
      const ox = o.x * W + Math.sin(t * o.spd * 1000 + o.ph) * W * 0.06;
      const oy = o.y * H + Math.cos(t * o.spd * 800  + o.ph) * H * 0.06;
      const r  = o.r * Math.max(W, H);
      const g  = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
      g.addColorStop(0, o.c);
      g.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    });
    t++;
    requestAnimationFrame(draw);
  })();
}

/* ─────────────────────────────────────
   SCREEN NAVIGATION
───────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const map = { 'screen-home':'meshCanvas', 'screen-upload':'meshCanvas2', 'screen-results':'meshCanvas3' };
  if (map[id]) initMesh(map[id]);
}

/* ─────────────────────────────────────
   FILE PROCESSING
───────────────────────────────────── */
function processFile(file) {
  if (!file) return;

  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    showToast('❌ Only PDF files are accepted.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('❌ File exceeds 10 MB limit.');
    return;
  }

  selectedFile = file;

  // Update preview
  const prev = document.getElementById('filePreview');
  const name = document.getElementById('fpName');
  const size = document.getElementById('fpSize');
  const btn  = document.getElementById('analyzeBtn');

  if (name) name.textContent = file.name;
  if (size) size.textContent = fmtBytes(file.size);
  if (prev) prev.style.display = 'flex';
  if (btn)  btn.disabled = false;

  // Visual feedback on drop zone
  const dz = document.getElementById('dropZone');
  if (dz) dz.classList.add('drag-active');
}

function removeFile() {
  selectedFile = null;
  const inp  = document.getElementById('fileInput');
  const prev = document.getElementById('filePreview');
  const btn  = document.getElementById('analyzeBtn');
  const dz   = document.getElementById('dropZone');
  if (inp)  inp.value = '';
  if (prev) prev.style.display = 'none';
  if (btn)  btn.disabled = true;
  if (dz)   dz.classList.remove('drag-active');
}

/* ─────────────────────────────────────
   PDF EXTRACTION — 3 methods
───────────────────────────────────── */
async function loadScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  return new Promise((res, rej) => {
    const s   = document.createElement('script');
    s.src     = src;
    s.onload  = res;
    s.onerror = () => rej(new Error('Script load failed: ' + src));
    document.head.appendChild(s);
  });
}

async function extractPDF(file) {
  // Method 1 — PDF.js (no worker mode to avoid CORS)
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buf),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true
    }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const ct   = await page.getTextContent();
      text += ct.items.map(it => it.str).join(' ') + '\n';
    }
    if (text.trim().length > 60) return text;
    throw new Error('Too little text from PDF.js');
  } catch(e) {
    console.warn('[CVnexa] PDF.js failed:', e.message);
  }

  // Method 2 — raw binary ASCII scrape
  try {
    const text = await binaryScrape(file);
    if (text.trim().length > 60) return text;
    throw new Error('Binary scrape too short');
  } catch(e) {
    console.warn('[CVnexa] Binary scrape failed:', e.message);
  }

  // Method 3 — filename only (last resort)
  console.warn('[CVnexa] All extraction failed — using filename');
  return file.name.replace(/[-_.]/g, ' ');
}

function binaryScrape(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const bytes = new Uint8Array(e.target.result);
        let out = '', chunk = '';
        for (let i = 0; i < bytes.length; i++) {
          const c = bytes[i];
          if (c >= 32 && c <= 126) {
            chunk += String.fromCharCode(c);
          } else {
            if (chunk.length > 3) out += chunk + ' ';
            chunk = '';
          }
        }
        if (chunk.length > 3) out += chunk;
        resolve(out);
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/* ─────────────────────────────────────
   MAIN ANALYSIS RUNNER
───────────────────────────────────── */
async function runAnalysis() {
  if (!selectedFile) {
    showToast('Please select a PDF file first.');
    return;
  }

  const overlay = document.getElementById('loadOverlay');
  const btn     = document.getElementById('analyzeBtn');
  const steps   = ['ls1','ls2','ls3','ls4'];

  btn.disabled = true;
  overlay.classList.add('show');
  steps.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active','done');
  });

  const setStep = (idx) => {
    steps.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('active','done');
      if (i < idx)  el.classList.add('done');
      if (i === idx) el.classList.add('active');
    });
  };

  try {
    setStep(0); await sleep(400);
    const text = await extractPDF(selectedFile);

    setStep(1); await sleep(500);
    const result = analyzeResume(text, selectedFile.name);

    setStep(2); await sleep(500);
    setStep(3); await sleep(400);

    overlay.classList.remove('show');
    btn.disabled = false;

    renderResults(result);
    showScreen('screen-results');

  } catch(err) {
    console.error('[CVnexa] Analysis error:', err);
    overlay.classList.remove('show');
    btn.disabled = false;
    showToast('Analysis failed. Please try a different PDF.');
  }
}

/* ─────────────────────────────────────
   SKILL DATABASE
───────────────────────────────────── */
const SKILL_DB = {
  'Languages':        ['javascript','typescript','python','java','c++','c#','c','go','golang','rust','ruby','php','swift','kotlin','dart','scala','r','matlab','bash','shell','powershell','perl','haskell','lua','elixir','groovy','vba','cobol','fortran'],
  'Frontend':         ['html','css','html5','css3','sass','scss','less','react','reactjs','vue','vuejs','angular','svelte','nextjs','next.js','nuxtjs','gatsby','astro','tailwind','tailwindcss','bootstrap','material-ui','chakra-ui','jquery','redux','zustand','mobx','graphql','webpack','vite','rollup','babel','jest','cypress','playwright','puppeteer','storybook','pwa'],
  'Backend':          ['nodejs','node.js','express','expressjs','fastapi','flask','django','spring','springboot','laravel','rails','nestjs','hapi','koa','gin','asp.net','.net core','rest api','restful','microservices','serverless','lambda','grpc','websocket','oauth','jwt'],
  'Mobile':           ['react native','flutter','android','ios','swift','kotlin','xamarin','ionic','expo','jetpack compose','swiftui'],
  'Databases':        ['sql','mysql','postgresql','postgres','mongodb','firebase','firestore','redis','sqlite','oracle','mariadb','cassandra','dynamodb','elasticsearch','neo4j','supabase','prisma','sequelize','mongoose','typeorm'],
  'DevOps / Cloud':   ['aws','azure','gcp','google cloud','docker','kubernetes','k8s','terraform','ansible','jenkins','github actions','gitlab ci','ci/cd','linux','ubuntu','nginx','apache','heroku','netlify','vercel','cloudflare','prometheus','grafana','helm'],
  'AI / ML / Data':   ['machine learning','deep learning','neural network','tensorflow','pytorch','keras','scikit-learn','pandas','numpy','matplotlib','seaborn','opencv','nlp','natural language processing','computer vision','data science','data analysis','big data','spark','hadoop','airflow','dbt','tableau','power bi','jupyter','kaggle','hugging face','transformers','llm','openai','langchain','generative ai','mlops','rag'],
  'Tools & Practices':['git','github','gitlab','bitbucket','jira','confluence','notion','figma','adobe xd','sketch','postman','insomnia','vs code','intellij','agile','scrum','kanban','tdd','bdd','unit testing','solid','design patterns','clean code','ssl','https','security','owasp','seo','accessibility','wcag'],
};

const ALL_SKILLS = [...new Set(Object.values(SKILL_DB).flat())];

const SECTIONS_KW = {
  Education:      ['education','academic','university','college','school','degree','bachelor','master','phd','b.sc','m.sc','b.tech','m.tech','mba','diploma','graduation','coursework','gpa','cgpa'],
  Experience:     ['experience','work experience','employment','internship','intern','position','company','organization','worked at','responsibilities','achievements','employment history'],
  Skills:         ['skills','technical skills','core competencies','proficiencies','expertise','tools','technologies','stack'],
  Projects:       ['projects','portfolio','built','developed','created','deployed','personal projects','academic projects','open source','github.com','live demo'],
  Summary:        ['summary','objective','profile','about me','professional summary','career objective','overview'],
  Certifications: ['certifications','certificate','certified','credential','license','award','achievement'],
  Languages:      ['languages','language proficiency','spoken','bilingual','fluent','native','english','urdu','arabic','french','spanish','german'],
  Contact:        ['contact','email','phone','linkedin','github','twitter','portfolio','website','address'],
};

/* ─────────────────────────────────────
   ANALYSIS ENGINE
───────────────────────────────────── */
function analyzeResume(text, filename) {
  const low   = text.toLowerCase();
  const words = low.split(/\s+/).filter(Boolean);
  const wc    = words.length;

  // Skill detection
  const detected = ALL_SKILLS.filter(skill => {
    const esc = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, 'i').test(low);
  });

  // Missing skills (domain-relevant)
  const missing = ALL_SKILLS.filter(s => !detected.includes(s) && isRelevantMissing(s, detected)).slice(0, 24);

  // Section detection
  const sections = {};
  Object.entries(SECTIONS_KW).forEach(([name, kws]) => {
    sections[name] = kws.some(kw => low.includes(kw));
  });

  // Signals
  const signals = {
    hasEmail:     /@[a-z0-9._%+\-]+\.[a-z]{2,}/i.test(low),
    hasPhone:     /(\+?\d[\d\s\-(). ]{6,}\d)/.test(low),
    hasLinkedin:  /linkedin/i.test(low),
    hasGithub:    /github\.com/i.test(low),
    hasPortfolio: /portfolio|behance|dribbble/i.test(low),
    quantCount:   (low.match(/\d+\s*(%|percent|\$|usd|k\b|million|users|clients|reduced|improved|increased|faster|saved|deployed|launched)/gi) || []).length,
    hasActionVerbs: /\b(built|designed|developed|created|led|managed|optimized|reduced|improved|increased|deployed|launched|architected|scaled|automated|integrated|delivered|implemented|engineered|spearheaded|coordinated|established|achieved)\b/i.test(low),
  };

  // Top keywords
  const stopWords = new Set(['the','and','for','are','was','with','that','have','from','this','will','your','been','which','they','their','also','into','its','can','has','but','not','you','all','who','had','more','when','than','what','some','time','just','each','use','how','one','our','over','after','about','then','them','these','make','like','work','only','where','much','those','many','before','well']);
  const freq = {};
  words.forEach(w => {
    const cl = w.replace(/[^a-z]/g,'');
    if (cl.length > 3 && !stopWords.has(cl)) freq[cl] = (freq[cl]||0)+1;
  });
  const topKeywords = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([word,count])=>({word,count}));

  // Score calculation
  let score = 0;
  // Skills (max 30)
  score += detected.length >= 20 ? 30 : detected.length >= 12 ? 24 : detected.length >= 7 ? 18 : detected.length >= 4 ? 12 : detected.length >= 1 ? 6 : 0;
  // Sections (3 pts each, max 24)
  Object.values(sections).forEach(found => { if (found) score += 3; });
  // Length (max 10)
  score += wc > 500 ? 10 : wc > 300 ? 7 : wc > 150 ? 4 : wc > 50 ? 2 : 0;
  // Contact signals (max 8)
  if (signals.hasEmail)   score += 3;
  if (signals.hasPhone)   score += 2;
  if (signals.hasLinkedin) score += 3;
  // Summary (max 6)
  if (sections['Summary']) score += 6;
  // Quantified (max 8)
  score += Math.min(8, signals.quantCount * 2);
  // Links (max 6)
  if (signals.hasGithub)    score += 4;
  if (signals.hasPortfolio) score += 2;

  score = Math.min(100, Math.max(0, Math.round(score)));

  const foundSections = Object.values(sections).filter(Boolean).length;
  const suggestions   = buildSuggestions({ score, detected, missing, sections, wc, signals });

  return { score, filename, detected, missing, sections, signals, suggestions, topKeywords, wordCount: wc, foundSections, rawText: low };
}

function isRelevantMissing(skill, detected) {
  const always = ['git','github','docker','linux','rest api','sql','javascript','python','typescript','agile','scrum'];
  if (always.includes(skill)) return true;
  const isFE = detected.some(s=>['react','vue','angular','html','css','svelte','nextjs'].includes(s));
  if (isFE && SKILL_DB['Frontend'].includes(skill)) return true;
  const isBE = detected.some(s=>['nodejs','python','java','django','flask','express','spring'].includes(s));
  if (isBE && SKILL_DB['Backend'].includes(skill)) return true;
  const isAI = detected.some(s=>['python','tensorflow','pytorch','pandas','numpy'].includes(s));
  if (isAI && SKILL_DB['AI / ML / Data'].includes(skill)) return true;
  const isDO = detected.some(s=>['docker','aws','linux','kubernetes','terraform'].includes(s));
  if (isDO && SKILL_DB['DevOps / Cloud'].includes(skill)) return true;
  return false;
}

function buildSuggestions({ score, detected, missing, sections, wc, signals }) {
  const tips = [];
  if (!sections['Summary'])    tips.push('Add a Professional Summary (3–5 lines) at the very top. It sets the entire narrative of your application.');
  if (!sections['Experience']) tips.push('Add a Work Experience or Internship section. For each role include company name, title, dates, and 3–4 impact-focused bullet points.');
  if (!sections['Projects'])   tips.push('Add a Projects section. State the problem solved, tech used, and include a GitHub or live URL for each project.');
  if (!sections['Education'])  tips.push('Include your Education section with degree title, institution, graduation year, and CGPA if strong.');
  if (!sections['Skills'])     tips.push('Create a dedicated Skills section grouped by category: Languages, Frameworks, Tools, Databases. Essential for ATS scanning.');
  if (!signals.hasLinkedin)    tips.push('Add your LinkedIn profile URL. Recruiters verify candidates on LinkedIn before shortlisting — keep it updated.');
  if (!signals.hasGithub && detected.some(s=>['javascript','python','react','nodejs','java','typescript','flutter'].includes(s)))
    tips.push('Add your GitHub URL. For technical roles an active GitHub with documented projects can outperform a degree on a recruiter\'s checklist.');
  if (signals.quantCount < 2)  tips.push('Quantify at least 3 achievements. "Reduced API response time by 45%" beats "Improved performance" every single time.');
  if (!signals.hasActionVerbs) tips.push('Start every bullet with an action verb: Built, Designed, Deployed, Led, Optimized, Reduced, Scaled, Automated, Delivered, Launched.');
  if (missing.length > 6)      tips.push(`You may be missing skills employers expect. Consider adding: ${missing.slice(0,5).map(capitalize).join(', ')}. Even beginner-level exposure is worth listing.`);
  if (wc < 280)                tips.push('Resume content is thin. Expand bullet points — explain not just what you did but how, why, and what the impact was. Target 400–600 words.');
  if (detected.length < 8)     tips.push('Name your technologies explicitly throughout the resume, not just in Skills. "Built with React, Node.js, and PostgreSQL" beats "Built a web app."');
  if (!sections['Certifications']) tips.push('Add Certifications — AWS, Google Cloud, Meta, Coursera etc. Even free certificates show you invest in your own growth.');
  if (!signals.hasEmail || !signals.hasPhone) tips.push('Ensure your email and phone number are clearly visible at the top of your resume. Missing contact info loses opportunities.');
  if (score >= 80) tips.push('Strong resume. Next step: tailor it per job description. Match keywords from each JD and reorder bullets to match what the company emphasizes.');
  if (score < 45)  tips.push('Score below 50 — focus first on: Professional Summary, Skills section, Experience bullets with tool names, and a LinkedIn URL.');
  if (tips.length < 3) tips.push('Keep formatting simple: one column, standard fonts, clear section headers. Tables and icons break ATS parsers and cause auto-rejection.');
  return tips;
}

/* ─────────────────────────────────────
   RENDER RESULTS
───────────────────────────────────── */
function renderResults(data) {
  const wc  = data.wordCount || 0;
  const sig = data.signals;

  // Animated counters
  animCount('arcNum',    data.score, 1400);
  animCount('scoreBig',  data.score, 1400);

  // Arc ring
  setTimeout(() => {
    const off = 502.65 - (data.score / 100) * 502.65;
    document.getElementById('arcFill').style.strokeDashoffset = off;
    document.getElementById('arcGlow').style.strokeDashoffset = off;
  }, 80);

  // Badge & verdict
  const { label, verdict } = grade(data.score);
  setText('scoreBadge',   label);
  setText('scoreVerdict', verdict);
  setText('scoreFile',    '📄 ' + data.filename);

  /* ── SCORE BREAKDOWN ── */
  const skillPts   = Math.min(30, Math.round((data.detected.length/15)*30));
  const secPts     = Math.min(24, data.foundSections * 3);
  const lenPts     = wc>500?10:wc>300?7:wc>150?4:wc>50?2:0;
  const contPts    = Math.min(8,(sig.hasEmail?3:0)+(sig.hasPhone?2:0)+(sig.hasLinkedin?3:0));
  const sumPts     = data.sections['Summary'] ? 6 : 0;
  const quantPts   = Math.min(8, sig.quantCount * 2);
  const linkPts    = Math.min(6,(sig.hasGithub?4:0)+(sig.hasPortfolio?2:0));
  const bdRows = [
    { label:'Skills Detected',         pts:skillPts,  max:30, bar:'bd-fill-fire' },
    { label:'Sections Present',         pts:secPts,    max:24, bar:'bd-fill-teal' },
    { label:'Resume Length',            pts:lenPts,    max:10, bar:'bd-fill-grn'  },
    { label:'Contact Information',      pts:contPts,   max:8,  bar:'bd-fill-gold' },
    { label:'Professional Summary',     pts:sumPts,    max:6,  bar:'bd-fill-purp' },
    { label:'Quantified Achievements',  pts:quantPts,  max:8,  bar:'bd-fill-fire' },
    { label:'GitHub / Portfolio Links', pts:linkPts,   max:6,  bar:'bd-fill-grn'  },
  ];
  const bdEl = document.getElementById('bdGrid');
  if (bdEl) {
    bdEl.innerHTML = bdRows.map(r => {
      const pct  = r.max ? Math.round(r.pts/r.max*100) : 0;
      const qual = r.pts >= r.max*.75 ? 'good' : r.pts >= r.max*.4 ? 'mid' : r.pts > 0 ? 'low' : 'zero';
      return `<div class="bd-row">
        <div class="bd-label">${r.label}</div>
        <div class="bd-track"><div class="bd-fill ${r.bar}" data-w="${pct}"></div></div>
        <div class="bd-pts ${qual}">${r.pts}</div>
        <div class="bd-max">/ ${r.max}</div>
      </div>`;
    }).join('');
    // Animate bars after paint
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bdEl.querySelectorAll('.bd-fill').forEach(el => {
        el.style.width = el.dataset.w + '%';
      });
    }));
  }

  /* ── ATS COMPATIBILITY ── */
  const atsChecks = [
    { label:'Email address present',        pass:sig.hasEmail },
    { label:'Phone number present',         pass:sig.hasPhone },
    { label:'LinkedIn URL present',         pass:sig.hasLinkedin },
    { label:'GitHub link present',          pass:sig.hasGithub },
    { label:'Skills section detected',      pass:data.sections['Skills'] },
    { label:'Experience section detected',  pass:data.sections['Experience'] },
    { label:'Education section detected',   pass:data.sections['Education'] },
    { label:'Professional summary added',   pass:data.sections['Summary'] },
    { label:'Projects section present',     pass:data.sections['Projects'] },
    { label:'At least 5 skills listed',     pass:data.detected.length >= 5 },
    { label:'Measurable achievements',      pass:sig.quantCount >= 2 },
    { label:'Resume has 300+ words',        pass:wc >= 300 },
  ];
  const atsPass = atsChecks.filter(c=>c.pass).length;
  const atsPct  = Math.round(atsPass/atsChecks.length*100);
  const atsLbl  = atsPct >= 80 ? 'ATS Ready' : atsPct >= 55 ? 'Needs Work' : 'High Risk';
  const atsCls  = atsPct >= 80 ? 'rbadge-green' : atsPct >= 55 ? 'rbadge-gold' : 'rbadge-fire';
  const atsBadge = document.getElementById('atsBadge');
  if (atsBadge) { atsBadge.textContent = atsLbl; atsBadge.className = 'rbadge ' + atsCls; }
  setText('atsPct', atsPct + '%');
  setTimeout(() => {
    const f = document.getElementById('atsFill');
    if (f) f.style.width = atsPct + '%';
  }, 150);
  const atsEl = document.getElementById('atsChecks');
  if (atsEl) atsEl.innerHTML = atsChecks.map(c=>`<div class="atsc ${c.pass?'pass':'fail'}"><span>${c.pass?'✓':'✗'}</span> ${c.label}</div>`).join('');

  /* ── CONTENT QUALITY ── */
  const cqBadge = document.getElementById('cqBadge');
  if (cqBadge) { const cl=data.score>=75?'rbadge-green':data.score>=50?'rbadge-gold':'rbadge-fire'; cqBadge.textContent=data.score>=75?'High Quality':data.score>=50?'Average':'Needs Work'; cqBadge.className='rbadge '+cl; }
  const cqRows = [
    { name:'Word Count',          sub:`${wc} words`,                  val:wc>600?'Excellent':wc>350?'Good':wc>150?'Short':'Brief',    cls:wc>600?'good':wc>350?'mid':'low' },
    { name:'Skills Coverage',     sub:`${data.detected.length} skills found`, val:data.detected.length>18?'Excellent':data.detected.length>10?'Good':data.detected.length>4?'Average':'Weak', cls:data.detected.length>18?'good':data.detected.length>10?'mid':'low' },
    { name:'Quantified Results',  sub:`${sig.quantCount} measurable achievements`, val:sig.quantCount>=4?'Strong':sig.quantCount>=2?'Moderate':sig.quantCount===1?'Weak':'Missing', cls:sig.quantCount>=4?'good':sig.quantCount>=2?'mid':'low' },
    { name:'Section Completeness',sub:`${data.foundSections} of 8 sections`, val:data.foundSections>=7?'Complete':data.foundSections>=5?'Good':data.foundSections>=3?'Partial':'Incomplete', cls:data.foundSections>=7?'good':data.foundSections>=5?'mid':'low' },
    { name:'Online Profile Links',sub:'GitHub / LinkedIn / Portfolio', val:(sig.hasGithub&&sig.hasLinkedin)?'Both Present':(sig.hasGithub||sig.hasLinkedin)?'One Present':'None Found', cls:(sig.hasGithub&&sig.hasLinkedin)?'good':(sig.hasGithub||sig.hasLinkedin)?'mid':'low' },
  ];
  const cqEl = document.getElementById('cqRows');
  if (cqEl) cqEl.innerHTML = cqRows.map(r=>`<div class="cq-row"><div><div class="cq-name">${r.name}</div><div class="cq-sub">${r.sub}</div></div><div class="cq-val ${r.cls}">${r.val}</div></div>`).join('');

  /* ── SECTION DETECTION ── */
  const secFound = Object.values(data.sections).filter(Boolean).length;
  const secMiss  = Object.keys(data.sections).length - secFound;
  setText('secFoundCnt', secFound + ' found');
  setText('secMissCnt',  secMiss  + ' missing');
  const secEl = document.getElementById('secGrid');
  if (secEl) secEl.innerHTML = Object.entries(data.sections).map(([name,found])=>`<div class="sec-item ${found?'found':'missing'}"><span class="sec-ico">${found?'✅':'❌'}</span><span class="sec-name">${name}</span><span class="sec-st">${found?'Found':'Missing'}</span></div>`).join('');

  /* ── SKILLS BY CATEGORY ── */
  setText('detCnt', data.detected.length + ' found');
  const catEl = document.getElementById('catGrid');
  if (catEl) {
    let html = '';
    Object.entries(SKILL_DB).forEach(([cat, list]) => {
      const found = data.detected.filter(s => list.includes(s));
      if (!found.length) return;
      html += `<div class="cat-group"><div class="cat-label">${cat} <span class="cat-count">${found.length}</span></div><div class="tag-wrap">${found.map(s=>`<span class="tag-det">✓ ${capitalize(s)}</span>`).join('')}</div></div>`;
    });
    catEl.innerHTML = html || '<p style="color:var(--t3);font-size:.82rem">No skills detected. Use a text-based PDF.</p>';
  }

  /* ── MISSING SKILLS ── */
  setText('misCnt', data.missing.length + ' gaps');
  const misEl = document.getElementById('misCloud');
  if (misEl) misEl.innerHTML = data.missing.length
    ? `<div class="tag-wrap">${data.missing.map(s=>`<span class="tag-mis">+ ${capitalize(s)}</span>`).join('')}</div>`
    : '<p style="color:var(--t3);font-size:.82rem">No major skill gaps detected for your domain.</p>';

  /* ── KEYWORD DENSITY ── */
  const kwEl = document.getElementById('kwBars');
  if (kwEl) {
    const kws = data.topKeywords || [];
    const max = kws[0]?.count || 1;
    kwEl.innerHTML = kws.length
      ? kws.map(k=>`<div class="kw-row"><div class="kw-word">${capitalize(k.word)}</div><div class="kw-track"><div class="kw-fill" data-w="${Math.round(k.count/max*100)}"></div></div><div class="kw-ct">×${k.count}</div></div>`).join('')
      : '<p style="color:var(--t3);font-size:.8rem">Not enough text to analyze keyword density.</p>';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      kwEl.querySelectorAll('.kw-fill').forEach(el => { el.style.width = el.dataset.w + '%'; });
    }));
  }

  /* ── WRITING SIGNALS ── */
  const sigs = [
    { cls:sig.hasActionVerbs?'good':'bad', ico:sig.hasActionVerbs?'💪':'⚠️', title:sig.hasActionVerbs?'Strong Action Verbs Detected':'Missing Action Verbs', body:sig.hasActionVerbs?'Your resume uses active language (built, designed, deployed, etc.) — great for impact.':'Replace passive phrases with action verbs: Built, Designed, Led, Optimized, Delivered.' },
    { cls:sig.quantCount>=2?'good':sig.quantCount===1?'warn':'bad', ico:sig.quantCount>=2?'📈':'📉', title:sig.quantCount>=2?'Quantified Achievements Found':'Lacks Quantified Results', body:sig.quantCount>=2?`${sig.quantCount} measurable results detected. This strongly signals impact to recruiters.`:'Add numbers to your bullets — "Reduced load time by 40%", "Served 2,000+ users", "Managed team of 5".' },
    { cls:sig.hasEmail&&sig.hasPhone?'good':'warn', ico:sig.hasEmail&&sig.hasPhone?'📬':'📭', title:sig.hasEmail&&sig.hasPhone?'Complete Contact Info':'Incomplete Contact Info', body:sig.hasEmail&&sig.hasPhone?'Email and phone both detected — recruiters can reach you easily.':'Ensure both email and phone number are clearly visible at the top of your resume.' },
    { cls:wc>400?'good':wc>200?'warn':'bad', ico:wc>400?'📄':'📃', title:`Resume Length: ${wc} words`, body:wc>600?'Comprehensive length. For under 5 years experience consider trimming to one page.':wc>400?'Good length. Make sure each bullet explains impact, not just duties.':'Resume is short. Expand bullets with context, impact, and specific tools used.' },
    { cls:sig.hasGithub?'good':'warn', ico:sig.hasGithub?'💻':'🔗', title:sig.hasGithub?'GitHub Link Present':'No GitHub Link Found', body:sig.hasGithub?'GitHub detected — great for technical roles. Ensure repos are clean and documented.':'Add your GitHub profile URL, especially for tech roles. It is a live portfolio.' },
  ];
  const sigEl = document.getElementById('signalsList');
  if (sigEl) sigEl.innerHTML = sigs.map(s=>`<div class="sig-item ${s.cls}"><div class="sig-ico">${s.ico}</div><div><div class="sig-title">${s.title}</div><div class="sig-body">${s.body}</div></div></div>`).join('');

  /* ── QUICK WINS ── */
  const qws = [];
  if (!data.sections['Summary'])   qws.push({ico:'✍️',title:'Write a Professional Summary',body:'3–4 lines at the top. Explain who you are, your top skills, and what you bring.'});
  if (!sig.hasLinkedin)            qws.push({ico:'🔗',title:'Add Your LinkedIn URL',body:'Copy your LinkedIn profile URL and paste it in your contact header.'});
  if (!sig.hasGithub&&data.detected.some(s=>['javascript','python','react','nodejs','java'].includes(s))) qws.push({ico:'💻',title:'Add GitHub Profile Link',body:'Go to github.com/yourusername — paste that URL into your resume header.'});
  if (sig.quantCount < 2)          qws.push({ico:'📊',title:'Quantify 3 Bullet Points',body:'Pick 3 bullets and add a measurable metric: duration, scale, improvement %.'});
  if (!data.sections['Projects'])  qws.push({ico:'🚀',title:'Add a Projects Section',body:'Even one well-described project with tech stack and link beats none.'});
  if (data.detected.length < 8)   qws.push({ico:'🛠️',title:'Expand Your Skills Section',body:'List every tool and technology you have ever used — even basic familiarity counts.'});
  if (!qws.length)                 qws.push({ico:'🏆',title:'Resume is Strong',body:'Focus on tailoring this resume to each specific job description for maximum impact.'});
  const qwEl = document.getElementById('qwList');
  if (qwEl) qwEl.innerHTML = qws.slice(0,4).map(q=>`<div class="qw-item"><div class="qw-ico">${q.ico}</div><div><div class="qw-title">${q.title}</div><div class="qw-body">${q.body}</div></div></div>`).join('');

  /* ── SUGGESTIONS ROADMAP ── */
  const sugEl = document.getElementById('sugList');
  if (sugEl) sugEl.innerHTML = data.suggestions.map((tip,i)=>`<div class="sug-item" style="animation-delay:${i*.05}s"><div class="sug-n">${i+1}</div><div>${tip}</div></div>`).join('');

  /* ── FINAL VERDICT ── */
  const vd = finalVerdict(data.score, data);
  setText('verdictIcon', vd.icon);
  setText('verdictHead', vd.head);
  setText('verdictBody', vd.body);
  const vnEl = document.getElementById('vnSteps');
  if (vnEl) vnEl.innerHTML = vd.steps.map((s,i)=>`<div class="vn-step"><div class="vn-num">${i+1}</div><div>${s}</div></div>`).join('');
}

/* ─────────────────────────────────────
   GRADE & VERDICT
───────────────────────────────────── */
function grade(score) {
  if (score>=88) return { label:'🏆 Excellent', verdict:'Exceptional resume. Strong skill coverage, well-structured sections, measurable achievements, and complete contact info. Tailor per job and you will consistently pass ATS filters.' };
  if (score>=74) return { label:'🌟 Strong',    verdict:'Solid, competitive resume that will impress recruiters. A few focused improvements — quantified results and filling skill gaps — will push it to exceptional.' };
  if (score>=57) return { label:'👍 Good',      verdict:'Good foundation with clear, addressable gaps. Acting on even three suggestions below will produce a meaningful score jump and better recruiter response rates.' };
  if (score>=38) return { label:'⚠️ Needs Work', verdict:'Your resume has the basics but is missing critical signals. Every item in the roadmap below is actionable today — fixing the top three will noticeably improve results.' };
  return         { label:'🔴 Incomplete',       verdict:'Several essential sections and credibility signals are missing. A few focused hours using this roadmap will transform it into a competitive document.' };
}

function finalVerdict(score, data) {
  if (score>=88) return { icon:'🏆', head:'Exceptional Resume', body:'Your resume is in the top tier. It has strong skill coverage, well-structured sections, measurable achievements, and complete contact information. Tailor it to each job description and you will consistently make it past ATS filters.', steps:['Tailor keywords to match each specific job description.','Ensure your LinkedIn profile mirrors this resume exactly.','Consider a one-page version if under 5 years experience.','Ask a peer in your industry to review for domain blind spots.'] };
  if (score>=74) return { icon:'🌟', head:'Strong Resume', body:'A solid, competitive resume. A handful of focused improvements — particularly around quantified results and skill gaps — will push it into the exceptional tier.', steps:['Add measurable numbers to at least 3 bullet points.','Include any missing profile links (GitHub, LinkedIn).','Ensure all 8 key sections are present.','Run it through a job description to check keyword alignment.'] };
  if (score>=57) return { icon:'👍', head:'Good Foundation', body:'Your resume has a solid foundation but has clear, addressable gaps. Acting on even three of the improvements below will produce a meaningful score jump.', steps:['Write or expand your Professional Summary.','Add quantified achievements to your experience bullets.','Expand the Skills section with all tools you know.','Add a Projects section if you do not have one.'] };
  if (score>=38) return { icon:'⚠️', head:'Needs Significant Work', body:'Your resume has the basics but is missing several critical signals that recruiters and ATS systems look for. Every item in the roadmap is actionable today.', steps:['Start with a Professional Summary — do this first.','List every technology and tool in a Skills section.','Make sure email, phone, and LinkedIn are all listed.','Add at least one project entry with a GitHub or live link.'] };
  return         { icon:'🔴', head:'Resume Needs Rebuilding', body:'Several essential sections are missing. This does not reflect your abilities — it reflects the structure. A few focused hours will transform it into a competitive document.', steps:['Add section headers: Summary, Skills, Experience, Education.','List every skill you know — languages, tools, frameworks.','Write 2–3 bullets per role starting with action verbs.','Add contact info: email, phone, LinkedIn URL at the top.'] };
}

/* ─────────────────────────────────────
   UTILITIES
───────────────────────────────────── */
const sleep     = ms  => new Promise(r => setTimeout(r, ms));
const capitalize= s   => s.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
const fmtBytes  = b   => b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(2)+' MB';
const setText   = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };

function animCount(id, target, dur) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  (function tick(now) {
    const p = Math.min((now-start)/dur, 1);
    const e = 1-Math.pow(1-p, 3);
    el.textContent = Math.round(e*target);
    if (p<1) requestAnimationFrame(tick);
  })(performance.now());
}

function showToast(msg) {
  const old = document.getElementById('cvnexaToast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'cvnexaToast';
  el.textContent = msg;
  Object.assign(el.style, {
    position:'fixed', bottom:'32px', left:'50%', transform:'translateX(-50%)',
    background:'linear-gradient(135deg,#ff4d1c,#ff8c00)',
    color:'#fff', padding:'12px 26px', borderRadius:'999px',
    fontFamily:'Outfit,sans-serif', fontSize:'.86rem', fontWeight:'600',
    zIndex:'99999', boxShadow:'0 8px 32px rgba(255,77,28,.4)',
    whiteSpace:'nowrap', opacity:'0',
    transition:'opacity .25s ease',
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity='1'; });
  setTimeout(() => { el.style.opacity='0'; setTimeout(()=>el.remove(),300); }, 3200);
}

/* ─────────────────────────────────────
   INIT — wire ALL events here in JS
   (no inline onclick in HTML at all)
───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  // Boot home mesh
  initMesh('meshCanvas');

  /* ── NAVIGATION ── */
  // Home → Upload
  document.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => showScreen(el.dataset.goto));
  });

  /* ── FILE INPUT ── */
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) processFile(f);
    });
  }

  /* ── DROP ZONE ── */
  const dz = document.getElementById('dropZone');
  if (dz) {
    dz.addEventListener('click', () => fileInput && fileInput.click());

    dz.addEventListener('dragover', e => {
      e.preventDefault();
      dz.classList.add('drag-active');
    });
    dz.addEventListener('dragleave', e => {
      if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-active');
    });
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag-active');
      const f = e.dataTransfer.files[0];
      if (f) processFile(f);
      else showToast('Please drop a PDF file.');
    });
  }

  /* ── BROWSE BUTTON (label) — prevent dz click conflict ── */
  const browseLabel = dz && dz.querySelector('label');
  if (browseLabel) {
    browseLabel.addEventListener('click', e => e.stopPropagation());
  }

  /* ── ANALYZE BUTTON ── */
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      if (!analyzeBtn.disabled) runAnalysis();
    });
  }

  /* ── REMOVE FILE BUTTON ── */
  const fpDel = document.getElementById('fpDel');
  if (fpDel) fpDel.addEventListener('click', e => { e.stopPropagation(); removeFile(); });

  /* ── PREVENT PAGE DRAG-DROP ── */
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop',     e => e.preventDefault());

  console.log('%cCVnexa | Built by Saad Iqbal Esti | estisaad@gmail.com', 'background:#ff4d1c;color:#fff;padding:4px 10px;border-radius:4px;font-weight:700;');
});