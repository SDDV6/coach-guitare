"use strict";
/* ============================================================
   ENGINE — moteur audio, détection YIN, ampli, manche SVG,
   sons d'interface, confettis. (Aucune logique de progression ici.)
   ============================================================ */

/* ---------- Utilitaires notes ---------- */
const NAMES_EN = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NAMES_FR = ['Do','Do#','Ré','Ré#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];
const pcFR = pc => NAMES_FR[((pc%12)+12)%12];
const pcEN = pc => NAMES_EN[((pc%12)+12)%12];
const pcBoth = pc => pcFR(pc) + ' (' + pcEN(pc) + ')';
const midiOct = m => Math.floor(m/12) - 1;
const midiFreq = m => 440 * Math.pow(2,(m-69)/12);
const freqToMidiFloat = f => 69 + 12 * Math.log2(f/440);

/* ---------- Moteur audio : micro + détection ---------- */
let audioCtx = null, analyser = null, timeBuf = null, micOn = false;
const listeners = new Set();   // reçoit {type:'pitch'|'note'|'silence', midi, cents, freq}
let RMS_THRESHOLD = parseFloat(localStorage.getItem('cg_thr') || '0.012');

// Détection de hauteur YIN (celle des accordeurs professionnels)
function autoCorrelate(buf, sampleRate){
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++){ const v = buf[i]; rms += v*v; }
  rms = Math.sqrt(rms/SIZE);
  if (rms < RMS_THRESHOLD) return {freq:-1, rms};
  const tauMin = Math.max(2, Math.floor(sampleRate/1500));
  const tauMax = Math.min(Math.floor(sampleRate/70), SIZE >> 1);
  // Fenêtre d'intégration fixe (YIN standard) : plus rapide et comparable entre tau
  const W = Math.min(SIZE - tauMax, SIZE >> 1);
  const d = new Float32Array(tauMax+1);
  for (let tau = 1; tau <= tauMax; tau++){
    let sum = 0;
    for (let i = 0; i < W; i++){ const diff = buf[i] - buf[i+tau]; sum += diff*diff; }
    d[tau] = sum;
  }
  const yin = new Float32Array(tauMax+1);
  yin[0] = 1;
  let cum = 0;
  for (let tau = 1; tau <= tauMax; tau++){ cum += d[tau]; yin[tau] = cum > 0 ? d[tau]*tau/cum : 1; }
  const THRESH = 0.15;
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++){
    if (yin[t] < THRESH){ while (t+1 <= tauMax && yin[t+1] < yin[t]) t++; tau = t; break; }
  }
  if (tau < 0){
    let best = 1, bt = -1;
    for (let t = tauMin; t <= tauMax; t++) if (yin[t] < best){ best = yin[t]; bt = t; }
    if (best < 0.3) tau = bt; else return {freq:-1, rms};
  }
  const x1 = yin[tau-1] ?? yin[tau], x2 = yin[tau], x3 = yin[tau+1] ?? yin[tau];
  const a = (x1 + x3 - 2*x2)/2, b = (x3 - x1)/2;
  let T = tau;
  if (a) T = tau - b/(2*a);
  // clarity ∈ [0,1] : proche de 1 = détection très fiable
  return {freq: sampleRate/T, rms, clarity: 1 - x2};
}

let candMidi = null, candCount = 0, currentMidi = null, silenceCount = 0;
const ANALYSIS_MS = 11, SILENCE_FRAMES = 14;
let diagTick = 0, zeroFrames = 0, rateFixTried = false, micLevelBarEl = null, lastMicRms = 0;

// Niveau (rms) peu coûteux : O(n). À calculer à chaque trame pour un gate réactif.
function quickRms(buf){
  let s = 0;
  for (let i = 0; i < buf.length; i++){ const v = buf[i]; s += v*v; }
  return Math.sqrt(s/buf.length);
}

function processFrame(){
  // Une trame ratée ne doit JAMAIS tuer la boucle audio (anti-crash).
  try{
    if (!analyser) return;
    analyser.getFloatTimeDomainData(timeBuf);
    diagTick++;

    const rms = quickRms(timeBuf);
    lastMicRms = rms; // exposé pour le calibrage du gate
    if (!micLevelBarEl) micLevelBarEl = document.getElementById('micLevelBar');
    if (micLevelBarEl) micLevelBarEl.style.width = Math.min(100, rms*600) + '%';

    // ----- Noise gates (chaque ampli a le sien, indépendant) -----
    if (amp && amp.on && audioCtx.state === 'running'){
      const tNow = audioCtx.currentTime;
      if (amp.gateThr > 0){
        const open = rms > amp.gateThr;
        amp.gate.gain.setTargetAtTime(open ? 1 : 0, tNow, open ? 0.004 : 0.06);
      }
      if (amp.wahAmt > 0){
        wahEnv += (Math.min(1, rms*22) - wahEnv) * 0.35;
        amp.wahBp.frequency.setTargetAtTime(350 + wahEnv*2800, tNow, 0.03);
      }
    }
    // Gate de l'ampli neuronal : expandeur DOUX, pas un couperet. Au repos on
    // descend vers un plancher (–18 dB) au lieu du silence total, avec un
    // relâchement lent → la résonance de la guitare n'est jamais hachée.
    if (nam.on && nam.gate && nam.gateThr > 0 && nam.ctx && nam.ctx.state === 'running'){
      const open = rms > nam.gateThr;
      nam.gate.gain.setTargetAtTime(open ? 1 : 0.12, nam.ctx.currentTime, open ? 0.005 : 0.16);
    }

    if (diagTick % 45 === 0) updateDiag(rms);
    // Garde-fou « analyse morte » : reprise des contextes interrompus par iOS
    if (diagTick % 90 === 0){
      if (micOn && audioCtx.state !== 'running' && audioCtx.state !== 'closed') audioCtx.resume().catch(()=>{});
      if (nam.on && nam.ctx && nam.ctx.state !== 'running' && nam.ctx.state !== 'closed') nam.ctx.resume().catch(()=>{});
    }
    // Garde-fou « mort silencieuse » : piste vivante mais échantillons NULS.
    // C'est LA panne des micros jack/USB sous Windows (aucun événement émis !) :
    // on la traite comme une vraie panne pour dérouler l'échelle de secours
    // (relance → mode compatible → bascule 44,1/48 kHz → stop + rapport).
    if (rms === 0 && micHealthy()) zeroFrames++; else zeroFrames = 0;
    if (zeroFrames === 110){ // ~1,2 s de zéros absolus
      zeroFrames = 0;
      micDiagLog('mort silencieuse (1,2 s de zéros)');
      micSourceDied(lastDeviceKey);
    }
    // Du vrai signal pendant ~1 s → l'entrée est fiable, on remet les compteurs à zéro
    if (rms > 0.001){ if (++signalFrames === 90){ micFailCounts = {}; micDiagLog('signal stable ✓'); } }
    else if (signalFrames < 90) signalFrames = 0;

    // ----- Détection de hauteur (coûteuse) -----
    // Le réseau de neurones du NAM consomme déjà beaucoup de CPU. On espace
    // fortement la détection (15 Hz au lieu de 90 Hz) pour laisser respirer
    // le processeur de l'iPhone et éviter les plantages. Sans NAM : pleine
    // cadence (90 Hz), la détection reste ultra-réactive pour les jeux.
    if (nam.on && diagTick % 6 !== 0) return;

    const {freq, clarity} = autoCorrelate(timeBuf, audioCtx.sampleRate);
    if (freq > 0 && freq >= 70 && freq <= 1500){
      silenceCount = 0;
      const mf = freqToMidiFloat(freq);
      const midi = Math.round(mf);
      const cents = Math.round((mf - midi) * 100);
      emit({type:'pitch', freq, midi, cents});
      if (midi === candMidi) candCount++;
      else { candMidi = midi; candCount = 1; }
      const needed = (clarity >= 0.9) ? 1 : 2;
      if (candCount >= needed && midi !== currentMidi){
        currentMidi = midi;
        emit({type:'note', midi, cents});
      }
    } else {
      silenceCount++;
      if (silenceCount === SILENCE_FRAMES){
        currentMidi = null; candMidi = null; candCount = 0;
        emit({type:'silence'});
      }
    }
  }catch(e){ /* trame ignorée, la boucle continue */ }
}
function emit(ev){ listeners.forEach(fn => { try{ fn(ev); }catch(e){ console.error(e); } }); }

