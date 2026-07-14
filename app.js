"use strict";
/* ============================================================
   APP — profil, progression, dashboard, parcours, jeux, coach
   ============================================================ */

/* ---------- Profil (localStorage) + migration ---------- */
const DAY = 86400000;
const todayKey = () => new Date().toDateString();
let P = null;

function defaultProfile(){
  return { v:1, xp:0, notes:0, games:0, earGames:0, dailyDone:0, perfect:0, practiceMs:0,
    days:{}, skills:{}, notions:{}, badges:{}, history:[],
    goals:{date:'', list:[]}, daily:{date:'', id:'', done:false},
    lessonsRead:{} };
}
function loadProfile(){
  try{
    const raw = localStorage.getItem('cg_profile');
    if (raw){
      P = Object.assign(defaultProfile(), JSON.parse(raw));
      // v2 : le parcours passe de 16 à 20 chapitres — on remappe les compétences
      if ((P.v||1) < 2){
        const remap = {scalesMaj:'improv', scalesMin:'improv', penta:'improv', modes:'improv',
                       chords:'chordconst', functions:'analysis', cadences:'analysis', inversions:'voicelead'};
        for (const [oldK, newK] of Object.entries(remap)){
          if (P.skills[oldK]){
            P.skills[newK] = P.skills[newK] || {ok:0, bad:0};
            P.skills[newK].ok += P.skills[oldK].ok;
            P.skills[newK].bad += P.skills[oldK].bad;
            delete P.skills[oldK];
          }
        }
        P.v = 2;
      }
      return;
    }
  }catch(e){}
  P = defaultProfile();
  // Migration depuis l'ancienne version
  try{
    const oldNotes = parseInt(localStorage.getItem('cg_total_notes') || '0', 10);
    const oldHist = JSON.parse(localStorage.getItem('cg_history') || '[]');
    const oldLessons = JSON.parse(localStorage.getItem('cg_lessons') || '[]');
    P.notes = oldNotes;
    P.xp = Math.round(oldNotes * 0.5 + oldHist.reduce((a,x)=>a+(x.score||0)/10, 0) + oldLessons.filter(Boolean).length*5);
    oldHist.forEach(x => {
      const k = new Date(x.d).toDateString();
      P.days[k] = P.days[k] || {xp:0, notes:0, ms:0};
      P.days[k].xp += Math.round((x.score||0)/10);
      P.history.push({d:x.d, name:(x.module||'')+' · '+(x.detail||''), score:x.score||0, xp:Math.round((x.score||0)/10)});
      // graine de maîtrise selon les anciens exercices
      const map = {'Notes du manche':'fretboard','Intervalles':'intervals','Blues 12 mesures':'functions'};
      const sk = map[x.detail] || (x.module==='Gammes'?'scalesMaj':(x.module==='Accords'?'triads':null));
      if (sk){ P.skills[sk] = P.skills[sk] || {ok:0,bad:0};
        P.skills[sk].ok += Math.round((x.score||0)/12); P.skills[sk].bad += Math.round((100-(x.score||0))/25); }
    });
    if (oldNotes > 0 || oldHist.length) toastLater = '👋 Ta progression a été importée dans le nouveau Coach !';
  }catch(e){}
  save();
}
let saveTimer = null, toastLater = null;
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (P.history.length > 120) P.history = P.history.slice(-120);
    localStorage.setItem('cg_profile', JSON.stringify(P));
  }, 250);
}

/* ---------- XP & niveaux ---------- */
function levelInfo(){
  let lvl = 1, need = 100, rest = P.xp;
  while (rest >= need){ rest -= need; lvl++; need = Math.round(need*1.3); }
  return {lvl, into:rest, need, pct: Math.round(100*rest/need)};
}
function addXp(n, silent){
  const before = levelInfo().lvl;
  P.xp += n;
  const k = todayKey();
  P.days[k] = P.days[k] || {xp:0, notes:0, ms:0};
  P.days[k].xp += n;
  const after = levelInfo().lvl;
  updateHeader();
  if (after > before){
    sfx.level(); confetti();
    toast('🌟 Niveau ' + after + ' !');
    checkBadge('lvl5', after >= 5); checkBadge('lvl10', after >= 10);
  } else if (!silent){ /* discret */ }
  save();
}

/* ---------- Série (streak) ---------- */
function streak(){
  let t = Date.now(), s = 0;
  const has = ts => { const d = P.days[new Date(ts).toDateString()]; return d && (d.xp > 0 || d.notes > 5); };
  if (!has(t)) t -= DAY;
  while (has(t)){ s++; t -= DAY; }
  return s;
}

/* ---------- Maîtrise & déblocage ---------- */
function skillStat(id){ return P.skills[id] || {ok:0, bad:0}; }
function mastery(id){
  const s = skillStat(id);
  const step = PATH.find(p => p.id === id);
  const nL = step ? step.lessons.length : 0;
  let read = 0;
  if (step) step.lessons.forEach((_,i) => { if (P.lessonsRead[id+':'+i]) read++; });
  const lessonPart = nL ? (read/nL)*30 : 0;
  const vol = Math.min(1, (s.ok + s.bad)/24);
  const acc = (s.ok + s.bad) ? s.ok/(s.ok + s.bad) : 0;
  return Math.min(100, Math.round(lessonPart + 70*acc*vol));
}
function stepUnlocked(i){ return i === 0 || mastery(PATH[i-1].id) >= 40; }
function currentStepIndex(){
  for (let i = 0; i < PATH.length; i++){
    if (!stepUnlocked(i)) return Math.max(0, i-1);
    if (mastery(PATH[i].id) < 80) return i;
  }
  return PATH.length - 1;
}
function recordAnswer(skill, notion, ok){
  P.skills[skill] = P.skills[skill] || {ok:0, bad:0};
  P.skills[skill][ok?'ok':'bad']++;
  if (notion){
    const n = P.notions[notion] = P.notions[notion] || {ok:0, bad:0, int:0, due:0};
    n[ok?'ok':'bad']++;
    if (ok){ n.int = n.int ? Math.min(60, Math.round(n.int*2.5)) : 1; n.due = Date.now() + n.int*DAY; }
    else { n.int = 0; n.due = Date.now(); }
  }
  save();
}
function dueNotions(){
  const now = Date.now();
  return Object.entries(P.notions)
    .filter(([k,n]) => n.due && n.due <= now && (n.ok + n.bad) >= 2)
    .sort((a,b) => a[1].due - b[1].due);
}

/* ---------- Étiquettes des notions (pour le coach) ---------- */
function notionLabel(key){
  if (key.startsWith('note-')) return 'la note ' + pcFR(NAMES_EN.indexOf(key.slice(5)));
  if (key.startsWith('iv-')){ const s = +key.slice(3); const iv = INTERVALS.find(i=>i.s===s); return 'les ' + (iv?iv.n+'s':'intervalles'); }
  const map = {'scale-maj':'la gamme majeure','scale-min':'la gamme mineure','scale-pmin':'la pentatonique',
    'chord-maj':'les accords majeurs','chord-min':'les accords mineurs','chord-sus':'les accords suspendus',
    'chord-7':'les accords de 7e','deg-tierce':'la tierce des accords','deg-fondamentale':'la fondamentale',
    'deg-fonctions':'les fonctions 1-3-5','inversions':'les renversements','cadences':'les cadences',
    'modes':'les modes','mode-dor':'le mode dorien','mode-mixo':'le mode mixolydien','tonalite':'les tonalités',
    'melodie':'la reproduction de mélodies','octaves':'les octaves','blues':'la grille de blues',
    'diagram':'la lecture des diagrammes','pima':'le fingerstyle (P-I-M-A)','shell':'les shell chords',
    '251':'le ii-V-I','ext':'les extensions (9, 11, 13)','sub':'les substitutions','vl':'le voice leading',
    'drop2':'les voicings drop 2','drop3':'les voicings drop 3','openv':'les open voicings',
    'quartal':'les accords quartaux','reharm':'la réharmonisation'};
  for (const d of DEGREE_NAMES) map['deg-'+d] = 'le degré ' + d;
  return map[key] || key;
}

