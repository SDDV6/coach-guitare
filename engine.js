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
// Analyse à ~90 Hz (toutes les 11 ms) au lieu du rythme d'affichage (60 Hz) :
// la note est confirmée en 11–22 ms au lieu de ~33 ms.
const ANALYSIS_MS = 11, SILENCE_FRAMES = 14;
let diagTick = 0, zeroFrames = 0, rateFixTried = false;

function processFrame(){
  if (!analyser) return;
  analyser.getFloatTimeDomainData(timeBuf);
  const {freq, rms, clarity} = autoCorrelate(timeBuf, audioCtx.sampleRate);
  document.getElementById('micLevelBar').style.width = Math.min(100, rms*600) + '%';
  if (++diagTick % 45 === 0) updateDiag(rms);
  // Garde-fou anti-silence (bug Safari de fréquence d'échantillonnage)
  if (rms === 0 && micHealthy()) zeroFrames++; else zeroFrames = 0;
  if (zeroFrames === 270 && !rateFixTried){
    rateFixTried = true;
    forceRate = (audioCtx.sampleRate === 48000) ? 44100 : 48000;
    restartMic();
  }
  if (freq > 0 && freq >= 70 && freq <= 1500){
    silenceCount = 0;
    const mf = freqToMidiFloat(freq);
    const midi = Math.round(mf);
    const cents = Math.round((mf - midi) * 100);
    emit({type:'pitch', freq, midi, cents});
    if (midi === candMidi) candCount++;
    else { candMidi = midi; candCount = 1; }
    // Détection très nette → on valide dès la 1re trame ; sinon 2 trames
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
}
function emit(ev){ listeners.forEach(fn => { try{ fn(ev); }catch(e){ console.error(e); } }); }

let micStream = null, loopRunning = false;
let sessionInputOverride = null, autoSwitched = false, forceRate = 0;

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
['touchend','click'].forEach(evName => document.addEventListener(evName, () => {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}, {passive:true}));

async function startMic(){
  const pref = localStorage.getItem('cg_input') || 'auto';
  const devId = pref !== 'auto' ? pref : sessionInputOverride;
  try{
    const constraints = { echoCancellation:false, noiseSuppression:false, autoGainControl:false, latency:0 };
    if (devId) constraints.deviceId = { exact: devId };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    micStream = stream;
    const track = stream.getAudioTracks()[0];
    const trackRate = forceRate || ((track.getSettings && track.getSettings().sampleRate) || 0);
    await ensureContext(trackRate || undefined);
    audioCtx.resume().catch(()=>{});
    const src = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    timeBuf = new Float32Array(analyser.fftSize);
    const ampWasOn = amp && amp.on;
    if (amp){ try{ amp.master.disconnect(); }catch(e){} }
    amp = buildAmp(audioCtx, src);
    ampApply();
    if (ampWasOn){ amp.on = true; amp.master.gain.value = 1; }
    track.addEventListener('mute', updateMicUI);
    track.addEventListener('unmute', updateMicUI);
    track.addEventListener('ended', () => { if (micOn) restartMic(); });
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
  const t = micTrack();
  if (!micOn || !t){ el.textContent = 'Micro : inactif.'; return; }
  if (t.muted || t.readyState !== 'live'){ el.textContent = '⚠️ iOS a coupé le micro — appuie sur le bouton micro en haut.'; return; }
  if (audioCtx && audioCtx.state !== 'running'){ el.textContent = '⚠️ Audio en pause — touche l\'écran pour relancer.'; return; }
  const niveau = Math.min(100, Math.round(rms*600));
  const seuil = Math.min(100, Math.round(RMS_THRESHOLD*600));
  el.textContent = `Entrée : ${t.label || 'micro'} @ ${audioCtx.sampleRate} Hz — niveau ${niveau} % / seuil ${seuil} %` +
    (rms >= RMS_THRESHOLD ? ' ✓ son détecté' : ' — sous le seuil');
}
document.getElementById('overlayBtn').addEventListener('click', startMic);
document.getElementById('micBtn').addEventListener('click', () => { if (!micOn) startMic(); else restartMic(); });
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
  cv.width = innerWidth; cv.height = innerHeight;
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
    if (dt > 1.9){ return; }
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

/* ---------- Ampli virtuel ---------- */
let amp = null;
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
  const comp = ctx.createDynamicsCompressor();
  comp.attack.value = 0.005; comp.release.value = 0.12; comp.knee.value = 12;
  const pre = ctx.createGain();
  const shaper = ctx.createWaveShaper(); shaper.oversample = '4x';
  const bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 120;
  const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 650; mid.Q.value = 0.9;
  const treble = ctx.createBiquadFilter(); treble.type = 'highshelf'; treble.frequency.value = 3000;
  const cab = ctx.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = 5200;
  const post = ctx.createGain();
  const chDry = ctx.createGain(); const chWet = ctx.createGain(); const chOut = ctx.createGain();
  const chDelay = ctx.createDelay(0.06); chDelay.delayTime.value = 0.018;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 1.3;
  const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.004;
  lfo.connect(lfoAmt); lfoAmt.connect(chDelay.delayTime); lfo.start();
  const dlDry = ctx.createGain(); const dlWet = ctx.createGain(); const dlOut = ctx.createGain();
  const dl = ctx.createDelay(1.2); dl.delayTime.value = 0.3;
  const dlFb = ctx.createGain(); dlFb.gain.value = 0.25;
  const dlTone = ctx.createBiquadFilter(); dlTone.type = 'lowpass'; dlTone.frequency.value = 2600;
  dl.connect(dlTone); dlTone.connect(dlFb); dlFb.connect(dl);
  const rvDry = ctx.createGain(); const rvWet = ctx.createGain();
  const conv = ctx.createConvolver(); conv.buffer = makeIR(ctx);
  const master = ctx.createGain(); master.gain.value = 0;
  master.channelCount = 1; master.channelCountMode = 'explicit'; // mono centré
  src.connect(input); input.connect(hp); hp.connect(comp); comp.connect(pre);
  pre.connect(shaper); shaper.connect(bass); bass.connect(mid); mid.connect(treble);
  treble.connect(cab); cab.connect(post);
  post.connect(chDry); chDry.connect(chOut);
  post.connect(chDelay); chDelay.connect(chWet); chWet.connect(chOut);
  chOut.connect(dlDry); dlDry.connect(dlOut);
  chOut.connect(dl); dl.connect(dlWet); dlWet.connect(dlOut);
  dlOut.connect(rvDry); rvDry.connect(master);
  dlOut.connect(conv); conv.connect(rvWet); rvWet.connect(master);
  master.connect(ctx.destination);
  return {comp, pre, shaper, bass, mid, treble, post, chDry, chWet, dl, dlFb, dlDry, dlWet, rvDry, rvWet, master, on:false};
}
const AMP_MAP = {drive:'ampDrive', vol:'ampVol', bass:'ampBass', mid:'ampMid', treble:'ampTreble',
                 comp:'ampComp', chorus:'ampChorus', dtime:'ampDTime', dfb:'ampDFb', dmix:'ampDMix', rev:'ampRev'};
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
  amp.shaper.curve = distCurve(drive);
  amp.pre.gain.value = 1 + drive*14;
  amp.post.gain.value = (0.9 - drive*0.5) * (P.vol/100) * 1.8;
  amp.bass.gain.value = P.bass; amp.mid.gain.value = P.mid; amp.treble.gain.value = P.treble;
  const c = P.comp/100;
  amp.comp.threshold.value = -c*40;
  amp.comp.ratio.value = 1 + c*7;
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
    {n:'Ambiance planante (shoegaze)', p:{drive:35,vol:68,bass:2,mid:0,treble:0,comp:30,chorus:60,dtime:520,dfb:55,dmix:40,rev:55}},
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
    for (const k in pr.p) document.getElementById(AMP_MAP[k]).value = pr.p[k];
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
  amp.on = !amp.on;
  const t = audioCtx.currentTime;
  amp.master.gain.cancelScheduledValues(t);
  amp.master.gain.setTargetAtTime(amp.on ? 1 : 0, t, 0.05);
  btn.textContent = amp.on ? '🔇 Éteindre l’ampli' : '🔊 Allumer l’ampli';
  btn.classList.toggle('on', amp.on);
  msg.textContent = amp.on ? '🎸 Ampli allumé — joue !' : 'Ampli éteint.';
  msg.className = 'bigmsg' + (amp.on ? ' ok' : '');
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