let micStream = null, loopRunning = false, micSrcNode = null;
let sessionInputOverride = null, autoSwitched = false, forceRate = 0;
// Anti-« flux qui meurt » : certains pilotes (iRig sur Windows notamment) ne
// supportent pas nos contraintes strictes (traitements désactivés) et coupent
// après ~0,5 s. On compte les morts par appareil ; 2 morts rapides → on
// rebascule cet appareil en mode « compatible » (réglages par défaut du navigateur).
let micFailCounts = {}, micRelaxed = false, micStableTimer = null, micMuteTimer = null;
let lastDeviceKey = 'default', signalFrames = 0, micAbandoned = false;
// Journal de diagnostic (bouton 🩺 dans Studio → Micro)
let micDiagBuf = [];
function micDiagLog(msg){
  if (micDiagBuf.length < 500) micDiagBuf.push((performance.now()/1000).toFixed(1) + 's  ' + msg);
}
// Échelle de secours : chaque panne du même appareil déclenche l'étape suivante.
// 1 = simple relance · 2 = mode compatible (traitements navigateur) ·
// 3 = bascule de fréquence 44,1↔48 kHz · 4 = relance · 5 = stop + rapport
function micSourceDied(id){
  micFailCounts[id] = (micFailCounts[id]||0) + 1;
  const n = micFailCounts[id];
  micDiagLog('PANNE #' + n + ' (' + id.slice(0,10) + ')');
  if (n === 2 && !micRelaxed){
    micRelaxed = true;
    micDiagLog('→ secours : mode compatible');
  } else if (n === 3){
    forceRate = (audioCtx && audioCtx.sampleRate === 48000) ? 44100 : 48000;
    micDiagLog('→ secours : fréquence forcée ' + forceRate + ' Hz');
  } else if (n >= 5){
    micOn = false; micAbandoned = true; updateMicUI();
    micDiagLog('ABANDON après 5 pannes');
    const el = document.getElementById('micDiag');
    if (el) el.textContent = '⚠️ Cette entrée coupe en boucle malgré les modes de secours. Lance le « 🩺 Diagnostic » ci-dessous et envoie le rapport.';
    return;
  }
  restartMic();
}
// Rapport de diagnostic : 12 s d\'observation détaillée, à copier-coller
async function runMicReport(){
  const out = document.getElementById('micReport');
  out.style.display = 'block';
  out.textContent = 'Diagnostic en cours (12 s)… JOUE QUELQUES NOTES pendant le test !';
  const t0 = micDiagBuf.length; // conserve l'historique des pannes déjà loggé
  micDiagLog('=== DIAGNOSTIC MANUEL ===');
  micDiagLog('navigateur: ' + navigator.userAgent);
  micDiagLog('mode: relaxed=' + micRelaxed + ' forceRate=' + forceRate + ' pannes=' + JSON.stringify(micFailCounts));
  const t = micTrack();
  if (t){
    micDiagLog('piste: "' + t.label + '" state=' + t.readyState + ' muted=' + t.muted);
    try{ micDiagLog('réglages piste: ' + JSON.stringify(t.getSettings())); }catch(e){}
  } else micDiagLog('piste: AUCUNE (micro non démarré ?)');
  if (audioCtx) micDiagLog('contexte: ' + audioCtx.state + ' @' + audioCtx.sampleRate + ' Hz');
  for (let i = 0; i < 24; i++){
    await new Promise(r => setTimeout(r, 500));
    const tt = micTrack();
    micDiagLog('niveau=' + (lastMicRms*100).toFixed(2) + '%  piste=' + (tt ? tt.readyState + (tt.muted ? '/MUET' : '') : 'absente') + '  ctx=' + (audioCtx ? audioCtx.state : '—'));
  }
  micDiagLog('=== FIN ===');
  out.textContent = micDiagBuf.join('\n');
}

// L'AudioContext est créé UNE fois (dans le geste utilisateur) puis réutilisé.
async function ensureContext(desiredRate){
  if (audioCtx && audioCtx.state !== 'closed'){
    if (!desiredRate || audioCtx.sampleRate === desiredRate) return audioCtx;
    try{ await audioCtx.close(); }catch(e){}
    audioCtx = null;
  }
  const opts = {latencyHint:'interactive'};
  if (desiredRate) opts.sampleRate = desiredRate;
  try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(opts); }
  catch(e){ audioCtx = new (window.AudioContext || window.webkitAudioContext)({latencyHint:'interactive'}); }
  return audioCtx;
}
// Tout toucher relance les contextes non actifs. iOS peut les mettre en
// 'suspended' MAIS AUSSI dans l'état non standard 'interrupted' (quand deux
// contextes se partagent la session audio, ou en web-app installée).
['touchend','click'].forEach(evName => document.addEventListener(evName, () => {
  if (audioCtx && audioCtx.state !== 'running' && audioCtx.state !== 'closed') audioCtx.resume().catch(()=>{});
  if (nam.ctx && nam.ctx.state !== 'running' && nam.ctx.state !== 'closed') nam.ctx.resume().catch(()=>{});
}, {passive:true}));