/* ---------- Coach (moteur de règles) ---------- */
function coachTips(){
  const tips = [];
  // 1. notion la plus ratée
  const worst = Object.entries(P.notions).filter(([k,n]) => n.bad >= 3 && n.bad >= n.ok)
    .sort((a,b) => (b[1].bad-b[1].ok) - (a[1].bad-a[1].ok))[0];
  if (worst) tips.push({icon:'🎯', txt:`Tu confonds encore ${notionLabel(worst[0])} — on va les retravailler ensemble.`, notion:worst[0]});
  // 2. point fort
  const best = Object.entries(P.notions).filter(([k,n]) => n.ok >= 8 && n.ok/(n.ok+n.bad) >= .85)
    .sort((a,b) => b[1].ok - a[1].ok)[0];
  if (best) tips.push({icon:'💪', txt:`${notionLabel(best[0]).charAt(0).toUpperCase()+notionLabel(best[0]).slice(1)} : c'est solide (${Math.round(100*best[1].ok/(best[1].ok+best[1].bad))} % de réussite). Bravo !`});
  // 3. révisions dues
  const due = dueNotions();
  if (due.length) tips.push({icon:'📚', txt:`${due.length} notion${due.length>1?'s':''} à réviser aujourd'hui — 5 minutes suffisent pour les ancrer.`});
  // 4. encouragement selon la série
  const s = streak();
  if (s >= 3) tips.push({icon:'🔥', txt:`${s} jours d'affilée. La régularité, c'est 80 % du progrès — continue !`});
  if (!tips.length) tips.push({icon:'🎸', txt:'Joue un premier jeu pour que je puisse analyser ton niveau et te conseiller.'});
  return tips.slice(0, 3);
}
function recommendedGames(){
  const recs = [];
  const due = dueNotions();
  // jeux qui travaillent les notions à réviser / ratées
  const wanted = new Set(due.slice(0,4).map(([k]) => k));
  Object.entries(P.notions).forEach(([k,n]) => { if (n.bad >= 3 && n.bad >= n.ok) wanted.add(k); });
  for (const [id, g] of Object.entries(GAMES)){
    if (recs.length >= 4) break;
    if (id === 'exam' || id === 'daily') continue;
    try{
      const sample = g.gen ? g.gen(0.5) : null;
      if (sample && sample.notion && [...wanted].some(w => sample.notion.startsWith(w.split('-')[0]))) recs.push(id);
    }catch(e){}
  }
  // compléter avec les jeux de l'étape en cours
  const cur = PATH[currentStepIndex()];
  cur.games.forEach(id => { if (recs.length < 4 && !recs.includes(id) && GAMES[id]) recs.push(id); });
  return [...new Set(recs)].slice(0, 4);
}

/* ---------- Objectifs du jour ---------- */
function ensureGoals(){
  const k = todayKey();
  if (P.goals.date === k) return;
  const pool = [
    {t:'🎵 Joue 30 notes justes', key:'notes', target:30},
    {t:'🎮 Termine 2 jeux', key:'games', target:2},
    {t:'👂 Réussis 1 jeu d\'oreille', key:'ear', target:1},
    {t:'⏱️ Pratique 10 minutes', key:'time', target:10}
  ];
  const third = dueNotions().length ? {t:'📚 Fais 1 session de révision', key:'review', target:1} : pool[2 + rint(2)];
  P.goals = {date:k, list:[pool[0], pool[1], third].map(g => ({...g, got:0, done:false}))};
  save();
}
function bumpGoal(key, n = 1){
  ensureGoals();
  let changed = false;
  P.goals.list.forEach(g => {
    if (g.key === key && !g.done){
      g.got += n;
      if (g.got >= g.target){ g.done = true; changed = true; addXp(10, true); toast('✅ Objectif atteint : ' + g.t); sfx.streak(); }
    }
  });
  // NB : on ne re-rend PAS l'accueil ici — remplacer le DOM pendant que
  // l'utilisateur est en train de taper « avalait » ses touchers (bug iOS).
  save();
}

/* ---------- Badges ---------- */
function checkBadge(id, cond){
  if (!cond || P.badges[id]) return;
  P.badges[id] = Date.now();
  const b = BADGES.find(x => x.id === id);
  if (b){ sfx.badge(); confetti(); toast(b.icon + ' Badge : ' + b.name + ' !'); }
  save();
}
function checkAllBadges(){
  checkBadge('first', P.notes >= 1);
  checkBadge('notes100', P.notes >= 100);
  checkBadge('notes1k', P.notes >= 1000);
  const s = streak();
  checkBadge('streak3', s >= 3); checkBadge('streak7', s >= 7); checkBadge('streak30', s >= 30);
  checkBadge('games10', P.games >= 10); checkBadge('games50', P.games >= 50);
  checkBadge('perfect', P.perfect >= 1);
  checkBadge('daily5', P.dailyDone >= 5);
  checkBadge('ear20', P.earGames >= 20);
  checkBadge('jazzcat', mastery('shell') >= 80);
}

/* ---------- UI helpers ---------- */
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}
function animNum(el, to, suffix = ''){
  const from = parseInt((el.textContent||'0').replace(/\D/g,'')) || 0;
  const t0 = performance.now(), durMs = 700;
  (function step(now){
    const p = Math.min(1, (now-t0)/durMs);
    const v = Math.round(from + (to-from)*(1 - Math.pow(1-p, 3)));
    el.textContent = v + suffix;
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
function ring(pct, size = 64, label = ''){
  const r = (size-8)/2, c = 2*Math.PI*r;
  return `<span class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}">
      <circle class="bgc" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="6"/>
      <circle class="fgc" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="6"
        stroke-dasharray="${c}" stroke-dashoffset="${c*(1-pct/100)}"/>
    </svg>
    <span class="lbl" style="font-size:${size/4.2}px">${label || (pct+'%')}</span>
  </span>`;
}
function updateHeader(){
  const li = levelInfo();
  document.getElementById('hdrXp').textContent = `⚡ Niv. ${li.lvl} · ${P.xp} XP`;
  document.getElementById('hdrStreak').textContent = '🔥 ' + streak();
}

/* ---------- Navigation ---------- */
let activeTab = 'home';
document.querySelectorAll('nav button').forEach(b => {
  b.addEventListener('click', () => {
    sfx.tap();
    document.querySelectorAll('nav button').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('main > section').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    activeTab = b.dataset.tab;
    document.getElementById('tab-' + activeTab).classList.add('active');
    if (activeTab === 'home') renderHome();
    if (activeTab === 'path') renderPath();
    if (activeTab === 'play') renderPlay();
    if (activeTab === 'profile') renderProfile();
  });
});
function goTab(name){ document.querySelector(`nav button[data-tab="${name}"]`).click(); }

/* ---------- Fiche (bottom sheet) ---------- */
const sheet = document.getElementById('sheet');
function openSheet(html){
  document.getElementById('sheetBody').innerHTML = html;
  sheet.classList.add('open');
  sfx.open();
}
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.classList.remove('open'); });
function closeSheet(){ sheet.classList.remove('open'); }

/* ---------- Accueil (dashboard) ---------- */
function renderHome(){
  ensureGoals(); ensureDaily();
  const li = levelInfo();
  const cur = PATH[currentStepIndex()];
  const curM = mastery(cur.id);
  const due = dueNotions();
  const tips = coachTips();
  const k = todayKey();
  const today = P.days[k] || {xp:0, notes:0, ms:0};
  const mins = Math.round((today.ms||0)/60000);
  const dailyG = GAMES[P.daily.id];
  const recs = recommendedGames();

  document.getElementById('homeRoot').innerHTML = `
  <div class="hero"><h1>${salut()}, guitariste <em>niveau ${li.lvl}</em></h1>
    <p>${due.length ? due.length + ' notion' + (due.length>1?'s':'') + ' à réviser aujourd\'hui.' : 'Tout est frais dans ta mémoire. En route !'}</p></div>

  <div class="card tappable appear" onclick="continueLearning()" style="display:flex; align-items:center; gap:18px">
    ${ring(curM, 72, cur.icon)}
    <div style="flex:1">
      <div class="eyebrow">Continuer ma progression</div>
      <b style="font-size:1.1rem">${cur.name}</b><br>
      <small style="color:var(--muted)">${nextActionLabel(cur)}</small>
    </div>
    <span style="font-size:1.4rem; color:var(--faint)">›</span>
  </div>

  <div class="grid2">
    <div class="card tappable appear" style="animation-delay:.06s" onclick="startDaily()">
      <div class="eyebrow">🔥 Défi du jour</div>
      <div style="display:flex; align-items:center; gap:12px">
        <span style="font-size:2rem">${dailyG.icon}</span>
        <div style="flex:1"><b>${dailyG.name}</b><br><small style="color:var(--muted)">${P.daily.done ? '✅ Réussi ! Reviens demain.' : '+20 XP bonus'}</small></div>
      </div>
    </div>
    <div class="card appear" style="animation-delay:.12s">
      <div class="eyebrow">Objectifs du jour</div>
      ${P.goals.list.map(g => `
        <div class="goal ${g.done?'done':''}">
          <div class="gchk">✓</div>
          <div class="gtxt">${g.t} <small style="color:var(--faint)">${g.done?'':Math.min(g.got, g.target)+'/'+g.target}</small></div>
        </div>`).join('')}
    </div>
  </div>

  <div class="card appear" style="animation-delay:.18s">
    <div class="eyebrow">🧑‍🏫 Ton coach</div>
    ${tips.map(t => `<div class="coach-tip" style="padding:7px 0"><span class="ava">${t.icon}</span><div style="color:var(--muted); font-size:.92rem; line-height:1.55">${t.txt}</div></div>`).join('')}
  </div>

  <div class="card appear" style="animation-delay:.24s">
    <div class="eyebrow">🎯 Recommandés pour toi</div>
    <div class="gscroll">${recs.map(id => gameCard(id)).join('')}</div>
  </div>

  <div class="stats appear" style="animation-delay:.3s">
    <div class="stat"><b>${streak()}</b>🔥 série</div>
    <div class="stat"><b id="hNotesToday">0</b>notes aujourd'hui</div>
    <div class="stat"><b id="hXpToday">0</b>XP aujourd'hui</div>
    <div class="stat"><b>${mins}</b>min de pratique</div>
  </div>`;
  animNum(document.getElementById('hNotesToday'), today.notes || 0);
  animNum(document.getElementById('hXpToday'), today.xp || 0);
  updateHeader();
}
function salut(){
  const h = new Date().getHours();
  return h < 6 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}
/* « Continuer » = mener directement à la PROCHAINE action utile :
   leçon non lue → l'ouvrir ; sinon → lancer le jeu le plus utile de l'étape. */
function nextAction(st){
  for (let i = 0; i < st.lessons.length; i++)
    if (!P.lessonsRead[st.id+':'+i]) return {type:'lesson', i};
  const playable = st.games.filter(g => GAMES[g] && (!GAMES[g].mic || micOn));
  if (playable.length) return {type:'game', id:playable[rint(playable.length)]};
  return {type:'step'};
}
function nextActionLabel(st){
  const a = nextAction(st);
  if (a.type === 'lesson') return '▶ Leçon : ' + st.lessons[a.i].t;
  if (a.type === 'game') return '▶ Jeu : ' + GAMES[a.id].name;
  return st.desc;
}
function continueLearning(){
  const st = PATH[currentStepIndex()];
  const a = nextAction(st);
  sfx.tap();
  if (a.type === 'lesson') openLesson(st.id, a.i);
  else if (a.type === 'game') startGame(a.id);
  else openStep(st.id);
}

/* ---------- Parcours ---------- */
function renderPath(){
  const cur = currentStepIndex();
  document.getElementById('pathRoot').innerHTML = `<div class="card"><div class="path">` +
    PATH.map((st, i) => {
      const m = mastery(st.id);
      const unlocked = stepUnlocked(i);
      const cls = !unlocked ? 'locked' : (m >= 80 ? 'done' : (i === cur ? 'current' : ''));
      return `<div class="pnode ${cls}" onclick="${unlocked ? `openStep('${st.id}')` : `lockedMsg(${i})`}">
        <div class="dot">${m >= 80 ? '✓' : st.icon}</div>
        <div class="pinfo"><b>${st.name}</b><small>${st.desc}</small></div>
        <span class="ppct">${unlocked ? m + '%' : '🔒'}</span>
      </div>`;
    }).join('') + `</div></div>`;
}
function lockedMsg(i){
  sfx.err();
  toast(`🔒 Atteins 40 % en « ${PATH[i-1].name} » pour débloquer`);
}
function openStep(id){
  const st = PATH.find(p => p.id === id);
  const i = PATH.indexOf(st);
  const m = mastery(id);
  const next = PATH[i+1];
  const badgeWon = m >= 80;
  openSheet(`
    <div style="display:flex; align-items:center; gap:16px; margin-bottom:6px">
      ${ring(m, 76, st.icon)}
      <div><h2>${st.name}</h2><p style="color:var(--muted); font-size:.9rem">${st.desc}</p></div>
    </div>
    <div class="eyebrow" style="margin-top:18px">Leçons (2 min chacune)</div>
    ${st.lessons.map((l, li) => {
      const read = P.lessonsRead[id+':'+li];
      return `<div class="goal ${read?'done':''}" style="cursor:pointer" onclick="openLesson('${id}',${li})">
        <div class="gchk">✓</div><div class="gtxt"><b>${l.t}</b></div><span style="color:var(--faint)">›</span></div>`;
    }).join('')}
    <div class="eyebrow" style="margin-top:18px">Jeux de cette étape</div>
    <div class="gscroll">${st.games.filter(g=>GAMES[g]).map(g => gameCard(g)).join('')}</div>
    <div class="eyebrow" style="margin-top:18px">Badge</div>
    <div class="badges"><div class="badge ${badgeWon?'won':''}"><div class="bic">${st.badge.icon}</div><small>${st.badge.name}<br>${badgeWon?'obtenu !':'à 80 %'}</small></div></div>
    ${next ? `<p class="hint" style="margin-top:16px">Chapitre suivant : <b>${next.icon} ${next.name}</b> — se débloque à 40 % de maîtrise.</p>` : ''}
  `);
}
function openLesson(stepId, li){
  const st = PATH.find(p => p.id === stepId);
  const l = st.lessons[li];
  const read = P.lessonsRead[stepId+':'+li];
  openSheet(`
    <h2>${l.t}</h2>
    <div class="eyebrow">${st.icon} ${st.name}</div>
    <div class="lesson-txt">${l.x}</div>
    ${l.dg && DG[l.dg] ? `<div class="diagram">${DG[l.dg]()}</div>` : ''}
    ${l.sh ? (() => { const s = SHAPES.find(x => x.n === l.sh); return s ? `<div class="diagram">${DG.chordbox(s, true)}<div class="hint" style="text-align:center; margin-top:4px">${s.n}</div></div>` : ''; })() : ''}
    <div class="row" style="margin-top:16px">
      ${l.try && GAMES[l.try] ? `<button class="btn primary big" style="flex:1" onclick="closeSheet(); startGame('${l.try}')">▶ Essaie maintenant : ${GAMES[l.try].name}</button>` : ''}
    </div>
    <div class="row" style="margin-top:10px">
      <button class="btn big" style="flex:1" onclick="markLesson('${stepId}',${li})">${read ? 'Relu ✓' : '✓ J\'ai compris (+5 XP)'}</button>
    </div>
  `);
}
function markLesson(stepId, li){
  const key = stepId+':'+li;
  if (!P.lessonsRead[key]){
    P.lessonsRead[key] = 1;
    addXp(5, true);
    sfx.ok();
    toast('📖 Leçon acquise ! +5 XP');
  }
  save();
  openStep(stepId);
}

/* ---------- Jeux : cartes & hub ---------- */
function gameStep(id){ return PATH.findIndex(p => p.games.includes(id)); }
function gameLocked(id){
  const i = gameStep(id);
  return i > 0 && !stepUnlocked(i);
}
function gameCard(id, opts = {}){
  const g = GAMES[id];
  if (!g) return '';
  const locked = gameLocked(id);
  const m = mastery(g.skill);
  return `<div class="gcard" style="${locked?'opacity:.45':''}" onclick="${locked ? `lockedGame('${id}')` : `startGame('${id}'${opts.review?',{review:1}':''})`}">
    <span class="gic">${locked ? '🔒' : g.icon}</span>
    <b>${g.name}</b>
    <small>${opts.due ? '<span class="due">À réviser</span>' : (g.mic ? '🎸 micro · ' : '🧠 sans guitare · ') + m + ' %'}</small>
  </div>`;
}
function lockedGame(id){
  const i = gameStep(id);
  sfx.err();
  toast(`🔒 Débloque « ${PATH[i].name} » dans le Parcours d'abord`);
}
// Mode survie (défini côté app : mélange les quiz, 3 vies)
GAMES.survival = {name:'Mode survie', icon:'💀', cat:['exam'], skill:'mastery', mic:false, type:'survival', rounds:999,
  desc:'3 vies, questions de plus en plus dures. Record à battre !', gen(){ return null; }};

const MCQ_POOL = ['reverseQuiz','semitones','earInterval','completeScale','intruder','chordTones','degreeQuiz','cadenceQuiz','modeQuiz','keyQuiz',
                  'readDiagram','pimaQuiz','shellQuiz','extQuiz','subQuiz','vlQuiz','drop2Quiz','drop3Quiz','openvQuiz','quartalQuiz','reharmQuiz'];
const EXAM_POOL = [...MCQ_POOL, 'findNote','buildInterval','degreePlay','shellBuild','cadence251'];

function ensureDaily(){
  const k = todayKey();
  if (P.daily.date === k && P.daily.id) return;
  const list = ['findNote','reverseQuiz','earInterval','buildInterval','earMajMin','completeScale','semitones','octaves','intruder','chordTones'];
  const seed = Math.floor(Date.now()/DAY);
  P.daily = {date:k, id:list[seed % list.length], done:false};
  save();
}
function startDaily(){
  ensureDaily();
  if (P.daily.done){ toast('✅ Défi du jour déjà réussi — reviens demain !'); return; }
  startGame(P.daily.id, {daily:true});
}

function renderPlay(){
  ensureDaily();
  const due = dueNotions();
  const dueGames = due.length ? recommendedGames() : [];
  const cur = PATH[currentStepIndex()];
  const fresh = cur.games.filter(g => GAMES[g]);
  const byCat = cat => Object.keys(GAMES).filter(id => GAMES[id].cat && GAMES[id].cat.includes(cat) && id !== 'exam');
  const sec = (title, ids, opts) => ids.length ? `<div class="gsec appear"><h3>${title}</h3><div class="gscroll">${[...new Set(ids)].map(id => gameCard(id, opts||{})).join('')}</div></div>` : '';
  document.getElementById('playRoot').innerHTML =
    sec('🎯 Recommandés pour toi', recommendedGames()) +
    (due.length ? sec('📚 À réviser (' + due.length + ')', dueGames, {review:1, due:1}) : '') +
    `<div class="gsec appear"><h3>🔥 Défi du jour</h3><div class="gscroll">
      <div class="gcard" onclick="startDaily()">
        <span class="gic">${GAMES[P.daily.id].icon}</span><b>${GAMES[P.daily.id].name}</b>
        <small>${P.daily.done ? '✅ réussi aujourd\'hui' : '+20 XP bonus'}</small>
      </div></div></div>` +
    sec('⭐ Nouveaux défis', fresh) +
    sec('⚡ Défis rapides', byCat('quick')) +
    sec('🎸 Avec la guitare', byCat('guitar')) +
    sec('🧠 Sans la guitare', byCat('nogtr')) +
    sec('👂 Ear training', byCat('ear')) +
    sec('🏆 Examens', ['exam','survival']);
}

/* ---------- Moteur de jeu ---------- */
const GV = {open:false, sess:0};
const gvBody = () => document.getElementById('gvBody');
const gvFoot = () => document.getElementById('gvFoot');
// Minuterie liée à la partie en cours : ignorée si le jeu a changé entre-temps
function gvLater(fn, ms){
  const s = GV.sess;
  setTimeout(() => { if (GV.open && GV.sess === s) fn(); }, ms);
}

function startGame(id, opts = {}){
  const def = GAMES[id];
  if (!def) return;
  if (def.mic && !micOn){ toast('🎤 Active le micro pour ce jeu (bouton en haut)'); sfx.err(); return; }
  sfx.open();
  GV.sess++;
  Object.assign(GV, {open:true, id, def, opts, round:0, ok:0, bad:0, xp:0,
    rounds: def.timer ? Infinity : def.rounds,
    lives: def.type === 'survival' ? 3 : null,
    timeLeft: def.timer || null, timerH:null, q:null, waiting:false, simonSeq:[], improv:null});
  document.getElementById('gameView').classList.add('open');
  document.getElementById('gvBar').style.width = '0%';
  if (def.timer){
    GV.timerH = setInterval(() => {
      GV.timeLeft--;
      updGvInfo();
      if (GV.timeLeft <= 0) endGame();
    }, 1000);
  }
  nextRound();
}
document.getElementById('gvQuit').addEventListener('click', () => { sfx.tap(); endGame(true); });
function updGvInfo(){
  const el = document.getElementById('gvInfo');
  if (GV.timeLeft != null) el.textContent = GV.timeLeft + 's';
  else if (GV.lives != null) el.textContent = '❤️'.repeat(Math.max(0,GV.lives));
  else el.textContent = Math.min(GV.round, GV.rounds) + '/' + GV.rounds;
  const pct = GV.timeLeft != null ? 100*(1 - GV.timeLeft/GV.def.timer)
            : GV.lives != null ? Math.min(100, GV.ok*6)
            : 100*GV.round/GV.rounds;
  document.getElementById('gvBar').style.width = Math.min(100,pct) + '%';
}
function gvFeedback(ok, msg){
  gvFoot().innerHTML = `<div class="gv-fb ${ok?'ok':'err'}">${msg}</div>`;
  if (ok) sfx.ok(); else sfx.err();
}
function gvReplayBtn(){
  return GV.q && GV.q.play && GV.q.replay ? `<button class="btn" onclick="sfx.tap(); playMelody(GV.q.play, ${GV.q.gap||0.55})">🔊 Réécouter</button>` : '';
}
function pickExamQ(){
  // Pool filtré d'avance : jamais de question micro si le micro est coupé
  const base = GV.def.type === 'survival' ? MCQ_POOL : EXAM_POOL;
  const pool = base.filter(id => !GAMES[id].mic || micOn);
  const src = GAMES[rnd(pool)];
  const q = src.gen(GV.def.type === 'survival' ? Math.min(1, .3 + GV.ok*.05) : .7);
  q._type = src.type; q._skill = src.skill; q._mic = src.mic;
  return q;
}
function nextRound(){
  if (!GV.open) return;
  if (GV.round >= GV.rounds) return endGame();
  GV.round++;
  updGvInfo();
  gvFoot().innerHTML = '';
  const def = GV.def;
  let q;
  if (def.type === 'exam' || def.type === 'survival'){
    q = pickExamQ();
  } else {
    q = def.gen(mastery(def.skill)/100);
    q._type = def.type; q._skill = def.skill; q._mic = def.mic;
  }
  GV.q = q;
  GV.waiting = true;
  const t = q._type;
  if (t === 'mcq') renderMcq(q);
  else if (t === 'micNote') renderMicNote(q);
  else if (t === 'micSet') renderMicSet(q);
  else if (t === 'micSeq') renderMicSeq(q);
  else if (t === 'melody') renderMelody(q);
  else if (t === 'simon') startSimon(q);
  else if (t === 'improv') startImprov(q);
  if (q.play && t === 'mcq') playMelody(q.play, q.gap||0.55);
  if (q.playFirst) playMelody(q.playFirst);
}
function answered(ok, xp){
  recordAnswer(GV.q._skill || GV.def.skill, GV.q.notion, ok);
  if (ok){ GV.ok++; GV.xp += xp; }
  else GV.bad++;
}

/* --- rendu par mécanique --- */
function renderMcq(q){
  gvBody().innerHTML = `<div class="gv-q">${q.q}</div>${q.sub?`<div class="gv-sub">${q.sub}</div>`:''}
    ${q.svg ? `<div class="diagram">${q.svg}</div>` : ''}
    <div class="mcq">${q.choices.map((c,i)=>`<button onclick="mcqAnswer(${i})">${c}</button>`).join('')}</div>`;
  gvFoot().innerHTML = gvReplayBtn();
}
function mcqAnswer(i){
  if (!GV.waiting) return;
  GV.waiting = false;
  const btns = gvBody().querySelectorAll('.mcq button');
  const good = i === GV.q.ans;
  btns[GV.q.ans].classList.add('good');
  if (!good) btns[i].classList.add('bad');
  answered(good, 2);
  gvFeedback(good, good ? rnd(['Exact !','Bien joué !','Parfait !','Oui !']) : '✗ C\'était : ' + GV.q.choices[GV.q.ans]);
  if (!good && GV.lives != null){ GV.lives--; updGvInfo(); if (GV.lives <= 0) return gvLater(endGame, 900); }
  gvLater(nextRound, 1000);
}
function renderMicNote(q){
  gvBody().innerHTML = `<div class="gv-q">${q.q}</div>${q.sub?`<div class="gv-sub">${q.sub}</div>`:''}
    <div class="gv-big" id="gvPlayed">🎸</div><div class="gv-sub">Joue sur ta guitare, je t'écoute…</div>`;
  gvFoot().innerHTML = gvReplayBtn();
}
function renderMicSet(q){
  const need = q.pcs ? q.pcs.length : q.needCount;
  GV.setFound = new Set();
  gvBody().innerHTML = `<div class="gv-q">${q.q}</div>${q.sub?`<div class="gv-sub">${q.sub}</div>`:''}
    <div id="gvChips" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      ${q.pcs ? q.pcs.map(pc=>`<span class="chip dim" data-pc="${pc}">${pcFR(pc)}</span>`).join('')
              : Array.from({length:need},(_,i)=>`<span class="chip dim" data-i="${i}">♪</span>`).join('')}
    </div><div class="gv-big" id="gvPlayed">🎸</div>`;
}
function renderMicSeq(q){
  GV.seqIdx = 0;
  gvBody().innerHTML = `<div class="gv-q">${q.q}</div>${q.sub?`<div class="gv-sub">${q.sub}</div>`:''}
    <div id="gvChips" style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;max-width:640px">
      ${q.seq.map((pc,i)=>`<span class="chip ${i===0?'now':'dim'}" data-i="${i}">${q.seqLabels?q.seqLabels[i]:pcFR(pc)}</span>`).join('')}
    </div>${q.svg ? `<div class="diagram">${q.svg}</div>` : ''}<div class="gv-big" id="gvPlayed">🎸</div>`;
}
function renderMelody(q){
  GV.seqIdx = 0;
  gvBody().innerHTML = `<div class="gv-q">${q.q}</div>
    <div id="gvChips" style="display:flex;gap:8px;justify-content:center">
      ${q.seq.map((m,i)=>`<span class="chip ${i===0?'now':'dim'}">♪</span>`).join('')}
    </div><div class="gv-big" id="gvPlayed">👂</div>`;
  gvFoot().innerHTML = `<button class="btn" onclick="sfx.tap(); playMelody(GV.q.seq)">🔊 Réécouter</button>`;
  playMelody(q.seq);
}
function startSimon(q){
  GV.simonSeq = [q.root, q.root + rnd(q.scale.slice(1))];
  GV.seqIdx = 0;
  simonShow();
}
function simonShow(){
  GV.waiting = false;
  gvBody().innerHTML = `<div class="gv-q">Simon musical — tour ${GV.simonSeq.length - 1}</div>
    <div class="gv-sub">Écoute la séquence…</div><div class="gv-big">👂</div>`;
  playMelody(GV.simonSeq, 0.5);
  gvLater(() => {
    GV.seqIdx = 0; GV.waiting = true;
    gvBody().innerHTML = `<div class="gv-q">À toi ! (${GV.simonSeq.length} notes)</div>
      <div id="gvChips" style="display:flex;gap:8px;justify-content:center">
        ${GV.simonSeq.map((m,i)=>`<span class="chip ${i===0?'now':'dim'}">♪</span>`).join('')}
      </div><div class="gv-big" id="gvPlayed">🎸</div>`;
  }, GV.simonSeq.length*500 + 700);
}
function startImprov(q){
  GV.improv = {in:0, out:0, end: Date.now() + q.dur*1000};
  const pcs = q.iv.map(iv => (q.root+iv)%12);
  gvBody().innerHTML = `<div class="gv-q">${q.q}</div>
    <div class="gv-sub">Notes permises : ${pcs.map(pcFR).join(' · ')}</div>
    <div class="gv-big" id="gvPlayed">🎤</div>
    <div class="gv-sub"><span id="gvIn" style="color:var(--ok)">0 dans la gamme</span> · <span id="gvOut" style="color:var(--err)">0 dehors</span></div>`;
  GV.improvH = setInterval(() => {
    const left = Math.max(0, Math.round((GV.improv.end - Date.now())/1000));
    document.getElementById('gvInfo').textContent = left + 's';
    document.getElementById('gvBar').style.width = (100*(1 - left/GV.q.dur)) + '%';
    if (left <= 0){
      clearInterval(GV.improvH);
      const tot = GV.improv.in + GV.improv.out;
      GV.ok = GV.improv.in; GV.bad = GV.improv.out;
      GV.xp = Math.round(GV.improv.in * 1.5);
      recordAnswer(GV.def.skill, GV.q.notion, tot ? GV.improv.in/tot >= .8 : false);
      endGame();
    }
  }, 400);
}

/* --- écoute micro pendant les jeux --- */
listeners.add(ev => {
  if (!GV.open || !GV.waiting || ev.type !== 'note' || Date.now() < toneGuard) return;
  const q = GV.q, t = q ? q._type : null;
  const played = document.getElementById('gvPlayed');
  if (played) played.textContent = pcFR(ev.midi%12) + midiOct(ev.midi);
  if (t === 'micNote'){
    const good = q.targetMidi != null ? ev.midi === q.targetMidi : ev.midi%12 === q.targetPc;
    if (good){
      GV.waiting = false;
      answered(true, 3);
      gvFeedback(true, '✓ ' + pcFR(ev.midi%12) + ' — parfait !');
      gvLater(nextRound, 900);
    } else {
      answered(false, 0);
      const target = q.targetMidi != null ? q.targetMidi : null;
      const hint = target ? `tu es à ${Math.abs(ev.midi-target)} case(s) ${ev.midi>target?'trop haut':'trop bas'}` : `il faut ${pcFR(q.targetPc)}`;
      gvFeedback(false, '✗ ' + pcFR(ev.midi%12) + ' — ' + hint);
      if (GV.lives != null){ GV.lives--; updGvInfo(); if (GV.lives <= 0) gvLater(endGame, 900); }
    }
  }
  else if (t === 'micSet'){
    const pc = ev.midi%12;
    if (q.pcs){
      if (q.pcs.includes(pc) && !GV.setFound.has(pc)){
        GV.setFound.add(pc);
        const chip = gvBody().querySelector(`[data-pc="${pc}"]`);
        if (chip){ chip.className = 'chip ok'; }
        sfx.tick();
        if (GV.setFound.size === q.pcs.length){
          GV.waiting = false; answered(true, 4);
          gvFeedback(true, '✓ Accord complet !');
          gvLater(nextRound, 900);
        }
      } else if (!q.pcs.includes(pc)){
        answered(false, 0);
        gvFeedback(false, '✗ ' + pcFR(pc) + ' ne fait pas partie de la réponse');
      }
    } else { // octaves : midis distincts d'une même note
      if (pc === q.pc && !GV.setFound.has(ev.midi)){
        GV.setFound.add(ev.midi);
        const chip = gvBody().querySelector(`[data-i="${GV.setFound.size-1}"]`);
        if (chip){ chip.className = 'chip ok'; chip.textContent = pcFR(pc) + midiOct(ev.midi); }
        sfx.tick();
        if (GV.setFound.size >= q.needCount){
          GV.waiting = false; answered(true, 4);
          gvFeedback(true, '✓ Toutes les octaves trouvées !');
          gvLater(nextRound, 900);
        }
      } else if (pc !== q.pc){
        answered(false, 0);
        gvFeedback(false, '✗ ' + pcFR(pc) + ' — cherche ' + pcFR(q.pc));
      }
    }
  }
  else if (t === 'micSeq'){
    const pc = ev.midi%12;
    if (pc === q.seq[GV.seqIdx]){
      const chips = gvBody().querySelectorAll('#gvChips .chip');
      chips[GV.seqIdx].className = 'chip ok';
      GV.seqIdx++;
      sfx.tick();
      if (GV.seqIdx >= q.seq.length){
        GV.waiting = false; answered(true, 6);
        gvFeedback(true, '🎉 Séquence complète !');
        gvLater(nextRound, 1000);
      } else chips[GV.seqIdx].className = 'chip now';
    } else {
      answered(false, 0);
      gvFeedback(false, '✗ ' + pcFR(pc) + ' — attendu : ' + pcFR(q.seq[GV.seqIdx]));
    }
  }
  else if (t === 'melody'){
    const pc = ev.midi%12;
    if (pc === q.seq[GV.seqIdx]%12){
      const chips = gvBody().querySelectorAll('#gvChips .chip');
      chips[GV.seqIdx].className = 'chip ok'; chips[GV.seqIdx].textContent = pcFR(pc);
      GV.seqIdx++;
      sfx.tick();
      if (GV.seqIdx >= q.seq.length){
        GV.waiting = false; answered(true, 5);
        gvFeedback(true, '🎶 Mélodie reproduite !');
        gvLater(nextRound, 1000);
      } else chips[GV.seqIdx].className = 'chip now';
    } else {
      answered(false, 0);
      gvFeedback(false, '✗ Réécoute et réessaie depuis le début');
      GV.seqIdx = 0;
      gvBody().querySelectorAll('#gvChips .chip').forEach((c,i) => { c.className = 'chip ' + (i===0?'now':'dim'); c.textContent = '♪'; });
    }
  }
  else if (t === 'simon'){
    const pc = ev.midi%12;
    if (pc === GV.simonSeq[GV.seqIdx]%12){
      const chips = gvBody().querySelectorAll('#gvChips .chip');
      if (chips[GV.seqIdx]) chips[GV.seqIdx].className = 'chip ok';
      GV.seqIdx++;
      sfx.tick();
      if (GV.seqIdx >= GV.simonSeq.length){
        GV.ok++;
        GV.xp += GV.simonSeq.length;
        recordAnswer(GV.def.skill, GV.q.notion, true);
        gvFeedback(true, '✓ Tour réussi ! Une note de plus…');
        GV.simonSeq.push(GV.q.root + rnd(GV.q.scale) + (Math.random()<.25?12:0));
        gvLater(simonShow, 1000);
      } else {
        const chips2 = gvBody().querySelectorAll('#gvChips .chip');
        if (chips2[GV.seqIdx]) chips2[GV.seqIdx].className = 'chip now';
      }
    } else {
      GV.bad++;
      recordAnswer(GV.def.skill, GV.q.notion, false);
      gvFeedback(false, '✗ Raté au tour ' + (GV.simonSeq.length-1) + ' !');
      GV.waiting = false;
      gvLater(endGame, 1100);
    }
  }
  else if (t === 'improv' && GV.improv){
    const pcs = GV.q.iv.map(iv => (GV.q.root+iv)%12);
    if (pcs.includes(ev.midi%12)){ GV.improv.in++; document.getElementById('gvIn').textContent = GV.improv.in + ' dans la gamme'; }
    else { GV.improv.out++; document.getElementById('gvOut').textContent = GV.improv.out + ' dehors'; }
  }
});

/* --- fin de partie --- */
function endGame(aborted){
  GV.sess++; // invalide toutes les minuteries de la partie
  if (GV.timerH){ clearInterval(GV.timerH); GV.timerH = null; }
  if (GV.improvH){ clearInterval(GV.improvH); GV.improvH = null; }
  if (aborted){ GV.open = false; document.getElementById('gameView').classList.remove('open'); return; }
  GV.waiting = false;
  const tot = GV.ok + GV.bad;
  const score = tot ? Math.round(100*GV.ok/tot) : 0;
  const isSimon = GV.def.type === 'simon';
  let bonus = Math.round(score/10) + 5;
  if (score === 100 && tot >= 4){ P.perfect++; bonus += 10; }
  if (GV.opts.daily && score >= 70 && !P.daily.done){ P.daily.done = true; P.dailyDone++; bonus += 20; toast('🔥 Défi du jour réussi ! +20 XP'); }
  if (GV.opts.review) bumpGoal('review');
  const gained = GV.xp + bonus;
  P.games++;
  if (GV.def.cat.includes('ear')){ P.earGames++; bumpGoal('ear'); }
  bumpGoal('games');
  P.history.push({d:Date.now(), name:GV.def.icon + ' ' + GV.def.name, score, xp:gained});
  checkBadge('survivor', GV.def.type === 'survival' && GV.ok >= 15);
  checkAllBadges();
  // feedback du coach sur CETTE partie
  let coachLine = '';
  if (GV.lastErrors && GV.lastErrors.length) coachLine = '';
  const worstNow = Object.entries(P.notions).filter(([k,n]) => n.bad >= 2 && n.due <= Date.now()).sort((a,b)=>b[1].bad-a[1].bad)[0];
  if (score >= 90) coachLine = 'Impressionnant. ' + (worstNow ? 'Prochaine cible : ' + notionLabel(worstNow[0]) + '.' : 'Passe à l\'étape suivante du parcours !');
  else if (score >= 60) coachLine = 'Solide ! ' + (worstNow ? 'Je te reproposerai ' + notionLabel(worstNow[0]) + ' demain pour ancrer.' : 'Encore une session et c\'est acquis.');
  else coachLine = 'Pas grave — c\'est en ratant qu\'on apprend. On refait la même en plus facile ?';
  const good = score >= 80 || (isSimon && GV.ok >= 5);
  if (good){ confetti(); sfx.win(); }
  gvBody().innerHTML = `<div class="gv-end">
    <div class="trophy">${good ? '🏆' : score >= 50 ? '💪' : '🌱'}</div>
    <div class="gv-q">${isSimon ? 'Série de ' + GV.ok + ' tours !' : score + ' % de réussite'}</div>
    <div class="xp-gain" id="gvXp">+0 XP</div>
    <div class="gv-sub" style="max-width:420px">🧑‍🏫 ${coachLine}</div>
  </div>`;
  gvFoot().innerHTML = `
    <button class="btn big" style="flex:1" onclick="sfx.tap(); endGame(true)">Terminer</button>
    <button class="btn primary big" style="flex:1" onclick="sfx.tap(); startGame('${GV.id}')">↺ Rejouer</button>`;
  animNum(document.getElementById('gvXp'), gained, ' XP');
  setTimeout(() => document.getElementById('gvXp').textContent = '+' + gained + ' XP', 800);
  addXp(gained, true);
  save();
}

/* ---------- Studio : accordeur + analyse en direct ---------- */
const TUN_STRINGS = [
  {midi:40, label:'6 · Mi grave'}, {midi:45, label:'5 · La'}, {midi:50, label:'4 · Ré'},
  {midi:55, label:'3 · Sol'}, {midi:59, label:'2 · Si'}, {midi:64, label:'1 · Mi aigu'}
];
const tunStringsEl = document.getElementById('tunStrings');
TUN_STRINGS.forEach(s => {
  const d = document.createElement('div');
  d.textContent = s.label; d.dataset.midi = s.midi;
  tunStringsEl.appendChild(d);
});
let tunClearTimer = null;
listeners.add(ev => {
  if (activeTab !== 'studio' || GV.open) return;
  if (ev.type === 'pitch'){
    clearTimeout(tunClearTimer);
    document.getElementById('tunNote').textContent = pcFR(ev.midi%12) + midiOct(ev.midi);
    document.getElementById('tunFreq').textContent = ev.freq.toFixed(1) + ' Hz — ' + pcEN(ev.midi%12) + midiOct(ev.midi);
    const needle = document.getElementById('tunNeedle');
    const pct = 50 + (ev.cents/50)*48;
    needle.style.left = `calc(${Math.max(2,Math.min(98,pct))}% - 4px)`;
    const inTune = Math.abs(ev.cents) <= 5;
    needle.style.background = inTune ? 'var(--ok)' : (Math.abs(ev.cents) <= 15 ? 'var(--accent)' : 'var(--err)');
    document.getElementById('tunCents').textContent =
      (ev.cents > 0 ? '+' : '') + ev.cents + ' cents ' + (inTune ? '✓ juste !' : (ev.cents < 0 ? '(trop grave ♭)' : '(trop aigu ♯)'));
    let best = null, bd = 99;
    for (const el of tunStringsEl.children){
      const diff = Math.abs(parseInt(el.dataset.midi) - ev.midi);
      el.classList.remove('near','tuned');
      if (diff < bd){ bd = diff; best = el; }
    }
    if (best && bd <= 2) best.classList.add(inTune && bd === 0 ? 'tuned' : 'near');
  }
  if (ev.type === 'silence'){
    tunClearTimer = setTimeout(() => {
      document.getElementById('tunNote').textContent = '—';
      document.getElementById('tunFreq').textContent = 'Joue une corde…';
    }, 900);
  }
});

/* Analyse en direct : intervalle, accord, tonalité, degré */
const freeFb = Fretboard(document.getElementById('freeFb'));
let liveNotes = [], livePrev = null;
function liveKey(){
  if (liveNotes.length < 5) return null;
  const recent = liveNotes.slice(-25);
  let best = null, bestScore = -1e9;
  for (let root = 0; root < 12; root++){
    const pcs = new Set(SCALES.maj.iv.map(iv => (root+iv)%12));
    let s = 0;
    recent.forEach(pc => { s += pcs.has(pc) ? 1 : -1.4; if (pc === root) s += .7; });
    if (s > bestScore){ bestScore = s; best = root; }
  }
  const conf = Math.round(100 * Math.max(0, bestScore) / (recent.length*1.7));
  return conf > 30 ? {root:best, conf:Math.min(99, conf)} : null;
}
function liveChord(){
  const set = new Set(liveNotes.slice(-6));
  if (set.size < 3) return null;
  for (let root = 0; root < 12; root++){
    for (const [name, ch] of Object.entries(CHORDS)){
      const pcs = new Set(ch.iv.map(iv => (root+iv)%12));
      if (pcs.size <= set.size && [...pcs].every(pc => set.has(pc)) &&
          [...set].slice(-pcs.size).every(pc => pcs.has(pc)))
        return pcFR(root) + ' ' + name;
    }
  }
  return null;
}
listeners.add(ev => {
  if (activeTab !== 'studio' || GV.open || ev.type !== 'note') return;
  const pc = ev.midi % 12;
  document.getElementById('freeNote').textContent = pcBoth(pc) + ' ' + midiOct(ev.midi);
  freeFb.clear();
  freeFb.lightMidi(ev.midi);
  const chips = [];
  if (livePrev != null){
    const dist = Math.abs(ev.midi - livePrev) % 12 || (ev.midi !== livePrev ? 12 : 0);
    const iv = INTERVALS.find(i => i.s === dist);
    if (iv) chips.push(`<span class="chip">↔ ${iv.n}</span>`);
  }
  livePrev = ev.midi;
  liveNotes.push(pc);
  if (liveNotes.length > 40) liveNotes.shift();
  const ch = liveChord();
  if (ch) chips.push(`<span class="chip now">🎵 ${ch}</span>`);
  const key = liveKey();
  if (key){
    chips.push(`<span class="chip ok">🗝️ ${pcFR(key.root)} majeur (${key.conf}%)</span>`);
    const deg = SCALES.maj.iv.indexOf(((pc - key.root)+12)%12);
    if (deg >= 0) chips.push(`<span class="chip">🏛️ degré ${DEGREE_NAMES[deg]}</span>`);
  }
  document.getElementById('liveInfo').innerHTML = chips.join('');
});
document.getElementById('liveReset').addEventListener('click', () => {
  sfx.tap();
  liveNotes = []; livePrev = null;
  document.getElementById('liveInfo').innerHTML = '';
  document.getElementById('freeNote').textContent = '—';
  freeFb.clear();
  toast('↺ Analyse réinitialisée');
});

/* ---------- Compteur de notes & temps de pratique ---------- */
let lastNoteTs = 0, minuteAcc = 0;
listeners.add(ev => {
  if (ev.type !== 'note') return;
  P.notes++;
  const k = todayKey();
  P.days[k] = P.days[k] || {xp:0, notes:0, ms:0};
  P.days[k].notes++;
  bumpGoal('notes');
  const now = Date.now();
  if (lastNoteTs && now - lastNoteTs < 5000){
    const dt = now - lastNoteTs;
    P.practiceMs += dt;
    P.days[k].ms = (P.days[k].ms||0) + dt;
    minuteAcc += dt;
    if (minuteAcc >= 60000){ bumpGoal('time', Math.floor(minuteAcc/60000)); minuteAcc %= 60000; }
  }
  lastNoteTs = now;
  if (P.notes % 20 === 0) checkAllBadges();
  save();
});

/* ---------- Profil ---------- */
function renderProfile(){
  const li = levelInfo();
  const totalM = Math.round(PATH.reduce((a,p) => a + mastery(p.id), 0) / PATH.length);
  let ok = 0, bad = 0;
  Object.values(P.skills).forEach(s => { ok += s.ok; bad += s.bad; });
  const acc = ok+bad ? Math.round(100*ok/(ok+bad)) : 0;
  const mins = Math.round(P.practiceMs/60000);
  document.getElementById('profileRoot').innerHTML = `
  <div class="card appear" style="display:flex; align-items:center; gap:18px">
    ${ring(li.pct, 84, 'Niv ' + li.lvl)}
    <div style="flex:1">
      <b style="font-size:1.15rem">${P.xp} XP</b><br>
      <small style="color:var(--muted)">${li.into}/${li.need} XP vers le niveau ${li.lvl+1}</small>
      <div class="pbar" style="margin-top:8px"><i style="width:${li.pct}%"></i></div>
    </div>
  </div>
  <div class="stats appear" style="animation-delay:.06s">
    <div class="stat"><b>${streak()}</b>🔥 série</div>
    <div class="stat"><b>${P.notes}</b>notes détectées</div>
    <div class="stat"><b>${P.games}</b>jeux terminés</div>
    <div class="stat"><b>${acc}%</b>précision globale</div>
    <div class="stat"><b>${mins}</b>min de pratique</div>
    <div class="stat"><b>${totalM}%</b>progression totale</div>
  </div>
  <div class="card appear" style="animation-delay:.12s">
    <h2>📊 Maîtrise par compétence</h2>
    ${PATH.map(p => {
      const m = mastery(p.id);
      return `<div style="display:flex; align-items:center; gap:10px; padding:5px 0">
        <span style="width:26px; text-align:center">${p.icon}</span>
        <span style="flex:1; font-size:.85rem">${p.name}</span>
        <div class="pbar" style="width:38%; max-width:200px"><i style="width:${m}%"></i></div>
        <span style="width:40px; text-align:right; font-size:.8rem; color:var(--muted)">${m}%</span>
      </div>`;
    }).join('')}
  </div>
  <div class="card appear" style="animation-delay:.18s">
    <h2>🏅 Badges</h2>
    <div class="badges">
      ${BADGES.map(b => `<div class="badge ${P.badges[b.id]?'won':''}"><div class="bic">${b.icon}</div><small><b>${b.name}</b><br>${b.desc}</small></div>`).join('')}
    </div>
  </div>
  <div class="card appear" style="animation-delay:.24s">
    <h2>🕐 Historique récent</h2>
    <table><thead><tr><th>Date</th><th>Jeu</th><th>Score</th><th>XP</th></tr></thead><tbody>
      ${P.history.slice(-15).reverse().map(h => {
        const dt = new Date(h.d);
        return `<tr><td>${dt.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})} ${dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</td><td>${h.name}</td><td>${h.score} %</td><td>+${h.xp}</td></tr>`;
      }).join('') || '<tr><td colspan="4" style="color:var(--muted)">Joue ton premier jeu !</td></tr>'}
    </tbody></table>
  </div>`;
}