async function startMic(){
  const pref = localStorage.getItem('cg_input') || 'auto';
  const devId = pref !== 'auto' ? pref : sessionInputOverride;
  try{
    // Mode strict (qualité guitare) ou compatible (si l'appareil a coupé 2×).
    // NB : plus de `latency:0` — cette contrainte faisait planter certains pilotes.
    const constraints = micRelaxed ? {} : { echoCancellation:false, noiseSuppression:false, autoGainControl:false };
    if (devId) constraints.deviceId = { exact: devId };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    micStream = stream;
    const track = stream.getAudioTracks()[0];
    const trackRate = forceRate || ((track.getSettings && track.getSettings().sampleRate) || 0);
    await ensureContext(trackRate || undefined);
    audioCtx.resume().catch(()=>{});
    // Génère (une fois par contexte) l'IR du baffle pour la convolution
    if (!cabIR || cabIR.sampleRate !== audioCtx.sampleRate){
      try{ cabIR = await makeCabIR(audioCtx); }catch(e){ cabIR = null; }
    }
    // Référence GLOBALE forte : sans elle, le ramasse-miettes du navigateur
    // détruit ce nœud au bout de ~0,5 s → le son ET l'analyse se coupent.
    try{ if (micSrcNode) micSrcNode.disconnect(); }catch(e){}
    const src = audioCtx.createMediaStreamSource(stream);
    micSrcNode = src;
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    timeBuf = new Float32Array(analyser.fftSize);
    const ampWasOn = amp && amp.on;
    if (amp){ try{ amp.master.disconnect(); }catch(e){} }
    amp = buildAmp(audioCtx, src);
    ampApply();
    if (ampWasOn){ amp.on = true; amp.master.gain.value = 1; }
    const deviceKey = devId || 'default';
    lastDeviceKey = deviceKey;
    signalFrames = 0; zeroFrames = 0; micAbandoned = false;
    micDiagLog('démarré: "' + (track.label||'?') + '" @' + audioCtx.sampleRate + 'Hz  contraintes=' + JSON.stringify(constraints));
    track.addEventListener('ended', () => { micDiagLog('événement: ended'); if (micOn) micSourceDied(deviceKey); });
    // Un « mute » qui dure >1,5 s = flux mort (pilote qui a lâché) → même traitement
    track.addEventListener('mute', () => {
      micDiagLog('événement: mute');
      updateMicUI();
      clearTimeout(micMuteTimer);
      micMuteTimer = setTimeout(() => { if (micOn && track.muted) micSourceDied(deviceKey); }, 1500);
    });
    track.addEventListener('unmute', () => { micDiagLog('événement: unmute'); clearTimeout(micMuteTimer); updateMicUI(); });
    // NB : la remise à zéro des compteurs de panne ne se fait plus au bout d'un
    // délai mais uniquement après 1 s de VRAI signal (voir processFrame).
    micOn = true;
    updateMicUI();
    document.getElementById('overlay').classList.add('hidden');
    if (!loopRunning){
      loopRunning = true;
      // Cadence fixe et rapide, indépendante du rafraîchissement de l'écran
      setInterval(processFrame, ANALYSIS_MS);
    }
    if (pref === 'auto' && !autoSwitched){
      const ext = await findExternalInput();
      const cur = (track.getSettings && track.getSettings().deviceId) || '';
      if (ext && ext.deviceId && ext.deviceId !== cur){
        autoSwitched = true;
        sessionInputOverride = ext.deviceId;
        restartMic();
        return;
      }
    }
    if (nam.ready) namConnectInput(); // rebranche l'ampli neuronal sur le nouveau flux micro
    refreshInputs();
  }catch(err){
    if (devId){
      sessionInputOverride = null;
      localStorage.setItem('cg_input', 'auto');
      return startMic();
    }
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('overlayErr').textContent =
      "Impossible d'accéder au micro : " + err.message + " — vérifie l'autorisation micro (Réglages iOS → Safari → Micro).";
  }
}
async function findExternalInput(){
  try{
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.find(d => d.kind === 'audioinput' && d.label && !/built-?in|int[ée]gr|iphone|ipad|interne/i.test(d.label)) || null;
  }catch(e){ return null; }
}
async function refreshInputs(){
  const sel = document.getElementById('inputSelect');
  try{
    const devs = await navigator.mediaDevices.enumerateDevices();
    const inputs = devs.filter(d => d.kind === 'audioinput');
    const saved = localStorage.getItem('cg_input') || 'auto';
    sel.innerHTML = '';
    sel.add(new Option('Automatique (entrée branchée en priorité)', 'auto'));
    inputs.forEach((d,i) => sel.add(new Option(d.label || ('Entrée audio ' + (i+1)), d.deviceId)));
    sel.value = Array.from(sel.options).some(o => o.value === saved) ? saved : 'auto';
  }catch(e){}
}
document.getElementById('inputSelect').addEventListener('change', () => {
  localStorage.setItem('cg_input', document.getElementById('inputSelect').value);
  sessionInputOverride = null; autoSwitched = false;
  if (micOn) restartMic();
});
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener){
  navigator.mediaDevices.addEventListener('devicechange', () => {
    autoSwitched = false; sessionInputOverride = null;
    refreshInputs();
    if (micOn) restartMic();
  });
}
function micTrack(){ return micStream ? micStream.getAudioTracks()[0] : null; }
function micHealthy(){
  const t = micTrack();
  return micOn && t && t.readyState === 'live' && !t.muted && audioCtx && audioCtx.state === 'running';
}
async function restartMic(){
  try{ if (micStream) micStream.getTracks().forEach(t => t.stop()); }catch(e){}
  analyser = null; micOn = false;
  await startMic();
}
function updateMicUI(){
  const btn = document.getElementById('micBtn');
  if (!micOn){ btn.textContent = '🎤'; btn.classList.remove('on'); btn.title = 'Activer le micro'; return; }
  if (micHealthy()){ btn.textContent = '🎤 actif'; btn.classList.add('on'); }
  else { btn.textContent = '⚠️ micro'; btn.classList.remove('on'); }
}
function updateDiag(rms){
  const el = document.getElementById('micDiag'); if (!el) return;
  if (micAbandoned) return; // le message d'abandon reste affiché
  const t = micTrack();
  if (!micOn || !t){ el.textContent = 'Micro : inactif.'; return; }
  if (t.muted || t.readyState !== 'live'){ el.textContent = '⚠️ iOS a coupé le micro — appuie sur le bouton micro en haut.'; return; }
  if (audioCtx && audioCtx.state !== 'running'){ el.textContent = '⚠️ Audio en pause — touche l\'écran pour relancer.'; return; }
  const niveau = Math.min(100, Math.round(rms*600));
  const seuil = Math.min(100, Math.round(RMS_THRESHOLD*600));
  // Mesure de latence réelle : tampon de rendu + sortie matérielle, aller simple.
  // (L'aller-retour complet ajoute la latence d'entrée, non mesurable, ~+10 ms.)
  const ctxRef = (nam.on && nam.ctx) ? nam.ctx : audioCtx;
  const latMs = Math.round(((ctxRef.baseLatency || 0) + (ctxRef.outputLatency || 0)) * 1000);
  el.textContent = `Entrée : ${t.label || 'micro'} @ ${audioCtx.sampleRate} Hz — niveau ${niveau} % / seuil ${seuil} %` +
    (latMs ? ` — sortie ${latMs} ms${nam.on ? ' (NAM)' : ''}` : '') +
    (rms >= RMS_THRESHOLD ? ' ✓ son détecté' : ' — sous le seuil');
}
document.getElementById('micReportBtn').addEventListener('click', runMicReport);
document.getElementById('overlayBtn').addEventListener('click', startMic);
document.getElementById('micBtn').addEventListener('click', () => {
  micFailCounts = {}; micAbandoned = false; // clic manuel = nouvelle chance complète
  if (!micOn) startMic(); else restartMic();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !micOn) return;
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  setTimeout(() => { if (micOn && !document.hidden && !micHealthy()) restartMic(); }, 700);
});
window.addEventListener('pageshow', () => { if (micOn && !micHealthy()) restartMic(); });
// Sensibilité
const sensSlider = document.getElementById('sensSlider');
sensSlider.value = Math.max(0, Math.min(100, Math.round(100 * Math.log10(0.03/RMS_THRESHOLD) / Math.log10(20))));
sensSlider.addEventListener('input', () => {
  RMS_THRESHOLD = 0.03 * Math.pow(0.05, sensSlider.value/100);
  localStorage.setItem('cg_thr', String(RMS_THRESHOLD));
});
// Hooks de test
window._debugNote = (midi, cents=0) => { emit({type:'pitch', freq:midiFreq(midi), midi, cents}); emit({type:'note', midi, cents}); };
window._debugSilence = () => emit({type:'silence'});

/* ---------- Lecture de notes (exercices d'oreille) ---------- */
let toneGuard = 0; // pendant qu'on joue un son, on ignore le micro
async function playTone(midi, dur = 0.9, when = 0){
  await ensureContext();
  audioCtx.resume().catch(()=>{});
  const t = audioCtx.currentTime + when;
  const o = audioCtx.createOscillator(); o.frequency.value = midiFreq(midi);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + dur + 0.05);
  toneGuard = Math.max(toneGuard, Date.now() + (when + dur)*1000 + 350);
}
async function playMelody(midis, gap = 0.55, dur = 0.5){
  for (let i = 0; i < midis.length; i++) await playTone(midis[i], dur, i*gap);
}

/* ---------- Sons d'interface (synthétisés, style Duolingo) ---------- */
let sfxOn = localStorage.getItem('cg_sfx') !== '0';
function _blip(freq, dur, type, vol, when = 0){
  if (!sfxOn || !audioCtx || audioCtx.state !== 'running') return;
  const t = audioCtx.currentTime + when;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + dur + 0.03);
}
const sfx = {
  tap(){ _blip(2100, .05, 'sine', .06); },
  open(){ _blip(880, .07, 'sine', .07); _blip(1320, .08, 'sine', .06, .05); },
  ok(){ _blip(880, .09, 'sine', .12); _blip(1318, .14, 'sine', .12, .08); },
  err(){ _blip(196, .18, 'triangle', .14); },
  win(){ [523,659,784,1047].forEach((f,i) => _blip(f, .16, 'sine', .13, i*.09)); },
  badge(){ [784,988,1175,1568].forEach((f,i) => _blip(f, .2, 'sine', .12, i*.1)); },
  level(){ [523,659,784,880,1047,1319].forEach((f,i) => _blip(f, .18, 'sine', .12, i*.08)); },
  streak(){ _blip(1047, .12, 'sine', .12); _blip(1568, .2, 'sine', .1, .1); },
  tick(){ _blip(1900, .04, 'sine', .1); }
};

/* ---------- Confettis ---------- */
function confetti(){
  const cv = document.getElementById('confettiCv');
  const ctx2 = cv.getContext('2d');
  cv.style.display = 'block';
  cv.width = innerWidth; cv.height = innerHeight;
  // filet de sécurité : cache le canvas même si l'animation est gelée (onglet en fond)
  clearTimeout(confetti._hide);
  confetti._hide = setTimeout(() => { cv.style.display = 'none'; cv.width = 1; cv.height = 1; }, 2100);
  const colors = ['#f6a92c','#f97362','#4ade80','#5ba7f7','#a78bfa','#f472b6'];
  const parts = Array.from({length:90}, () => ({
    x: innerWidth/2 + (Math.random()-0.5)*160,
    y: innerHeight*0.35,
    vx: (Math.random()-0.5)*11,
    vy: -Math.random()*11 - 4,
    s: Math.random()*7 + 4,
    c: colors[Math.floor(Math.random()*colors.length)],
    r: Math.random()*Math.PI,
    vr: (Math.random()-0.5)*0.25
  }));
  const t0 = performance.now();
  (function tick(now){
    const dt = (now - t0)/1000;
    ctx2.clearRect(0,0,cv.width,cv.height);
    if (dt > 1.9){ cv.style.display = 'none'; cv.width = 1; cv.height = 1; return; }
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.32; p.r += p.vr;
      ctx2.save(); ctx2.translate(p.x, p.y); ctx2.rotate(p.r);
      ctx2.fillStyle = p.c; ctx2.globalAlpha = Math.max(0, 1 - dt/1.9);
      ctx2.fillRect(-p.s/2, -p.s/2, p.s, p.s*0.6);
      ctx2.restore();
    });
    requestAnimationFrame(tick);
  })(t0);
}

/* ---------- Ampli virtuel (pédalier v2) ---------- */
let amp = null, cabIR = null, wahEnv = 0;