/* ---------- Réglages ---------- */
function refreshSfxBtn(){
  document.getElementById('sfxToggle').textContent = sfxOn ? '🔊 Activés' : '🔇 Coupés';
}
document.getElementById('sfxToggle').addEventListener('click', () => {
  sfxOn = !sfxOn;
  localStorage.setItem('cg_sfx', sfxOn ? '1' : '0');
  refreshSfxBtn();
  if (sfxOn) sfx.ok();
});
document.getElementById('expBtn').addEventListener('click', async () => {
  const data = localStorage.getItem('cg_profile') || '{}';
  try{ await navigator.clipboard.writeText(data); toast('📋 Sauvegarde copiée dans le presse-papier'); }
  catch(e){ prompt('Copie ce texte pour sauvegarder :', data); }
});
document.getElementById('impBtn').addEventListener('click', () => {
  const data = prompt('Colle ta sauvegarde ici :');
  if (!data) return;
  try{ JSON.parse(data); localStorage.setItem('cg_profile', data); location.reload(); }
  catch(e){ toast('❌ Sauvegarde invalide'); sfx.err(); }
});
document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('Effacer toute ta progression ? (XP, badges, maîtrise…)')){
    localStorage.removeItem('cg_profile');
    location.reload();
  }
});
document.getElementById('overlaySkip').addEventListener('click', () => {
  document.getElementById('overlay').classList.add('hidden');
  sfx.tap();
});

/* ---------- Initialisation ---------- */
loadProfile();
ensureGoals();
ensureDaily();
refreshSfxBtn();
updateHeader();
renderHome();
checkAllBadges();
if (toastLater) setTimeout(() => toast(toastLater), 1200);