// Réponse impulsionnelle de baffle synthétisée hors-ligne : une impulsion passée
// dans une chaîne de filtres façon 4x12 (thump ~110 Hz, creux 400 Hz, présence
// 3 kHz, chute raide au-delà de 5 kHz). Bien plus réaliste qu'un simple passe-bas.
async function makeCabIR(ctx){
  const rate = ctx.sampleRate, len = Math.floor(rate*0.085);
  const off = new OfflineAudioContext(1, len, rate);
  const buf = off.createBuffer(1, len, rate);
  buf.getChannelData(0)[0] = 1;
  const src = off.createBufferSource(); src.buffer = buf;
  const chain = [
    ['highpass', 78, .8, 0], ['peaking', 110, 1.0, 5.5], ['peaking', 420, 1.2, -4],
    ['peaking', 900, 1.6, -1.5], ['peaking', 1700, 1.5, 2.5], ['peaking', 3000, 1.3, 5],
    ['lowpass', 4700, .9, 0], ['lowpass', 5400, .8, 0]
  ];
  let node = src;
  for (const [type, f, q, g] of chain){
    const b = off.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g;
    node.connect(b); node = b;
  }
  node.connect(off.destination);
  src.start();
  return await off.startRendering();
}
function distCurve(amount){
  const k = amount*amount*180 + 2;
  const n = 2048, curve = new Float32Array(n);
  for (let i = 0; i < n; i++){ const x = i*2/n - 1; curve[i] = (3+k)*x / (3 + k*Math.abs(x)); }
  return curve;
}
function makeIR(ctx, seconds=1.7, decay=2.8){
  const rate = ctx.sampleRate, len = Math.floor(rate*seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++){
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random()*2 - 1) * Math.pow(1 - i/len, decay);
  }
  return buf;
}
function buildAmp(ctx, src){
  const input = ctx.createGain();  input.gain.value = 1.4;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 75;
  // Noise gate (piloté par l'enveloppe mesurée dans processFrame)
  const gate = ctx.createGain(); gate.gain.value = 1;
  const comp = ctx.createDynamicsCompressor();
  comp.attack.value = 0.005; comp.release.value = 0.12; comp.knee.value = 12;
  // Boost propre (avant la disto, comme une pédale de boost)
  const boost = ctx.createGain(); boost.gain.value = 1;
  // Auto-wah : passe-bande piloté par l'enveloppe, en dry/wet
  const wahDry = ctx.createGain(); const wahWet = ctx.createGain(); const wahOut = ctx.createGain();
  const wahBp = ctx.createBiquadFilter(); wahBp.type = 'bandpass'; wahBp.frequency.value = 600; wahBp.Q.value = 4;
  const wahMk = ctx.createGain(); wahMk.gain.value = 1.6; // compense la perte du passe-bande
  // Distorsion à DEUX étages avec filtrage inter-étages (topologie d'ampli réel) :
  // le passe-haut entre les étages évite la bouillie dans les graves,
  // le passe-bas évite la friture dans les aigus.
  const pre = ctx.createGain();
  const st1 = ctx.createWaveShaper(); st1.oversample = '4x';
  const isHp = ctx.createBiquadFilter(); isHp.type = 'highpass'; isHp.frequency.value = 120;
  const isLp = ctx.createBiquadFilter(); isLp.type = 'lowpass'; isLp.frequency.value = 6200;
  const pre2 = ctx.createGain();
  const st2 = ctx.createWaveShaper(); st2.oversample = '4x';
  const bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 120;
  const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 650; mid.Q.value = 0.9;
  const treble = ctx.createBiquadFilter(); treble.type = 'highshelf'; treble.frequency.value = 3000;
  // Baffle : convolution sur IR synthétisée (remplace l'ancien simple passe-bas)
  const cabConv = ctx.createConvolver(); cabConv.normalize = true;
  if (cabIR && cabIR.sampleRate === ctx.sampleRate) cabConv.buffer = cabIR;
  const post = ctx.createGain();
  // Chorus
  const chDry = ctx.createGain(); const chWet = ctx.createGain(); const chOut = ctx.createGain();
  const chDelay = ctx.createDelay(0.06); chDelay.delayTime.value = 0.018;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 1.3;
  const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.004;
  lfo.connect(lfoAmt); lfoAmt.connect(chDelay.delayTime); lfo.start();
  // Phaser : 4 étages passe-tout balayés par un LFO + réinjection
  const phDry = ctx.createGain(); const phWet = ctx.createGain(); const phOut = ctx.createGain();
  const phStages = [350, 720, 1100, 1600].map(f => {
    const ap = ctx.createBiquadFilter(); ap.type = 'allpass'; ap.frequency.value = f; ap.Q.value = 0.6;
    return ap;
  });
  const phFb = ctx.createGain(); phFb.gain.value = 0;
  const phLfo = ctx.createOscillator(); phLfo.frequency.value = 0.5;
  const phAmt = ctx.createGain(); phAmt.gain.value = 500;
  phLfo.connect(phAmt); phStages.forEach(ap => phAmt.connect(ap.frequency)); phLfo.start();
  // Flanger : retard court modulé + forte réinjection
  const flDry = ctx.createGain(); const flWet = ctx.createGain(); const flOut = ctx.createGain();
  const flDelay = ctx.createDelay(0.02); flDelay.delayTime.value = 0.0035;
  const flLfo = ctx.createOscillator(); flLfo.frequency.value = 0.25;
  const flAmt = ctx.createGain(); flAmt.gain.value = 0.0022;
  flLfo.connect(flAmt); flAmt.connect(flDelay.delayTime); flLfo.start();
  const flFb = ctx.createGain(); flFb.gain.value = 0;
  // Trémolo : volume modulé par un LFO
  const trem = ctx.createGain(); trem.gain.value = 1;
  const trLfo = ctx.createOscillator(); trLfo.frequency.value = 5.2;
  const trAmt = ctx.createGain(); trAmt.gain.value = 0;
  trLfo.connect(trAmt); trAmt.connect(trem.gain); trLfo.start();
  // Delay
  const dlDry = ctx.createGain(); const dlWet = ctx.createGain(); const dlOut = ctx.createGain();
  const dl = ctx.createDelay(1.2); dl.delayTime.value = 0.3;
  const dlFb = ctx.createGain(); dlFb.gain.value = 0.25;
  const dlTone = ctx.createBiquadFilter(); dlTone.type = 'lowpass'; dlTone.frequency.value = 2600;
  dl.connect(dlTone); dlTone.connect(dlFb); dlFb.connect(dl);
  // Réverb
  const rvDry = ctx.createGain(); const rvWet = ctx.createGain();
  const conv = ctx.createConvolver(); conv.buffer = makeIR(ctx);
  const master = ctx.createGain(); master.gain.value = 0;
  master.channelCount = 1; master.channelCountMode = 'explicit'; // mono centré
  // ---- Câblage ----
  src.connect(input); input.connect(hp); hp.connect(gate); gate.connect(comp); comp.connect(boost);
  boost.connect(wahDry); wahDry.connect(wahOut);
  boost.connect(wahBp); wahBp.connect(wahMk); wahMk.connect(wahWet); wahWet.connect(wahOut);
  wahOut.connect(pre); pre.connect(st1); st1.connect(isHp); isHp.connect(isLp);
  isLp.connect(pre2); pre2.connect(st2);
  st2.connect(bass); bass.connect(mid); mid.connect(treble);
  treble.connect(cabConv); cabConv.connect(post);
  post.connect(phDry); phDry.connect(phOut);
  post.connect(phStages[0]);
  phStages[0].connect(phStages[1]); phStages[1].connect(phStages[2]); phStages[2].connect(phStages[3]);
  phStages[3].connect(phWet); phWet.connect(phOut);
  phStages[3].connect(phFb); phFb.connect(phStages[0]);
  phOut.connect(flDry); flDry.connect(flOut);
  phOut.connect(flDelay); flDelay.connect(flWet); flWet.connect(flOut);
  flDelay.connect(flFb); flFb.connect(flDelay);
  flOut.connect(chDry); chDry.connect(chOut);
  flOut.connect(chDelay); chDelay.connect(chWet); chWet.connect(chOut);
  chOut.connect(trem);
  trem.connect(dlDry); dlDry.connect(dlOut);
  trem.connect(dl); dl.connect(dlWet); dlWet.connect(dlOut);
  dlOut.connect(rvDry); rvDry.connect(master);
  dlOut.connect(conv); conv.connect(rvWet); rvWet.connect(master);
  master.connect(ctx.destination);
  return {comp, gate, boost, wahBp, wahDry, wahWet, pre, st1, pre2, st2, bass, mid, treble, cabConv, post,
          chDry, chWet, phDry, phWet, phFb, phLfo, flDry, flWet, flFb, trem, trAmt, trLfo,
          dl, dlFb, dlDry, dlWet, rvDry, rvWet, master, gateThr:0, wahAmt:0, on:false};
}
const AMP_MAP = {drive:'ampDrive', vol:'ampVol', bass:'ampBass', mid:'ampMid', treble:'ampTreble',
                 comp:'ampComp', chorus:'ampChorus', dtime:'ampDTime', dfb:'ampDFb', dmix:'ampDMix', rev:'ampRev',
                 gate:'ampGate', boost:'ampBoost', wah:'ampWah', phaser:'ampPhaser', flanger:'ampFlanger', trem:'ampTrem'};
const AMP_DEFAULTS = {gate:0, boost:0, wah:0, phaser:0, flanger:0, trem:0};
function getAmpParams(){
  const P = {};
  for (const k in AMP_MAP) P[k] = parseFloat(document.getElementById(AMP_MAP[k]).value);
  return P;
}
function ampApply(){
  const P = getAmpParams();
  localStorage.setItem('cg_amp', JSON.stringify(P));
  if (!amp) return;
  const drive = P.drive/100;
  // Deux étages de saturation : le 1er chauffe doucement, le 2e écrase —
  // le même bouton Gain pilote les deux (comme le canal lead d'un ampli).
  amp.st1.curve = distCurve(drive*0.5);
  amp.st2.curve = distCurve(drive);
  amp.pre.gain.value = 1 + drive*6;
  amp.pre2.gain.value = 1 + drive*8;
  amp.post.gain.value = (0.9 - drive*0.55) * (P.vol/100) * 2.2;
  amp.bass.gain.value = P.bass; amp.mid.gain.value = P.mid; amp.treble.gain.value = P.treble;
  const c = P.comp/100;
  amp.comp.threshold.value = -c*40;
  amp.comp.ratio.value = 1 + c*7;
  // Noise gate : seuil d'enveloppe (0 = coupé), appliqué dans processFrame
  amp.gateThr = P.gate > 0 ? 0.004 + (P.gate/100)*0.028 : 0;
  if (amp.gateThr === 0) amp.gate.gain.value = 1;
  amp.boost.gain.value = 1 + (P.boost/100)*3;
  // Auto-wah
  amp.wahAmt = P.wah/100;
  amp.wahWet.gain.value = amp.wahAmt;
  amp.wahDry.gain.value = 1 - amp.wahAmt*0.65;
  // Phaser
  const ph = P.phaser/100;
  amp.phWet.gain.value = ph*0.85; amp.phDry.gain.value = 1 - ph*0.15; amp.phFb.gain.value = ph*0.35;
  // Flanger
  const fl = P.flanger/100;
  amp.flWet.gain.value = fl*0.8; amp.flDry.gain.value = 1; amp.flFb.gain.value = fl*0.45;
  // Trémolo (profondeur ; le LFO s'ajoute au gain de base)
  const tr = P.trem/100;
  amp.trem.gain.value = 1 - tr*0.45;
  amp.trAmt.gain.value = tr*0.45;
  // Chorus / delay / réverb
  amp.chDry.gain.value = 1; amp.chWet.gain.value = (P.chorus/100)*0.6;
  amp.dl.delayTime.value = P.dtime/1000;
  amp.dlFb.gain.value = Math.min(0.85, P.dfb/100);
  amp.dlDry.gain.value = 1; amp.dlWet.gain.value = (P.dmix/100)*0.9;
  amp.rvDry.gain.value = 1 - (P.rev/100)*0.4; amp.rvWet.gain.value = (P.rev/100)*0.9;
}
const SONG_PRESETS = {
  'Bases': [
    {n:'Clair cristallin', p:{drive:5,vol:70,bass:0,mid:0,treble:2,comp:20,chorus:0,dtime:300,dfb:20,dmix:0,rev:15}},
    {n:'Crunch classique', p:{drive:35,vol:70,bass:1,mid:2,treble:2,comp:10,chorus:0,dtime:300,dfb:20,dmix:0,rev:12}},
    {n:'Lead chantant', p:{drive:62,vol:68,bass:1,mid:4,treble:1,comp:35,chorus:0,dtime:380,dfb:25,dmix:18,rev:22}},
    {n:'Métal moderne', p:{drive:88,vol:65,bass:5,mid:-5,treble:3,comp:15,chorus:0,dtime:300,dfb:20,dmix:0,rev:8}}
  ],
  'Sons clairs': [
    {n:'Cachemire – La Veste (analysé, clair brillant)', p:{drive:12,vol:70,bass:-1,mid:2,treble:4,comp:35,chorus:15,dtime:300,dfb:20,dmix:0,rev:18}},
    {n:'Dire Straits – Sultans of Swing', p:{drive:10,vol:70,bass:0,mid:3,treble:3,comp:45,chorus:0,dtime:300,dfb:20,dmix:0,rev:22}},
    {n:'The Police – Every Breath You Take', p:{drive:6,vol:70,bass:1,mid:0,treble:3,comp:40,chorus:55,dtime:300,dfb:20,dmix:0,rev:18}},
    {n:'Nirvana – Come as You Are (couplet)', p:{drive:12,vol:70,bass:2,mid:0,treble:0,comp:20,chorus:80,dtime:300,dfb:20,dmix:0,rev:12}},
    {n:'Metallica – Nothing Else Matters (arpèges)', p:{drive:4,vol:72,bass:2,mid:1,treble:2,comp:30,chorus:0,dtime:330,dfb:22,dmix:14,rev:32}},
    {n:'Jeff Buckley – Hallelujah', p:{drive:5,vol:70,bass:0,mid:1,treble:2,comp:30,chorus:18,dtime:300,dfb:20,dmix:0,rev:38}},
    {n:'Funk 70s – Nile Rodgers', p:{drive:4,vol:70,bass:-1,mid:0,treble:4,comp:60,chorus:0,dtime:300,dfb:20,dmix:0,rev:8}},
    {n:'The Cure / années 80', p:{drive:8,vol:70,bass:2,mid:-1,treble:2,comp:30,chorus:70,dtime:340,dfb:30,dmix:16,rev:25}}
  ],
  'Crunch & rock': [
    {n:'AC/DC – Highway to Hell', p:{drive:38,vol:70,bass:1,mid:3,treble:3,comp:5,chorus:0,dtime:300,dfb:20,dmix:0,rev:8}},
    {n:'Rolling Stones – Satisfaction', p:{drive:32,vol:70,bass:0,mid:2,treble:3,comp:10,chorus:0,dtime:300,dfb:20,dmix:0,rev:10}},
    {n:'Led Zeppelin – Whole Lotta Love', p:{drive:46,vol:70,bass:2,mid:4,treble:2,comp:12,chorus:0,dtime:300,dfb:20,dmix:0,rev:14}},
    {n:'Deep Purple – Smoke on the Water', p:{drive:44,vol:70,bass:1,mid:2,treble:1,comp:10,chorus:0,dtime:300,dfb:20,dmix:0,rev:12}},
    {n:'Creedence – Fortunate Son', p:{drive:26,vol:70,bass:1,mid:2,treble:2,comp:8,chorus:0,dtime:300,dfb:20,dmix:0,rev:10}},
    {n:'Oasis – Champagne Supernova', p:{drive:40,vol:70,bass:2,mid:1,treble:1,comp:15,chorus:0,dtime:300,dfb:20,dmix:0,rev:24}},
    {n:'Green Day – Basket Case', p:{drive:66,vol:70,bass:3,mid:-2,treble:2,comp:8,chorus:0,dtime:300,dfb:20,dmix:0,rev:6}},
    {n:'ZZ Top – La Grange', p:{drive:48,vol:70,bass:0,mid:2,treble:2,comp:28,chorus:0,dtime:300,dfb:20,dmix:0,rev:10}},
    {n:'Blues – B.B. King', p:{drive:28,vol:70,bass:0,mid:3,treble:1,comp:20,chorus:0,dtime:300,dfb:20,dmix:0,rev:20}},
    {n:'SRV – Pride and Joy', p:{drive:40,vol:70,bass:1,mid:2,treble:3,comp:18,chorus:0,dtime:300,dfb:20,dmix:0,rev:16}}
  ],
  'Saturé & métal': [
    {n:'Nirvana – Smells Like Teen Spirit (refrain)', p:{drive:74,vol:68,bass:3,mid:-1,treble:2,comp:10,chorus:0,dtime:300,dfb:20,dmix:0,rev:10}},
    {n:'Metallica – Master of Puppets', p:{drive:86,vol:65,bass:4,mid:-6,treble:3,comp:10,chorus:0,dtime:300,dfb:20,dmix:0,rev:6}},
    {n:'Black Sabbath – Paranoid', p:{drive:58,vol:70,bass:2,mid:1,treble:1,comp:12,chorus:0,dtime:300,dfb:20,dmix:0,rev:10}},
    {n:'Iron Maiden – The Trooper', p:{drive:70,vol:68,bass:2,mid:2,treble:2,comp:15,chorus:0,dtime:300,dfb:20,dmix:0,rev:12}},
    {n:'Rammstein – Du Hast', p:{drive:90,vol:64,bass:5,mid:-4,treble:2,comp:10,chorus:0,dtime:300,dfb:20,dmix:0,rev:5}},
    {n:'RATM – Killing in the Name', p:{drive:70,vol:68,bass:2,mid:3,treble:1,comp:12,chorus:0,dtime:300,dfb:20,dmix:0,rev:6}},
    {n:'Muse – Plug in Baby', p:{drive:80,vol:66,bass:2,mid:3,treble:2,comp:20,chorus:12,dtime:300,dfb:20,dmix:0,rev:12}}
  ],
  'Solos légendaires': [
    {n:'Pink Floyd – Comfortably Numb (solo)', p:{drive:56,vol:70,bass:1,mid:3,treble:1,comp:50,chorus:0,dtime:440,dfb:35,dmix:28,rev:34}},
    {n:'Guns N’ Roses – Sweet Child O’ Mine (intro)', p:{drive:60,vol:70,bass:1,mid:4,treble:2,comp:20,chorus:0,dtime:380,dfb:22,dmix:16,rev:18}},
    {n:'Eagles – Hotel California (solo)', p:{drive:50,vol:70,bass:1,mid:2,treble:2,comp:25,chorus:0,dtime:300,dfb:20,dmix:16,rev:18}},
    {n:'Santana – Europa', p:{drive:64,vol:70,bass:1,mid:5,treble:0,comp:45,chorus:0,dtime:360,dfb:25,dmix:15,rev:28}},
    {n:'Hendrix – Purple Haze', p:{drive:76,vol:68,bass:1,mid:3,treble:-1,comp:15,chorus:0,dtime:300,dfb:20,dmix:0,rev:16}}
  ],
  'Sons à effets': [
    {n:'U2 – Where the Streets Have No Name', p:{drive:22,vol:70,bass:0,mid:1,treble:3,comp:40,chorus:0,dtime:350,dfb:45,dmix:42,rev:22}},
    {n:'Pink Floyd – Run Like Hell', p:{drive:30,vol:70,bass:1,mid:0,treble:3,comp:45,chorus:20,dtime:380,dfb:50,dmix:45,rev:20}},
    {n:'Van Halen – Ain\'t Talkin\' \'bout Love (phaser)', p:{drive:62,vol:68,bass:1,mid:3,treble:2,comp:15,chorus:0,dtime:300,dfb:20,dmix:0,rev:14,phaser:70,gate:25}},
    {n:'Hendrix – Voodoo Child (wah)', p:{drive:55,vol:68,bass:1,mid:3,treble:0,comp:15,chorus:0,dtime:300,dfb:20,dmix:0,rev:16,wah:75}},
    {n:'Heart – Barracuda (flanger)', p:{drive:52,vol:70,bass:1,mid:2,treble:2,comp:12,chorus:0,dtime:300,dfb:20,dmix:0,rev:12,flanger:65}},
    {n:'Green Day – Boulevard of Broken Dreams (trémolo)', p:{drive:14,vol:70,bass:1,mid:0,treble:1,comp:30,chorus:0,dtime:300,dfb:20,dmix:0,rev:24,trem:70}},
    {n:'Ambiance planante (shoegaze)', p:{drive:35,vol:68,bass:2,mid:0,treble:0,comp:30,chorus:60,dtime:520,dfb:55,dmix:40,rev:55,flanger:25}},
    {n:'Slap-back rockabilly (Elvis)', p:{drive:22,vol:70,bass:0,mid:1,treble:3,comp:25,chorus:0,dtime:110,dfb:5,dmix:35,rev:14}}
  ]
};
(function(){
  const sel = document.getElementById('presetSel');
  sel.add(new Option('— Choisis un son —', ''));
  for (const [group, list] of Object.entries(SONG_PRESETS)){
    const og = document.createElement('optgroup'); og.label = group;
    list.forEach((pr, i) => og.appendChild(new Option(pr.n, group + '|' + i)));
    sel.appendChild(og);
  }
  sel.addEventListener('change', () => {
    if (!sel.value) return;
    const [group, i] = sel.value.split('|');
    const pr = SONG_PRESETS[group][parseInt(i)];
    // Applique le preset ; les nouvelles pédales absentes du preset reviennent à 0
    for (const k in AMP_MAP){
      const v = (k in pr.p) ? pr.p[k] : (k in AMP_DEFAULTS ? AMP_DEFAULTS[k] : null);
      if (v !== null) document.getElementById(AMP_MAP[k]).value = v;
    }
    // Gros gain sans gate précisé → noise gate automatique (anti-souffle/larsen)
    if (!('gate' in pr.p) && pr.p.drive >= 60) document.getElementById('ampGate').value = 30;
    ampApply();
    document.getElementById('presetDesc').textContent = '🎸 ' + pr.n + ' — ajuste les curseurs à ton oreille.';
  });
})();
try{
  const saved = JSON.parse(localStorage.getItem('cg_amp') || 'null');
  if (saved) for (const k in AMP_MAP) if (saved[k] !== undefined) document.getElementById(AMP_MAP[k]).value = saved[k];
}catch(e){}
Object.values(AMP_MAP).forEach(id => document.getElementById(id).addEventListener('input', ampApply));
document.getElementById('ampToggle').addEventListener('click', () => {
  const btn = document.getElementById('ampToggle');
  const msg = document.getElementById('ampMsg');
  if (!micOn){ msg.textContent = 'Active d’abord le micro (bouton en haut).'; msg.className = 'bigmsg err'; return; }
  if (!amp.on && nam.on) namDeactivate(); // un seul ampli à la fois
  amp.on = !amp.on;
  const t = audioCtx.currentTime;
  amp.master.gain.cancelScheduledValues(t);
  amp.master.gain.setTargetAtTime(amp.on ? 1 : 0, t, 0.05);
  btn.textContent = amp.on ? '🔇 Éteindre l’ampli' : '🔊 Allumer l’ampli';
  btn.classList.toggle('on', amp.on);
  msg.textContent = amp.on ? '🎸 Ampli allumé — joue !' : 'Ampli éteint.';
  msg.className = 'bigmsg' + (amp.on ? ' ok' : '');
});

/* ============================================================
   Ampli neuronal — NAM (Neural Amp Modeler) en WebAssembly
   Moteur : tone-3000/neural-amp-modeler-wasm (MIT). Le module C++
   crée son PROPRE AudioContext + AudioWorklet ; on y branche le micro,
   puis la sortie passe dans une vraie IR de baffle (Celestion/Mesa…).
   Nécessite SharedArrayBuffer → isolation cross-origin (coi-serviceworker).
   ============================================================ */
const nam = { script:false, module:null, ctx:null, node:null, src:null,
              inGain:null, gate:null, cabConv:null, cabWet:null, cabDry:null, vol:null,
              ready:false, on:false, loading:false, gateThr:0.012 };
const NAM_FORCE_NANO = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 1 : 0;

function namSupported(){
  return typeof AudioWorklet !== 'undefined' && typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated === true;
}
function namStatus(txt, cls){
  const el = document.getElementById('namStatus');
  el.textContent = txt;
  el.className = 'chip ' + (cls || '');
}
async function namEnsureScript(){
  if (nam.script) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'nam/t3k-wasm-module.js';
    s.async = true;
    s.onload = res;
    s.onerror = () => rej(new Error('module NAM introuvable'));
    document.body.appendChild(s);
  });
  // Attendre que le runtime Emscripten soit réellement opérationnel
  await new Promise((res, rej) => {
    let n = 0;
    const t = setInterval(() => {
      const M = window.Module;
      if (M && M._malloc && M.stringToUTF8 && M.ccall){
        try{ const p = M._malloc(1); if (p){ M._free(p); clearInterval(t); return res(); } }catch(e){}
      }
      if (++n > 200){ clearInterval(t); rej(new Error('runtime NAM non initialisé')); }
    }, 50);
  });
  nam.module = window.Module;
  nam.script = true;
}
async function namSetDsp(jsonStr){
  const M = nam.module;
  const bytes = new TextEncoder().encode(jsonStr).length + 1;
  const ptr = M._malloc(bytes);
  M.stringToUTF8(jsonStr, ptr, bytes);
  try{
    if (nam.ctx && nam.ctx.state === 'running') await nam.ctx.suspend();
    await M.ccall('setDsp', null, ['number','number'], [ptr, NAM_FORCE_NANO], {async:true});
  } finally { M._free(ptr); }
  if (nam.ctx && nam.ctx.state === 'suspended') nam.ctx.resume().catch(()=>{});
}
function namBuildChain(){
  const c = nam.ctx;
  nam.inGain = c.createGain();
  // Filtres anti-bruit (VRAI filtrage de fréquences, distinct du gate) :
  // passe-haut = enlève le ronflement secteur 50/60 Hz et les rumbles graves
  // (la corde grave Mi est à 82 Hz, donc préservée) ; un petit creux à 60 Hz
  // attaque pile la fréquence du bourdonnement électrique.
  nam.hp = c.createBiquadFilter(); nam.hp.type = 'highpass'; nam.hp.frequency.value = 82; nam.hp.Q.value = 0.7;
  nam.hum = c.createBiquadFilter(); nam.hum.type = 'notch'; nam.hum.frequency.value = 60; nam.hum.Q.value = 6;
  nam.gate = c.createGain();
  nam.cabConv = c.createConvolver(); nam.cabConv.normalize = true;
  nam.cabWet = c.createGain(); nam.cabDry = c.createGain();
  nam.vol = c.createGain(); nam.vol.gain.value = 0;
  nam.vol.channelCount = 1; nam.vol.channelCountMode = 'explicit'; // mono centré
  const merge = c.createGain();
  nam.inGain.connect(nam.hp); nam.hp.connect(nam.hum); nam.hum.connect(nam.gate); nam.gate.connect(nam.node);
  nam.node.connect(nam.cabDry); nam.cabDry.connect(merge);
  nam.node.connect(nam.cabConv); nam.cabConv.connect(nam.cabWet); nam.cabWet.connect(merge);
  merge.connect(nam.vol); nam.vol.connect(c.destination);
}
function namConnectInput(){
  if (!micStream || !nam.ctx) return;
  try{ if (nam.src) nam.src.disconnect(); }catch(e){}
  nam.src = nam.ctx.createMediaStreamSource(micStream);
  nam.src.connect(nam.inGain);
}
async function namLoadCab(url){
  if (!nam.cabConv) return;
  if (!url){ nam.cabWet.gain.value = 0; nam.cabDry.gain.value = 1; return; }
  const ab = await (await fetch(url)).arrayBuffer();
  nam.cabConv.buffer = await nam.ctx.decodeAudioData(ab);
  nam.cabWet.gain.value = 1; nam.cabDry.gain.value = 0;
}
function namApply(){
  // Le seuil du gate est lu même sans chaîne construite (utilisé par processFrame).
  // Plage volontairement DOUCE (max ~0.019) pour ne pas couper la guitare.
  const g = parseFloat(document.getElementById('namGate').value);
  nam.gateThr = g > 0 ? 0.003 + (g/100)*0.016 : 0;
  if (!nam.vol) return;
  if (nam.gateThr === 0) nam.gate.gain.value = 1; // gate coupé → toujours ouvert
  nam.vol.gain.value = nam.on ? (parseFloat(document.getElementById('namVol').value)/100)*1.2 : 0;
  nam.inGain.gain.value = 0.2 + (parseFloat(document.getElementById('namIn').value)/100)*3;
}
async function namActivate(jsonOverride, label){
  if (nam.loading) return;
  if (!micOn){ namStatus('active d\'abord le micro', 'err'); return; }
  if (!namSupported()){
    namStatus(window.crossOriginIsolated === false ? 'recharge la page puis réessaie' : 'navigateur non compatible', 'err');
    return;
  }
  nam.loading = true;
  namStatus('chargement…', 'now');
  try{
    if (!nam.ready){
      const readyP = new Promise(res => {
        window.wasmAudioWorkletCreated = (node, ctx2) => {
          nam.node = node; nam.ctx = ctx2;
          namBuildChain();
          res();
        };
      });
      await namEnsureScript();
      const json = jsonOverride || await (await fetch(document.getElementById('namModel').value)).text();
      await namSetDsp(json);
      await readyP;
      namConnectInput();
      await namLoadCab(document.getElementById('namCab').value);
      nam.ready = true;
    } else if (jsonOverride){
      await namSetDsp(jsonOverride);
    }
    // un seul ampli à la fois : on coupe le pédalier classique
    if (amp && amp.on){
      amp.on = false; amp.master.gain.value = 0;
      const b = document.getElementById('ampToggle');
      b.textContent = '🔊 Allumer l\'ampli'; b.classList.remove('on');
    }
    nam.on = true;
    nam.ctx.resume().catch(()=>{});
    // le démarrage du contexte NAM peut interrompre le nôtre (analyse) sur iOS
    setTimeout(() => { if (audioCtx && audioCtx.state !== 'running') audioCtx.resume().catch(()=>{}); }, 400);
    namApply();
    const btn = document.getElementById('namToggle');
    btn.textContent = '🔇 Éteindre l\'ampli neuronal'; btn.classList.add('on');
    namStatus(label || document.getElementById('namModel').selectedOptions[0].text.split('—')[0].trim(), 'ok');
  }catch(e){
    console.error('NAM:', e);
    namStatus('erreur : ' + e.message, 'err');
  }
  nam.loading = false;
}
function namDeactivate(){
  nam.on = false;
  if (nam.vol) nam.vol.gain.value = 0;
  const btn = document.getElementById('namToggle');
  btn.textContent = '🧠 Activer l\'ampli neuronal'; btn.classList.remove('on');
  namStatus('inactif');
}
document.getElementById('namToggle').addEventListener('click', () => {
  if (nam.on) namDeactivate(); else namActivate();
});
document.getElementById('namModel').addEventListener('change', async () => {
  if (!nam.ready || nam.loading) return;
  nam.loading = true;
  namStatus('chargement…', 'now');
  try{
    const json = await (await fetch(document.getElementById('namModel').value)).text();
    await namSetDsp(json);
    namStatus(document.getElementById('namModel').selectedOptions[0].text.split('—')[0].trim(), nam.on ? 'ok' : '');
  }catch(e){ namStatus('erreur : ' + e.message, 'err'); }
  nam.loading = false;
});
document.getElementById('namCab').addEventListener('change', () => {
  if (nam.ready) namLoadCab(document.getElementById('namCab').value).catch(e => namStatus('erreur baffle', 'err'));
});
['namVol','namIn','namGate'].forEach(id => document.getElementById(id).addEventListener('input', namApply));
// Calibrage auto : mesure le bruit de fond réel (ne pas jouer) et règle le
// gate juste au-dessus — s'adapte à TON matériel plutôt que de deviner.
async function namCalibrateGate(){
  if (!micOn){ namStatus('active d\'abord le micro', 'err'); return; }
  namStatus('mesure du bruit… NE JOUE PAS (2 s)', 'now');
  let peak = 0;
  const t0 = performance.now();
  await new Promise(res => {
    const iv = setInterval(() => {
      peak = Math.max(peak, lastMicRms);
      if (performance.now() - t0 > 2000){ clearInterval(iv); res(); }
    }, 30);
  });
  // seuil = bruit mesuré + 40 % de marge, borné pour rester raisonnable
  nam.gateThr = Math.min(0.08, Math.max(0.003, peak * 1.4));
  // reflète approximativement sur le curseur (sans dépasser sa plage douce)
  const g = Math.round(((nam.gateThr - 0.003) / 0.016) * 100);
  document.getElementById('namGate').value = Math.max(3, Math.min(100, g));
  const pct = Math.round(peak * 600);
  namStatus('gate réglé sur ton bruit (' + pct + ' %) ✓', 'ok');
}
document.getElementById('namGateCal').addEventListener('click', namCalibrateGate);
/* Rigs de légende : ampli + baffle + gains préréglés pour les riffs connus */
const NAM_RIGS = [
  {n:'Cachemire – La Veste (guitare isolée & analysée)', m:'ac15', cab:'celestion', vin:48, vol:70},
  {n:'AC/DC – Back in Black', m:'jcm2000-crunch', cab:'celestion', vin:55, vol:70},
  {n:'Guns N’ Roses – Sweet Child O’ Mine', m:'jcm', cab:'celestion', vin:60, vol:70},
  {n:'Nirvana – Smells Like Teen Spirit', m:'jcm2000-crunch', cab:'celestion', vin:72, vol:70},
  {n:'Metallica – Enter Sandman', m:'mesa-mark4', cab:'mesa', vin:65, vol:68},
  {n:'Metallica – Master of Puppets', m:'5150-boost', cab:'mesa', vin:70, vol:66},
  {n:'Slipknot / Machine Head — métal moderne', m:'6505-red', cab:'mesa', vin:70, vol:64},
  {n:'Van Halen – le « brown sound »', m:'5153', cab:'celestion', vin:55, vol:68},
  {n:'Mötley Crüe — hair metal 80s', m:'soldano', cab:'celestion', vin:60, vol:68},
  {n:'Queens of the Stone Age — stoner', m:'orange', cab:'celestion', vin:60, vol:68},
  {n:'Pink Floyd – Comfortably Numb', m:'dumble', cab:'eminence', vin:50, vol:70},
  {n:'Hendrix – Little Wing', m:'twin', cab:'eminence', vin:45, vol:70},
  {n:'Beatles / Queen — brit sixties', m:'ac15', cab:'celestion', vin:50, vol:70},
  {n:'Funk / Nile Rodgers — clean percussif', m:'jc', cab:'', vin:40, vol:70},
  {n:'Jazz — clean feutré', m:'deluxe', cab:'eminence', vin:35, vol:70}
];
(function(){
  const sel = document.getElementById('namRig');
  NAM_RIGS.forEach((r, i) => sel.add(new Option(r.n, String(i))));
  sel.addEventListener('change', async () => {
    if (sel.value === '') return;
    const r = NAM_RIGS[parseInt(sel.value)];
    document.getElementById('namModel').value = 'nam/models/' + r.m + '.nam';
    document.getElementById('namCab').value = r.cab ? 'nam/irs/' + r.cab + '.wav' : '';
    document.getElementById('namIn').value = r.vin;
    document.getElementById('namVol').value = r.vol;
    if (!nam.ready){ namActivate(null, r.n); return; }
    if (nam.loading) return;
    nam.loading = true;
    namStatus('chargement…', 'now');
    try{
      const json = await (await fetch(document.getElementById('namModel').value)).text();
      await namSetDsp(json);
      await namLoadCab(document.getElementById('namCab').value);
      namApply();
      namStatus(r.n, nam.on ? 'ok' : '');
    }catch(e){ namStatus('erreur : ' + e.message, 'err'); }
    nam.loading = false;
  });
})();
document.getElementById('namFileBtn').addEventListener('click', () => document.getElementById('namFile').click());
document.getElementById('namFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  const json = await f.text();
  try{ JSON.parse(json); }catch(err){ namStatus('fichier .nam invalide', 'err'); return; }
  if (nam.ready && !nam.on) nam.on = true;
  await namActivate(json, f.name.replace(/\.nam$/i, ''));
});

/* ---------- Manche de guitare virtuel (SVG) ---------- */
const OPEN_STRINGS = [64,59,55,50,45,40];
const NFRETS = 15;
const INLAYS = [3,5,7,9,12,15];
function Fretboard(container, nfrets = NFRETS){
  const W = 980, H = 230, LEFT = 46, TOP = 26, ROWH = (H-TOP-16)/5;
  const colW = (W-LEFT-10)/(nfrets+1);
  const fx = f => LEFT + f*colW + colW/2;
  const sy = s => TOP + s*ROWH;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width','100%');
  svg.setAttribute('class','fbsvg');
  svg.style.minWidth = '760px';
  const bg = document.createElementNS(NS,'rect');
  bg.setAttribute('x', LEFT+colW); bg.setAttribute('y', TOP-12);
  bg.setAttribute('width', W-LEFT-colW-10); bg.setAttribute('height', 5*ROWH+24);
  bg.setAttribute('fill','#6b4423'); bg.setAttribute('rx','6');
  svg.appendChild(bg);
  for (let f = 1; f <= nfrets+1; f++){
    const l = document.createElementNS(NS,'line');
    const x = LEFT + f*colW;
    l.setAttribute('x1',x); l.setAttribute('x2',x);
    l.setAttribute('y1',TOP-12); l.setAttribute('y2',TOP+5*ROWH+12);
    l.setAttribute('stroke', f===1 ? '#f2ead8' : '#c9b088');
    l.setAttribute('stroke-width', f===1 ? 5 : 2);
    svg.appendChild(l);
  }
  for (const f of INLAYS.filter(x => x <= nfrets)){
    const t = document.createElementNS(NS,'text');
    t.setAttribute('x', fx(f)); t.setAttribute('y', H-2);
    t.setAttribute('fill','#a89b83'); t.setAttribute('font-size','12'); t.setAttribute('text-anchor','middle');
    t.textContent = f;
    svg.appendChild(t);
    const dot = document.createElementNS(NS,'circle');
    dot.setAttribute('cx', fx(f)); dot.setAttribute('cy', TOP+2.5*ROWH);
    dot.setAttribute('r', f===12 ? 0 : 5); dot.setAttribute('fill','#e6d7b4');
    svg.appendChild(dot);
    if (f === 12){
      for (const dy of [-ROWH, ROWH]){
        const d2 = document.createElementNS(NS,'circle');
        d2.setAttribute('cx', fx(12)); d2.setAttribute('cy', TOP+2.5*ROWH+dy);
        d2.setAttribute('r',5); d2.setAttribute('fill','#e6d7b4');
        svg.appendChild(d2);
      }
    }
  }
  for (let s = 0; s < 6; s++){
    const l = document.createElementNS(NS,'line');
    l.setAttribute('x1',LEFT+4); l.setAttribute('x2',W-10);
    l.setAttribute('y1',sy(s)); l.setAttribute('y2',sy(s));
    l.setAttribute('stroke','#8d94a0'); l.setAttribute('stroke-width', 1 + s*0.5);
    svg.appendChild(l);
    const t = document.createElementNS(NS,'text');
    t.setAttribute('x', 6); t.setAttribute('y', sy(s)+4);
    t.setAttribute('fill','#7c705d'); t.setAttribute('font-size','13');
    t.textContent = pcFR(OPEN_STRINGS[s]%12);
    svg.appendChild(t);
  }
  const dots = [];
  for (let s = 0; s < 6; s++){
    dots.push([]);
    for (let f = 0; f <= nfrets; f++){
      const g = document.createElementNS(NS,'g');
      g.setAttribute('class','fb-dot');
      const c = document.createElementNS(NS,'circle');
      c.setAttribute('cx',fx(f)); c.setAttribute('cy',sy(s)); c.setAttribute('r',11);
      const t = document.createElementNS(NS,'text');
      t.setAttribute('x',fx(f)); t.setAttribute('y',sy(s)+4);
      t.setAttribute('fill','#14161c'); t.setAttribute('font-size','10.5');
      t.setAttribute('font-weight','700'); t.setAttribute('text-anchor','middle');
      t.textContent = pcEN((OPEN_STRINGS[s]+f)%12);
      g.appendChild(c); g.appendChild(t);
      svg.appendChild(g);
      dots[s].push(g);
    }
  }
  container.appendChild(svg);
  function each(cb){ for(let s=0;s<6;s++) for(let f=0;f<=nfrets;f++) cb(dots[s][f], OPEN_STRINGS[s]+f); }
  return {
    clear(){ each(d => d.setAttribute('class','fb-dot')); },
    lightMidi(midi, cls='lit'){ each((d,m) => { if (m===midi) d.setAttribute('class','fb-dot show '+cls); }); },
    setPcs(map){
      each((d,m) => {
        const cls = map[m%12];
        d.setAttribute('class', cls ? 'fb-dot show '+cls : 'fb-dot');
      });
    },
    markPc(pc, extra){
      each((d,m) => { if (m%12===pc && d.getAttribute('class').includes('show')) d.setAttribute('class', d.getAttribute('class')+' '+extra); });
    }
  };
}

/* ---------- Métronome ---------- */
let metroTimer = null, metroBeat = 0;
function metroTick(){
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.frequency.value = metroBeat % 4 === 0 ? 2400 : 1900; // hors plage de détection
  g.gain.setValueAtTime(metroBeat % 4 === 0 ? 0.3 : 0.17, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.06);
  const el = document.getElementById('metroBeatEl');
  if (el) el.textContent = 'Temps ' + (metroBeat % 4 + 1);
  metroBeat++;
}
document.getElementById('metroBtn').addEventListener('click', async () => {
  const btn = document.getElementById('metroBtn');
  if (metroTimer){
    clearInterval(metroTimer); metroTimer = null;
    btn.textContent = '▶ Démarrer';
    document.getElementById('metroBeatEl').textContent = 'Temps —';
    return;
  }
  await ensureContext();
  audioCtx.resume().catch(()=>{});
  metroBeat = 0;
  metroTick();
  metroTimer = setInterval(metroTick, 60000/parseInt(document.getElementById('tempo').value));
  btn.textContent = '⏹ Arrêter';
});
document.getElementById('tempo').addEventListener('input', () => {
  const bpm = document.getElementById('tempo').value;
  document.getElementById('tempoVal').textContent = bpm;
  if (metroTimer){ clearInterval(metroTimer); metroTimer = setInterval(metroTick, 60000/parseInt(bpm)); }
});
