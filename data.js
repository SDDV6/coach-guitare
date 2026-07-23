"use strict";
/* ============================================================
   DATA — théorie, parcours 20 chapitres (harmonie appliquée jazz),
   jeux, badges, schémas SVG. Sources : dictionnaire d'accords jazz
   (shell/drop 2/drop 3/extensions), guide jazz (ii-V-I, blues),
   Open Music Theory (harmonie), Ericsson 1993 (pratique délibérée).
   ============================================================ */

const SCALES = {
  maj:   {name:'Majeure', iv:[0,2,4,5,7,9,11]},
  min:   {name:'Mineure naturelle', iv:[0,2,3,5,7,8,10]},
  pmin:  {name:'Pentatonique mineure', iv:[0,3,5,7,10]},
  pmaj:  {name:'Pentatonique majeure', iv:[0,2,4,7,9]},
  blues: {name:'Blues', iv:[0,3,5,6,7,10]},
  dor:   {name:'Dorien', iv:[0,2,3,5,7,9,10]},
  mixo:  {name:'Mixolydien', iv:[0,2,4,5,7,9,10]}
};
const CHORDS = {
  'Majeur':        {iv:[0,4,7],    deg:['root','third','fifth']},
  'Mineur':        {iv:[0,3,7],    deg:['root','third','fifth']},
  'Sus2':          {iv:[0,2,7],    deg:['root','seventh','fifth']},
  'Sus4':          {iv:[0,5,7],    deg:['root','seventh','fifth']},
  '7 (dominante)': {iv:[0,4,7,10], deg:['root','third','fifth','seventh']},
  'Majeur 7':      {iv:[0,4,7,11], deg:['root','third','fifth','seventh']},
  'Mineur 7':      {iv:[0,3,7,10], deg:['root','third','fifth','seventh']}
};
const INTERVALS = [
  {n:'seconde mineure', s:1}, {n:'seconde majeure', s:2}, {n:'tierce mineure', s:3},
  {n:'tierce majeure', s:4}, {n:'quarte', s:5}, {n:'quinte', s:7},
  {n:'sixte majeure', s:9}, {n:'septième mineure', s:10}, {n:'octave', s:12}
];
const DEGREE_NAMES = ['I','II','III','IV','V','VI','VII'];
const QUIZ_STRINGS = [
  {name:'Mi grave', midi:40}, {name:'La', midi:45}, {name:'Ré', midi:50},
  {name:'Sol', midi:55}, {name:'Si', midi:59}, {name:'Mi aigu', midi:64}
];
const STRING_LABELS = ['Mi grave (6)','La (5)','Ré (4)','Sol (3)','Si (2)','Mi aigu (1)'];
const rnd = a => a[Math.floor(Math.random()*a.length)];
const rint = n => Math.floor(Math.random()*n);

/* ============ Bibliothèque de formes d'accords (diagrammes) ============
   f = frettes corde grave → aiguë ('x' = étouffée), root = pc de la fondamentale */
const SHAPES = [
  {n:'Do majeur',   f:'x32010', root:0},
  {n:'La mineur',   f:'x02210', root:9},
  {n:'Mi majeur',   f:'022100', root:4},
  {n:'Sol 7',       f:'320001', root:7},
  {n:'Ré mineur 7', f:'xx0211', root:2},
  {n:'La 7',        f:'x02020', root:9},
  {n:'Shell Sol 7 (1-7-3)',     f:'3x34xx', root:7,  shell:true},
  {n:'Shell Do maj7 (1-7-3)',   f:'8x99xx', root:0,  shell:true},
  {n:'Shell Ré m7 (1-7-3)',     f:'x5x56x', root:2,  shell:true},
  {n:'Drop 2 – Do maj7',        f:'x3545x', root:0,  drop:2},
  {n:'Drop 2 – Sol 7',          f:'x'+'x5453'.slice(0,0)+'x5453', root:7, drop:2},
  {n:'Drop 3 – Do maj7',        f:'8x998x', root:0,  drop:3},
  {n:'Drop 3 – Sol 7',          f:'3x343x', root:7,  drop:3}
];
// corrige la forme Drop 2 Sol 7 (construction ci-dessus illisible)
SHAPES[10].f = 'x5453x';
const OPEN_MIDI = [40,45,50,55,59,64];
function shapeNotes(sh){ // [{s, fret, midi, pc, ivl}] pour chaque corde jouée
  const out = [];
  for (let s = 0; s < 6; s++){
    const c = sh.f[s];
    if (c === 'x') continue;
    const fret = parseInt(c, 36); // 0-9 + a=10…
    const midi = OPEN_MIDI[s] + fret;
    out.push({s, fret, midi, pc: midi%12, ivl: ((midi - sh.root)%12+12)%12});
  }
  return out;
}
const IVL_SHORT = {0:'R',2:'9',3:'♭3',4:'3',5:'11',7:'5',9:'13',10:'♭7',11:'7'};

/* ============ Schémas SVG ============ */
const DG = {};
// Diagramme d'accord vertical (comme dans le dictionnaire jazz)
DG.chordbox = function(sh, showIvl){
  const notes = shapeNotes(sh);
  const frets = notes.map(n => n.fret).filter(f => f > 0);
  const base = Math.max(1, Math.min(...(frets.length ? frets : [1])));
  const top = base > 3 ? base : 1;
  const W = 190, H = 210, L = 30, T = 44, cw = (W-60)/5, rh = (H-T-24)/4;
  let out = `<rect x="${L}" y="${T}" width="${cw*5}" height="${rh*4}" fill="none" stroke="#8a7d66"/>`;
  for (let i = 1; i < 5; i++){
    out += `<line x1="${L+i*cw}" y1="${T}" x2="${L+i*cw}" y2="${T+rh*4}" stroke="#8a7d66"/>`;
    out += `<line x1="${L}" y1="${T+i*rh}" x2="${L+cw*5}" y2="${T+i*rh}" stroke="#8a7d66"/>`;
  }
  if (top === 1) out += `<rect x="${L-2}" y="${T-5}" width="${cw*5+4}" height="6" rx="2" fill="#8a7d66"/>`;
  else out += `<text x="${L+cw*5+8}" y="${T+rh*0.65}" font-size="13" fill="#7c705d">${top}</text>`;
  for (let s = 0; s < 6; s++){
    const x = L + s*cw;
    const c = sh.f[s];
    if (c === 'x') out += `<text x="${x}" y="${T-12}" text-anchor="middle" font-size="14" fill="#f87171">✕</text>`;
    else if (c === '0') out += `<circle cx="${x}" cy="${T-16}" r="6" fill="none" stroke="#7c705d" stroke-width="1.6"/>`;
  }
  notes.filter(n => n.fret > 0).forEach(n => {
    const x = L + n.s*cw, y = T + (n.fret - top + 0.5)*rh;
    const isR = n.ivl === 0;
    out += `<circle cx="${x}" cy="${y}" r="11" fill="${isR ? '#f6a92c' : '#5ba7f7'}"/>`;
    if (showIvl) out += `<text x="${x}" y="${y+4}" text-anchor="middle" font-size="10" font-weight="700" fill="#14161c">${IVL_SHORT[n.ivl]||''}</text>`;
  });
  notes.filter(n => n.fret === 0 && showIvl).forEach(n => {
    out += `<text x="${L+n.s*cw}" y="${T+rh*4+16}" text-anchor="middle" font-size="10" fill="#7c705d">${IVL_SHORT[n.ivl]||''}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="max-width:190px">${out}</svg>`;
};
DG.formula = function(){
  const steps = [2,2,1,2,2,2,1], labels = ['Do','Ré','Mi','Fa','Sol','La','Si','Do'];
  let x = 20, y = 150, out = '';
  for (let i = 0; i < 8; i++){
    out += `<rect x="${x}" y="${y-28}" width="44" height="28" rx="6" fill="${i===0||i===7?'#f6a92c':'#5ba7f7'}"/>` +
           `<text x="${x+22}" y="${y-9}" text-anchor="middle" font-size="13" font-weight="700" fill="#14161c">${labels[i]}</text>`;
    if (i < 7){
      out += `<text x="${x+58}" y="${y-38}" text-anchor="middle" font-size="11" fill="${steps[i]===1?'#f97362':'#7c705d'}" font-weight="600">${steps[i]===1?'½ ton':'1 ton'}</text>`;
      x += 50; y -= steps[i]*14;
    }
  }
  return `<svg viewBox="0 0 420 170" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
};
DG.intervals = function(){
  const rows = [[12,'Octave','#a78bfa'],[7,'Quinte','#5ba7f7'],[5,'Quarte','#4ade80'],[4,'Tierce maj.','#f6a92c'],[3,'Tierce min.','#f97362'],[2,'Seconde','#7c705d']];
  let out = '';
  rows.forEach(([s,n,c],i) => {
    const y = 18 + i*26, w = s*24;
    out += `<rect x="90" y="${y}" width="${w}" height="16" rx="8" fill="${c}"/>` +
           `<text x="84" y="${y+12}" text-anchor="end" font-size="11" fill="#7c705d">${n}</text>` +
           `<text x="${96+w}" y="${y+12}" font-size="11" fill="#2b2317" font-weight="600">${s} cases</text>`;
  });
  return `<svg viewBox="0 0 420 180" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
};
DG.triad = function(){
  return `<svg viewBox="0 0 420 200" xmlns="http://www.w3.org/2000/svg">
    <rect x="120" y="140" width="180" height="40" rx="9" fill="#f6a92c"/>
    <text x="210" y="165" text-anchor="middle" font-size="14" font-weight="700" fill="#14161c">Fondamentale (1)</text>
    <rect x="120" y="82" width="180" height="40" rx="9" fill="#4ade80"/>
    <text x="210" y="107" text-anchor="middle" font-size="14" font-weight="700" fill="#14161c">Tierce (3)</text>
    <rect x="120" y="24" width="180" height="40" rx="9" fill="#a78bfa"/>
    <text x="210" y="49" text-anchor="middle" font-size="14" font-weight="700" fill="#14161c">Quinte (5)</text>
    <text x="330" y="135" font-size="11" fill="#7c705d">majeur : +4 cases</text>
    <text x="330" y="150" font-size="11" fill="#7c705d">mineur : +3 cases</text>
    <text x="330" y="77" font-size="11" fill="#7c705d">majeur : +3 cases</text>
    <text x="330" y="92" font-size="11" fill="#7c705d">mineur : +4 cases</text>
  </svg>`;
};
DG.circle = function(){
  const notes = ['Do','Sol','Ré','La','Mi','Si','Fa#','Do#','Sol#','Ré#','La#','Fa'];
  let out = '';
  for (let i = 0; i < 12; i++){
    const a = i*Math.PI/6 - Math.PI/2;
    const x = 160 + Math.cos(a)*118, y = 140 + Math.sin(a)*118;
    out += `<circle cx="${x}" cy="${y}" r="22" fill="${i===0?'#f6a92c':'#ffffff'}" stroke="${i===0?'#f6a92c':'#d9cdb6'}" stroke-width="2"/>` +
           `<text x="${x}" y="${y+5}" text-anchor="middle" font-size="13" font-weight="700" fill="${i===0?'#14161c':'#2b2317'}">${notes[i]}</text>`;
  }
  out += `<text x="160" y="132" text-anchor="middle" font-size="12" fill="#7c705d">sens horaire :</text>
          <text x="160" y="150" text-anchor="middle" font-size="12" fill="#f6a92c" font-weight="700">+ une quinte</text>`;
  return `<svg viewBox="0 0 320 285" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
};
DG.degrees = function(){
  const items = [['I','Maj','#f6a92c'],['ii','min','#5ba7f7'],['iii','min','#5ba7f7'],['IV','Maj','#f6a92c'],['V','Maj','#f97362'],['vi','min','#a78bfa'],['vii°','dim','#8a7d66']];
  let out = '';
  items.forEach(([d,q,c],i) => {
    const x = 12 + i*58;
    out += `<rect x="${x}" y="30" width="50" height="56" rx="10" fill="#ffffff" stroke="${c}" stroke-width="2"/>` +
           `<text x="${x+25}" y="55" text-anchor="middle" font-size="16" font-weight="700" fill="${c}">${d}</text>` +
           `<text x="${x+25}" y="74" text-anchor="middle" font-size="11" fill="#7c705d">${q}</text>`;
  });
  out += `<text x="215" y="16" text-anchor="middle" font-size="12" fill="#7c705d">Les 7 accords « compatibles » d'une tonalité majeure</text>`;
  return `<svg viewBox="0 0 430 100" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
};
DG.rhythm = function(){
  const rows = [['Ronde','4 temps',1],['Blanche','2 temps',2],['Noire','1 temps',4],['Croche','½ temps',8]];
  let out = '';
  rows.forEach(([n,d,count],r) => {
    const y = 26 + r*40;
    out += `<text x="10" y="${y+5}" font-size="12" fill="#7c705d">${n}</text><text x="360" y="${y+5}" font-size="11" fill="#8a7d66">${d}</text>`;
    for (let i = 0; i < count; i++){
      const x = 110 + i*(232/count);
      const filled = r >= 2;
      out += `<ellipse cx="${x}" cy="${y}" rx="8" ry="6" fill="${filled?'#f6a92c':'none'}" stroke="#f6a92c" stroke-width="2"/>`;
      if (r >= 1) out += `<line x1="${x+8}" y1="${y}" x2="${x+8}" y2="${y-22}" stroke="#f6a92c" stroke-width="2"/>`;
      if (r === 3) out += `<path d="M ${x+8} ${y-22} q 10 4 8 14" stroke="#f6a92c" stroke-width="2" fill="none"/>`;
    }
  });
  return `<svg viewBox="0 0 430 180" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
};
// Voice leading ii-V-I : les voix bougent au minimum
DG.voicelead = function(){
  const chords = [['Rém7',['Do (7e)','La','Fa','Ré']],['Sol7',['Si (3ce)','La? non : Sol','Fa (7e)','Ré']],['Domaj7',['Si (7e)','Sol','Mi (3ce)','Do']]];
  let out = '';
  const cols = [70, 210, 350];
  const rows = [[ 'Do','Si','Si' ], ['Fa','Fa','Mi'], ['Ré','Ré','Do'], ['La','Sol','Sol']];
  ['Rém7','Sol7','Domaj7'].forEach((n,c) => {
    out += `<text x="${cols[c]}" y="24" text-anchor="middle" font-size="15" font-weight="700" fill="#f6a92c">${n}</text>`;
  });
  rows.forEach((r, ri) => {
    const y = 60 + ri*38;
    r.forEach((note, c) => {
      const moved = c > 0 && r[c] !== r[c-1];
      out += `<circle cx="${cols[c]}" cy="${y}" r="17" fill="${moved?'#f97362':'#ffffff'}" stroke="${moved?'#f97362':'#d9cdb6'}" stroke-width="2"/>` +
             `<text x="${cols[c]}" y="${y+5}" text-anchor="middle" font-size="12" font-weight="700" fill="${moved?'#14161c':'#2b2317'}">${note}</text>`;
      if (c > 0) out += `<line x1="${cols[c-1]+20}" y1="${y}" x2="${cols[c]-20}" y2="${y}" stroke="#8a7d66" stroke-width="1.4" stroke-dasharray="${moved?'0':'4 4'}"/>`;
    });
  });
  out += `<text x="210" y="218" text-anchor="middle" font-size="11" fill="#7c705d">En rouge : les seules notes qui bougent (d'un demi-ton !)</text>`;
  return `<svg viewBox="0 0 420 230" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
};

/* ============ Le Parcours — 20 chapitres ============ */
const PATH = [
 {id:'discover', icon:'🌱', name:'Découverte',
  desc:'Les 12 notes, le manche, et la bonne façon de pratiquer.',
  lessons:[
   {t:'Les 12 notes', x:`Il n'existe que <b>12 notes</b>, en boucle : Do, Do#, Ré, Ré#, Mi, Fa, Fa#, Sol, Sol#, La, La#, Si. Piège : entre <b>Mi et Fa</b> et entre <b>Si et Do</b>, pas de dièse. Sur la guitare, <b>1 case = 1 demi-ton</b>, et à la case 12 tout recommence une octave plus haut.`, try:'findNote'},
   {t:'Pratiquer comme un pro (Ericsson)', x:`La recherche sur l'expertise (Ericsson, 1993) est formelle : ce n'est pas le temps qui compte, c'est la <b>pratique délibérée</b> — un objectif précis, un <b>retour immédiat</b> sur chaque essai, et travailler juste au bord de tes capacités. C'est exactement ce que fait cette app : chaque exercice a un but, le micro te corrige instantanément, et la difficulté s'adapte. <b>15 minutes concentrées valent mieux qu'une heure distraite.</b>`},
   {t:'Les positions', x:`Une « <b>position</b> », c'est la case où joue ton index : en 5e position, l'index gère la case 5, les autres doigts les cases 6, 7 et 8. C'est comme ça qu'on s'organise sur le manche.`, try:'reverseQuiz'}
  ],
  games:['findNote','reverseQuiz'], badge:{icon:'🌱', name:'Premier pas'}},

 {id:'diagrams', icon:'🗂️', name:'Lecture des diagrammes',
  desc:'Lire n\'importe quelle grille d\'accord en 3 secondes.',
  lessons:[
   {t:'Anatomie d\'un diagramme', x:`Un diagramme se lit <b>vertical</b> : les 6 lignes verticales sont les cordes (Mi grave à gauche), les lignes horizontales les frettes. Un <b>point</b> = pose ton doigt là. En haut : <b>✕ = corde étouffée</b> (on ne la joue pas), <b>○ = corde à vide</b> (on la joue sans doigt). Un chiffre à droite indique la frette de départ quand on joue haut sur le manche.`, sh:'Do majeur', try:'readDiagram'},
   {t:'Repérer la fondamentale', x:`Dans nos diagrammes, la <b>fondamentale est en orange</b> (les autres notes en bleu). C'est LA note à repérer en premier : elle donne le nom de l'accord et te permet de <b>déplacer la forme</b> — la même forme 2 cases plus haut = un accord 1 ton plus haut.`, sh:'Shell Sol 7 (1-7-3)', try:'readDiagram'}
  ],
  games:['readDiagram'], badge:{icon:'🗂️', name:'Lecteur de grilles'}},

 {id:'fingerstyle', icon:'🤚', name:'Fingerstyle',
  desc:'La main droite : pouce, index, majeur, annulaire.',
  lessons:[
   {t:'P-I-M-A', x:`Le code universel de la main droite : <b>P</b> = pouce (cordes graves 6-5-4), <b>I</b> = index (corde de Sol), <b>M</b> = majeur (corde de Si), <b>A</b> = annulaire (Mi aigu). Chaque doigt a « sa » corde : la main ne bouge presque pas, seuls les doigts travaillent.`, try:'pimaQuiz'},
   {t:'Ton premier arpège', x:`Un accord joué note par note = un <b>arpège</b>. Pose un accord de la main gauche, puis égrène : pouce (basse), puis I-M-A du grave vers l'aigu. C'est la base de milliers de ballades — et le meilleur exercice de synchronisation des deux mains.`, try:'arpegeChord'}
  ],
  games:['pimaQuiz','arpegeChord'], badge:{icon:'🤚', name:'Doigts d\'or'}},

 {id:'fretboard', icon:'🧭', name:'Notes du manche',
  desc:'Trouver n\'importe quelle note, sur n\'importe quelle corde.',
  lessons:[
   {t:'Cordes à vide', x:`De la plus grosse à la plus fine : <b>Mi, La, Ré, Sol, Si, Mi</b>. Chaque corde à vide est ton point de départ pour compter les cases. Les repères du manche : cases 3, 5, 7, 9 et 12.`, try:'findNote'},
   {t:'L\'octave miroir', x:`La même note existe à <b>plusieurs endroits</b>. Astuce : +2 cordes et +2 cases (depuis les graves) = la même note à l'octave. C'est le principe des formes <b>CAGED</b> : cinq formes d'accords qui pavent tout le manche.`, try:'octaves'}
  ],
  games:['findNote','reverseQuiz','octaves','speedNotes'], badge:{icon:'🧭', name:'Cartographe'}},

 {id:'intervals', icon:'📏', name:'Intervalles',
  desc:'La distance entre deux notes : le vocabulaire de toute la musique.',
  lessons:[
   {t:'Compter en cases', x:`Un intervalle = une <b>distance en demi-tons</b>. Les stars : tierce mineure = <b>3</b>, tierce majeure = <b>4</b>, quarte = <b>5</b>, quinte = <b>7</b>, septième mineure = <b>10</b>, octave = <b>12</b>. Tout le reste du parcours est bâti sur eux.`, dg:'intervals', try:'buildInterval'},
   {t:'La couleur des tierces', x:`La tierce donne l'émotion : <b>majeure (4) = joyeux</b>, <b>mineure (3) = mélancolique</b>. Ton oreille les connaît déjà — mets-leur un nom.`, try:'earInterval'}
  ],
  games:['buildInterval','semitones','earInterval'], badge:{icon:'📏', name:'Arpenteur'}},

 {id:'chordconst', icon:'🧱', name:'Construction des accords',
  desc:'La formule chiffrée : 1-3-5, et tout devient lisible.',
  lessons:[
   {t:'Empiler des tierces', x:`Tous les accords se construisent en <b>empilant des tierces</b> sur une fondamentale. On note les membres par leur degré : <b>1</b> (fondamentale), <b>3</b> (tierce), <b>5</b> (quinte), puis 7, 9, 11, 13. « Do majeur = 1-3-5 » : cette écriture chiffrée est le langage de toute l'harmonie.`, dg:'triad', try:'chordTones'},
   {t:'Suspendre la tierce', x:`Remplace la tierce par la seconde (<b>sus2</b>) ou la quarte (<b>sus4</b>) : l'accord devient « suspendu », ni majeur ni mineur — une tension qui appelle sa résolution.`, try:'buildChord_sus'}
  ],
  games:['chordTones','buildChord_sus','semitones'], badge:{icon:'🧱', name:'Bâtisseur'}},

 {id:'triads', icon:'🔺', name:'Triades',
  desc:'3 notes qui font un accord : majeur, mineur, et leurs sons.',
  lessons:[
   {t:'Majeur ou mineur ?', x:`La triade <b>majeure</b> = 1 + tierce majeure (4 cases) + quinte. La <b>mineure</b> = 1 + tierce mineure (3 cases) + quinte. Seule la tierce change — et toute l'émotion avec elle.`, try:'buildChord_triad'},
   {t:'Accord vs arpège', x:`Les 3 notes ensemble = un <b>accord</b> ; l'une après l'autre = un <b>arpège</b>. Quand tu grattes 6 cordes, tu joues ces 3 notes doublées à plusieurs octaves — rien de plus.`, try:'earMajMin'}
  ],
  games:['buildChord_triad','earMajMin','findThird','findRoot'], badge:{icon:'🔺', name:'Architecte'}},

 {id:'chords7', icon:'7️⃣', name:'Accords 7',
  desc:'La 4e note : le son du blues, du jazz et de la soul.',
  lessons:[
   {t:'Quatre couleurs', x:`Empile une tierce de plus : <b>1-3-5-7</b>. Les 4 familles à connaître d'oreille : <b>maj7</b> (doux, jazzy), <b>m7</b> (soul), <b>7 « dominante »</b> (bluesy, instable — il <i>pousse</i> vers l'accord suivant), <b>m7♭5</b> (tendu, rare).`, try:'buildChord_7'},
   {t:'Le moteur V7 → I', x:`L'accord 7 de dominante contient un <b>triton</b> (3 tons entre sa tierce et sa 7e) : c'est cette tension qui « tire » vers l'accord de repos. Tout le blues et tout le jazz roulent sur ce moteur.`, try:'seventhQuiz'}
  ],
  games:['buildChord_7','seventhQuiz','blues'], badge:{icon:'7️⃣', name:'Bluesman'}},

 {id:'shell', icon:'🐚', name:'Shell Chords',
  desc:'3 notes suffisent pour sonner jazz : 1, 3 et 7.',
  lessons:[
   {t:'Le squelette de l\'accord', x:`Le secret des guitaristes de jazz : on peut <b>supprimer la quinte</b> (elle n'apporte pas de couleur) et ne garder que <b>1-3-7</b> — la fondamentale (le nom), la tierce (majeur/mineur) et la 7e (la couleur). C'est le <b>shell chord</b>, aussi appelé « guide tones ». Petit, mobile, et il sonne immédiatement pro.`, sh:'Shell Sol 7 (1-7-3)', try:'shellQuiz'},
   {t:'Deux formes à tout faire', x:`Deux gabarits couvrent tous les accords : fondamentale sur corde de <b>Mi grave</b> (7e sur Ré, tierce sur Sol) ou sur corde de <b>La</b>. Apprends ces deux formes, déplace-les : tu peux accompagner n'importe quel morceau de jazz.`, sh:'Shell Ré m7 (1-7-3)', try:'shellBuild'}
  ],
  games:['shellBuild','shellQuiz','cadence251'], badge:{icon:'🐚', name:'Minimaliste'}},

 {id:'extensions', icon:'✨', name:'Extensions',
  desc:'9, 11, 13 : les étages supérieurs de l\'accord.',
  lessons:[
   {t:'Continuer d\'empiler', x:`Après la 7e, on continue les tierces : <b>9</b> (= la 2de à l'octave), <b>11</b> (= la 4te), <b>13</b> (= la 6te). Ce sont les « épices » : Cmaj9, G13… L'accord garde sa fonction, il gagne en couleur.`, try:'extQuiz'},
   {t:'Les notes à éviter', x:`Toutes les extensions ne vont pas partout : la <b>11 juste frotte</b> contre la tierce d'un accord majeur (on la met en #11), et la <b>♭9 n'a sa place que sur la dominante</b>. Règle pratique : 9 et 13 presque toujours OK ; 11 → accords mineurs.`, try:'extEar'}
  ],
  games:['extQuiz','extEar'], badge:{icon:'✨', name:'Coloriste'}},

 {id:'subs', icon:'🔀', name:'Substitutions',
  desc:'Remplacer un accord par un cousin qui fait le même travail.',
  lessons:[
   {t:'Les cousins diatoniques', x:`Deux accords qui partagent 2 notes peuvent s'échanger : <b>I ↔ vi</b> (Do ↔ Lam), <b>I ↔ iii</b>, <b>IV ↔ ii</b>. C'est la substitution diatonique — le premier outil pour varier un accompagnement sans changer la chanson.`, try:'subQuiz'},
   {t:'La substitution tritonique', x:`La botte secrète du jazz : tout accord <b>7</b> peut être remplacé par le 7 situé à un <b>triton</b> (6 cases) — Sol7 ↔ Ré♭7. Pourquoi ça marche : ils partagent les mêmes notes de tension (3 et 7 inversées !). Résultat : une basse qui descend en chromatique.`, try:'subQuiz'}
  ],
  games:['subQuiz','reharmQuiz'], badge:{icon:'🔀', name:'Illusionniste'}},

 {id:'voicelead', icon:'🎢', name:'Voice Leading',
  desc:'L\'art de passer d\'un accord à l\'autre sans sauter.',
  lessons:[
   {t:'Le principe du moindre effort', x:`Chaque note d'un accord est une <b>voix</b>. Le voice leading, c'est déplacer chaque voix <b>le moins possible</b> vers l'accord suivant : garder les notes communes, bouger le reste d'une case. À l'oreille, tout devient fluide ; sous les doigts, tout devient facile.`, dg:'voicelead', try:'vlQuiz'},
   {t:'La magie du ii-V-I', x:`Dans Rém7 → Sol7 → Domaj7 : la <b>7e de chaque accord descend d'un demi-ton vers la tierce du suivant</b> (Do→Si, Fa→Mi). Deux demi-tons, et toute la progression s'enchaîne. C'est LE geste du jazz.`, try:'vlPlay'}
  ],
  games:['vlQuiz','vlPlay','inversionQuiz'], badge:{icon:'🎢', name:'Chef de voix'}},

 {id:'drop2', icon:'2️⃣', name:'Drop 2',
  desc:'Le voicing 4 notes le plus joué de la guitare jazz.',
  lessons:[
   {t:'Drop 2, la recette', x:`Prends un accord de 7e « serré » (1-3-5-7 empilés) et <b>descends la 2e voix en partant du haut d'une octave</b> : voilà un drop 2. Sur la guitare, il tombe parfaitement sur 4 cordes adjacentes (souvent La-Ré-Sol-Si). Confortable, équilibré, jouable partout.`, sh:'Drop 2 – Do maj7', try:'drop2Quiz'},
   {t:'Un accord, quatre visages', x:`Chaque drop 2 existe en <b>4 renversements</b> (selon la note à la basse : 1, 3, 5 ou 7). Les connaître, c'est pouvoir jouer le même accord à 4 endroits du manche — et choisir celui qui est le plus proche pour un voice leading parfait.`, sh:'Drop 2 – Sol 7', try:'bassNote'}
  ],
  games:['drop2Quiz','bassNote','readDiagram'], badge:{icon:'2️⃣', name:'Drop master'}},

 {id:'drop3', icon:'3️⃣', name:'Drop 3',
  desc:'La basse qui saute une corde : le son des big bands.',
  lessons:[
   {t:'Drop 3, la recette', x:`Cette fois on descend la <b>3e voix depuis le haut</b> d'une octave. Signature visuelle sur le manche : la basse est isolée sur la corde de Mi grave (ou La), on <b>saute une corde étouffée</b>, puis 3 notes serrées. Un son large, parfait pour accompagner en solo.`, sh:'Drop 3 – Do maj7', try:'drop3Quiz'},
   {t:'Drop 2 ou drop 3 ?', x:`<b>Drop 2</b> = compact, 4 cordes adjacentes, idéal en groupe. <b>Drop 3</b> = basse marquée + accord, idéal seul ou en duo. Les deux se complètent : le morceau et le contexte décident.`, sh:'Drop 3 – Sol 7', try:'readDiagram'}
  ],
  games:['drop3Quiz','bassNote','readDiagram'], badge:{icon:'3️⃣', name:'Big band'}},

 {id:'openv', icon:'🌌', name:'Open Voicings',
  desc:'Aérer l\'accord : plus d\'une octave entre les voix.',
  lessons:[
   {t:'Ouvrir l\'accord', x:`Un voicing « fermé » tient dans une octave ; un voicing <b>ouvert</b> écarte les voix au-delà. Résultat : chaque note respire, l'accord sonne comme un piano. Les drop 2 et drop 3 que tu connais sont déjà des voicings ouverts — c'est pour ça qu'ils sonnent si bien.`, try:'openvQuiz'},
   {t:'L\'espace est une couleur', x:`Règle d'orchestration : <b>graves espacés, aigus resserrés</b> (comme les harmoniques naturelles). Une basse isolée + 2-3 notes serrées en haut = le voicing de guitare idéal. Écoute la différence entre x32010 et un drop 3 : même accord, deux mondes.`, try:'openvQuiz'}
  ],
  games:['openvQuiz','inversionQuiz','bassNote'], badge:{icon:'🌌', name:'Espace'}},

 {id:'quartal', icon:'🏗️', name:'Accords Quartaux',
  desc:'Empiler des quartes : le son moderne de McCoy Tyner.',
  lessons:[
   {t:'Changer de brique', x:`Et si on empilait des <b>quartes</b> (5 cases) au lieu des tierces ? On obtient un accord <b>quartal</b> : flottant, moderne, ni vraiment majeur ni mineur. C'est le fameux « So What chord » de Miles Davis. Sur la guitare, c'est un plaisir : les cordes sont accordées en quartes !`, try:'quartalBuild'},
   {t:'Où les utiliser', x:`Les quartaux brillent sur les accords <b>mineurs</b> (dorien) et les ambiances modales ou funk. Empile 3 quartes depuis n'importe quelle note de la gamme : ça sonne toujours. Le voicing passe-partout de la musique moderne.`, try:'quartalQuiz'}
  ],
  games:['quartalBuild','quartalQuiz'], badge:{icon:'🏗️', name:'Moderniste'}},

 {id:'analysis', icon:'🔬', name:'Analyse harmonique',
  desc:'Degrés, cadences, tonalités : comprendre ce qu\'on entend.',
  lessons:[
   {t:'La famille de 7', x:`Les 7 notes d'une gamme donnent <b>7 accords compatibles</b> : I, ii, iii, IV, V, vi, vii°. En 7e : Imaj7, IIm7, IIIm7, IVmaj7, <b>V7</b>, VIm7, VIIm7♭5. Les chiffres romains rendent toute chanson transposable.`, dg:'degrees', try:'degreeQuiz'},
   {t:'Les cadences', x:`Une cadence est une <b>fin de phrase</b> : <b>V → I</b> = parfaite (repos), <b>V → vi</b> = rompue (surprise), s'arrêter sur V = demi-cadence (suspens). Le <b>ii-V-I</b> est la cadence enrichie du jazz — tu la connais déjà par les shell chords.`, try:'earCadence'},
   {t:'Le cercle des quintes', x:`La carte du musicien : chaque pas horaire = une quinte. Les tonalités voisines partagent presque toutes leurs notes — c'est pour ça qu'elles s'enchaînent si bien.`, dg:'circle', try:'keyQuiz'}
  ],
  games:['keyQuiz','degreeQuiz','degreePlay','earCadence','cadenceQuiz'], badge:{icon:'🔬', name:'Détective'}},

 {id:'reharm', icon:'🎭', name:'Réharmonisation',
  desc:'Réécrire les accords d\'une chanson sans changer sa mélodie.',
  lessons:[
   {t:'La boîte à outils', x:`Réharmoniser = garder la mélodie, changer les accords dessous. Tes outils, tu les as déjà : <b>substitutions diatoniques</b> (I↔vi…), <b>tritonique</b> (V7↔♭II7), insérer un <b>ii-V</b> devant n'importe quel accord, et les <b>dominantes secondaires</b> (V7 du prochain accord).`, try:'reharmQuiz'},
   {t:'La règle d\'or', x:`Une seule contrainte : le nouvel accord doit <b>contenir (ou tolérer) la note de mélodie</b>. Si la mélodie fait Mi, tout accord contenant Mi est candidat : Do, Lam, Fa maj7, Mi7… Choisis celui dont la basse crée le meilleur voice leading.`, try:'reharmQuiz'}
  ],
  games:['reharmQuiz','subQuiz','vlQuiz'], badge:{icon:'🎭', name:'Arrangeur'}},

 {id:'improv', icon:'🎤', name:'Improvisation',
  desc:'Gammes, pentatoniques, modes — et TES phrases.',
  lessons:[
   {t:'La gamme majeure', x:`La recette <b>2-2-1-2-2-2-1</b> depuis n'importe quelle note. Pour la voir : joue-la sur une seule corde (cases 0-2-4-5-7-9-11-12), puis en position.`, dg:'formula', try:'buildScale_maj'},
   {t:'La pentatonique', x:`5 notes, zéro fausse note : la gamme de 90 % des solos rock et blues. C'est ton camp de base pour improviser.`, try:'buildScale_pmin'},
   {t:'Les modes utiles', x:`Mêmes notes, autre point de départ : <b>dorien</b> (mineur groovy — Santana) et <b>mixolydien</b> (majeur bluesy — AC/DC). Deux ambiances à connaître, les autres viendront seules.`, try:'buildScale_dor'},
   {t:'Phrase = respiration', x:`Une impro n'est pas un flot de notes : c'est des <b>phrases</b> avec des silences. Joue 3-4 notes, respire, réponds-toi. Et vise une note de <b>l'accord en cours</b> (1, 3 ou 7) aux moments forts.`, dg:'rhythm', try:'improv'}
  ],
  games:['buildScale_maj','buildScale_pmin','buildScale_dor','buildScale_mixo','completeScale','intruder','modeQuiz','improv','melodyRepeat','simon'], badge:{icon:'🎤', name:'Improvisateur'}},

 {id:'mastery', icon:'👑', name:'Maîtrise',
  desc:'L\'examen final : tout, mélangé, sans filet.',
  lessons:[
   {t:'Le grand examen', x:`20 questions tirées de <b>tout le parcours</b> — diagrammes, shells, drop 2, voice leading, oreille, manche. 80 % = couronne. Repasse-le quand tu veux : c'est ton vrai niveau.`, try:'exam'}
  ],
  games:['exam','simon','improv'], badge:{icon:'👑', name:'Maître du manche'}}
];

/* ============ Unités du parcours (carte façon Duolingo) ============ */
const PATH_UNITS = [
  {name:'Fondamentaux',           ids:['discover','diagrams','fingerstyle','fretboard']},
  {name:'Intervalles & accords',  ids:['intervals','chordconst','triads','chords7']},
  {name:'Harmonie jazz',          ids:['shell','extensions','subs','voicelead']},
  {name:'Voicings',               ids:['drop2','drop3','openv','quartal']},
  {name:'Analyse & maîtrise',     ids:['analysis','reharm','improv','mastery']}
];

/* ============ Intros de concept (mini-cours avant chaque exercice) ============
   Court, digeste : de quoi comprendre la notion AVANT de jouer. */
const SKILL_INTRO = {
  discover:    {title:'Le manche, mode d\'emploi', txt:'Il n\'existe que <b>12 notes</b> qui tournent en boucle. Sur la guitare, <b>chaque case = 1 demi-ton</b>, et à la case 12 tout recommence une octave plus haut. Avant de jouer vite, il faut savoir <b>où</b> est chaque note.'},
  diagrams:    {title:'Lire un diagramme d\'accord', txt:'Un diagramme se lit à la verticale : les traits = les cordes, les points = où poser les doigts. En haut : <b>✕ = corde muette</b>, <b>○ = corde à vide</b>. La <b>fondamentale</b> (en orange) donne le nom de l\'accord.'},
  fingerstyle: {title:'La main droite : P·I·M·A', txt:'<b>P</b>ouce pour les cordes graves, <b>I</b>ndex·<b>M</b>ajeur·<b>A</b>nnulaire pour les aiguës. Chaque doigt a « sa » corde : la main bouge à peine, seuls les doigts travaillent.'},
  fretboard:   {title:'Trouver n\'importe quelle note', txt:'Les cordes à vide : <b>Mi La Ré Sol Si Mi</b>. À partir d\'elles tu comptes les cases (1 case = 1 demi-ton). Les repères sont aux cases <b>3, 5, 7, 9 et 12</b>.'},
  intervals:   {title:'La distance entre deux notes', txt:'Un intervalle = un nombre de cases. Tierce mineure = <b>3</b>, tierce majeure = <b>4</b>, quinte = <b>7</b>, octave = <b>12</b>. C\'est le vocabulaire de toutes les mélodies et de tous les accords.', dg:'intervals'},
  chordconst:  {title:'Comment se fabrique un accord', txt:'On empile des tierces sur une fondamentale : <b>1, 3, 5</b>. Chaque note est nommée par son degré. Cette écriture chiffrée est le langage de toute l\'harmonie.', dg:'triad'},
  triads:      {title:'Majeur ou mineur ?', txt:'Une triade = 3 notes : fondamentale, tierce, quinte. <b>Seule la tierce décide</b> : majeure (4 cases) = joyeux, mineure (3 cases) = mélancolique.'},
  chords7:     {title:'La 4e note qui change tout', txt:'Ajoute une tierce de plus : <b>1-3-5-7</b>. Quatre couleurs : <b>maj7</b> (doux), <b>m7</b> (soul), <b>7</b> (bluesy, instable), <b>m7♭5</b> (tendu). C\'est le son du jazz et du blues.'},
  shell:       {title:'Le squelette de l\'accord', txt:'En jazz, on garde souvent juste <b>1, 3 et 7</b> (on jette la quinte). Ces « notes guides » suffisent à faire sonner l\'accord — petit, mobile, immédiatement pro.'},
  extensions:  {title:'Les étages du dessus', txt:'Après la 7e, on continue : <b>9, 11, 13</b>. Ce sont les épices qui colorent l\'accord sans changer sa fonction. Attention : la 11 juste frotte sur un accord majeur.'},
  subs:        {title:'Remplacer un accord', txt:'Deux accords qui partagent des notes peuvent s\'échanger (<b>I ↔ vi</b>). Et tout accord 7 peut être remplacé par le 7 situé à un <b>triton</b> : la fameuse substitution tritonique.'},
  voicelead:   {title:'Enchaîner sans sauter', txt:'Chaque note d\'un accord est une « voix ». Le secret : <b>bouger chaque voix le moins possible</b>. Dans un ii-V-I, la 7e descend d\'un demi-ton vers la tierce du suivant.', dg:'voicelead'},
  drop2:       {title:'Le voicing le plus joué', txt:'Prends un accord de 7e serré et descends la <b>2e voix</b> d\'une octave : voilà un <b>drop 2</b>. Il tombe pile sur 4 cordes voisines. Confortable et jouable partout.'},
  drop3:       {title:'La basse qui saute une corde', txt:'Cette fois on descend la <b>3e voix</b>. Résultat : une basse isolée, une corde muette, puis 3 notes serrées. Un son large, parfait pour jouer seul.'},
  openv:        {title:'Aérer l\'accord', txt:'Un voicing <b>ouvert</b> écarte les voix au-delà de l\'octave : chaque note respire, ça sonne comme un piano. Règle d\'or : <b>graves espacés, aigus resserrés</b>.'},
  quartal:     {title:'Empiler des quartes', txt:'Au lieu de tierces, on empile des <b>quartes</b> (5 cases). Résultat : un son flottant, moderne, ni majeur ni mineur — le fameux « So What chord » de Miles Davis.'},
  analysis:    {title:'Comprendre ce qu\'on entend', txt:'Les 7 accords d\'une tonalité, les cadences (<b>V → I</b> = repos), le cercle des quintes. Les outils pour décoder n\'importe quelle chanson.', dg:'degrees'},
  reharm:      {title:'Réécrire les accords', txt:'Réharmoniser = garder la mélodie, changer les accords dessous. Tes outils : substitutions, ii-V insérés, dominantes secondaires. Seule règle : l\'accord doit <b>tolérer la note de mélodie</b>.'},
  improv:      {title:'Jouer TES phrases', txt:'Gammes, pentatoniques, modes : ta boîte à outils. Le secret n\'est pas de jouer plein de notes, mais des <b>phrases avec des silences</b>, en visant les notes de l\'accord.', dg:'formula'},
  mastery:     {title:'L\'examen final', txt:'Tout le parcours, mélangé, sans filet. 20 questions, guitare en main et à l\'oreille. <b>80 % = la couronne.</b>'}
};

/* ============ Badges ============ */
const BADGES = [
  {id:'first',   icon:'🎵', name:'Première note',    desc:'Jouer ta première note détectée'},
  {id:'notes100',icon:'💯', name:'100 notes',        desc:'100 notes détectées'},
  {id:'notes1k', icon:'🎼', name:'1 000 notes',      desc:'1 000 notes détectées'},
  {id:'streak3', icon:'🔥', name:'3 jours de suite', desc:'Série de 3 jours'},
  {id:'streak7', icon:'🌋', name:'Semaine parfaite', desc:'Série de 7 jours'},
  {id:'streak30',icon:'☄️', name:'Mois de feu',      desc:'Série de 30 jours'},
  {id:'games10', icon:'🎮', name:'Joueur',           desc:'10 jeux terminés'},
  {id:'games50', icon:'🕹️', name:'Accro',            desc:'50 jeux terminés'},
  {id:'perfect', icon:'💎', name:'Sans faute',       desc:'Un jeu terminé à 100 %'},
  {id:'lvl5',    icon:'⭐', name:'Niveau 5',          desc:'Atteindre le niveau 5'},
  {id:'lvl10',   icon:'🌟', name:'Niveau 10',         desc:'Atteindre le niveau 10'},
  {id:'daily5',  icon:'📅', name:'Défis du jour ×5',  desc:'5 défis quotidiens réussis'},
  {id:'ear20',   icon:'👂', name:'Oreille d\'or',     desc:'20 jeux d\'oreille réussis'},
  {id:'survivor',icon:'💀', name:'Survivant',         desc:'15 bonnes réponses en mode survie'},
  {id:'jazzcat', icon:'🐈‍⬛', name:'Jazz cat',        desc:'Maîtriser les Shell Chords à 80 %'}
];

/* ============ Jeux ============ */
function gStrings(d){ return QUIZ_STRINGS.slice(0, d < .34 ? 2 : d < .67 ? 4 : 6); }
function gFrets(d){ return d < .34 ? 5 : d < .67 ? 9 : 12; }
function pcChoices(ans, n = 4){
  const c = [ans]; while (c.length < n){ const x = rint(12); if (!c.includes(x)) c.push(x); }
  return c.sort(() => Math.random()-.5);
}
const SEVENTH_TYPES = {'maj7':[4,11], 'm7':[3,10], '7':[4,10]};

const GAMES = {
 /* --- Manche & découverte --- */
 findNote:{name:'Trouve la note', icon:'🎯', cat:['guitar','quick'], skill:'fretboard', mic:true, type:'micNote', rounds:8,
  desc:'Une note, une corde : trouve la case.',
  gen(d){ const s = rnd(gStrings(d)), fret = rint(gFrets(d)+1), m = s.midi+fret;
    return {q:`Joue ${pcFR(m%12)} sur la corde de ${s.name}`, targetMidi:m, notion:'note-'+pcEN(m%12)}; }},
 octaves:{name:'Chasse aux octaves', icon:'🪞', cat:['guitar'], skill:'fretboard', mic:true, type:'micSet', rounds:5,
  desc:'La même note à plusieurs octaves.',
  gen(d){ const pc = rint(12); const n = d < .5 ? 2 : 3;
    return {q:`Joue ${pcFR(pc)} dans ${n} octaves différentes`, sub:'N\'importe quelles cordes', pc, needCount:n, distinctMidi:true, notion:'octaves'}; }},
 speedNotes:{name:'Notes chrono', icon:'⏱️', cat:['guitar','quick'], skill:'fretboard', mic:true, type:'micNote', rounds:10, timer:60,
  desc:'Un maximum de notes justes en 60 s.',
  gen(d){ const s = rnd(gStrings(Math.min(1,d+.2))), fret = rint(gFrets(d)+1), m = s.midi+fret;
    return {q:`${pcFR(m%12)} — corde de ${s.name}`, targetMidi:m, notion:'note-'+pcEN(m%12)}; }},
 reverseQuiz:{name:'Quiz du manche', icon:'🧠', cat:['nogtr','quick'], skill:'fretboard', mic:false, type:'mcq', rounds:8,
  desc:'Quelle note à cette case ? (sans guitare)',
  gen(d){ const s = rnd(gStrings(d)), fret = rint(gFrets(d)+1), pc = (s.midi+fret)%12;
    const ch = pcChoices(pc);
    return {q:`Corde de ${s.name}, case ${fret} : quelle note ?`, choices:ch.map(pcFR), ans:ch.indexOf(pc), notion:'note-'+pcEN(pc)}; }},

 /* --- Diagrammes & fingerstyle --- */
 readDiagram:{name:'Lis le diagramme', icon:'🗂️', cat:['nogtr','quick'], skill:'diagrams', mic:false, type:'mcq', rounds:6,
  desc:'Fondamentale, cordes étouffées, nom de l\'accord.',
  gen(d){ const sh = rnd(SHAPES); const v = rint(3);
    if (v === 0){
      const names = [sh.n]; while (names.length < 4){ const o = rnd(SHAPES).n; if (!names.includes(o)) names.push(o); }
      names.sort(() => Math.random()-.5);
      return {q:'Quel accord est représenté ?', svg:DG.chordbox(sh,true), choices:names, ans:names.indexOf(sh.n), notion:'diagram'};
    }
    if (v === 1){
      const rootNote = shapeNotes(sh).find(n => n.ivl === 0);
      const opts = [...new Set([rootNote.s, rint(6), rint(6), rint(6)])].slice(0,4);
      while (opts.length < 4){ const x = rint(6); if (!opts.includes(x)) opts.push(x); }
      opts.sort((a,b)=>a-b);
      return {q:'Sur quelle corde est la fondamentale (orange) ?', svg:DG.chordbox(sh,false),
        choices:opts.map(s => STRING_LABELS[s]), ans:opts.indexOf(rootNote.s), notion:'diagram'};
    }
    const nx = (sh.f.match(/x/g)||[]).length;
    const opts = [...new Set([nx,(nx+1)%4,(nx+2)%4,(nx+3)%4])].sort((a,b)=>a-b);
    return {q:'Combien de cordes étouffées (✕) ?', svg:DG.chordbox(sh,false),
      choices:opts.map(String), ans:opts.indexOf(nx), notion:'diagram'}; }},
 pimaQuiz:{name:'P·I·M·A', icon:'🤚', cat:['nogtr','quick'], skill:'fingerstyle', mic:false, type:'mcq', rounds:8,
  desc:'Quel doigt de la main droite pour quelle corde ?',
  gen(d){ const map = [['Mi grave','P (pouce)'],['La','P (pouce)'],['Ré','P (pouce)'],['Sol','I (index)'],['Si','M (majeur)'],['Mi aigu','A (annulaire)']];
    const [corde, doigt] = rnd(map);
    const ch = ['P (pouce)','I (index)','M (majeur)','A (annulaire)'];
    return {q:`Quel doigt joue la corde de ${corde} ?`, choices:ch, ans:ch.indexOf(doigt), notion:'pima'}; }},
 arpegeChord:{name:'Arpège fingerstyle', icon:'🎼', cat:['guitar'], skill:'fingerstyle', mic:true, type:'micSeq', rounds:2,
  desc:'Égrène l\'accord du grave vers l\'aigu.',
  gen(d){ const sh = SHAPES[rint(6)]; const notes = shapeNotes(sh);
    return {q:`Arpège de ${sh.n}`, sub:'Joue chaque corde, du grave vers l\'aigu (P puis I-M-A)',
      svg:DG.chordbox(sh,false), seq:notes.map(n => n.pc), seqPc:true,
      seqLabels:notes.map(n => pcFR(n.pc)), notion:'pima'}; }},

 /* --- Intervalles --- */
 buildInterval:{name:'Construis l\'intervalle', icon:'📏', cat:['guitar'], skill:'intervals', mic:true, type:'micNote', rounds:8,
  desc:'Pars d\'une note, monte du bon nombre de cases.',
  gen(d){ const ivs = d < .4 ? INTERVALS.filter(i=>[3,4,5,7,12].includes(i.s)) : INTERVALS;
    const iv = rnd(ivs); const root = 45 + rint(15);
    return {q:`Depuis ${pcFR(root%12)}, joue une ${iv.n}`, sub:`(+${iv.s} cases, n'importe où)`, targetPc:(root+iv.s)%12, playFirst:[root], notion:'iv-'+iv.s}; }},
 semitones:{name:'Compte les cases', icon:'🔢', cat:['nogtr','quick'], skill:'intervals', mic:false, type:'mcq', rounds:8,
  desc:'Combien de demi-tons dans cet intervalle ?',
  gen(d){ const iv = rnd(INTERVALS);
    const c = [iv.s]; while (c.length < 4){ const x = 1+rint(12); if (!c.includes(x)) c.push(x); }
    c.sort((a,b)=>a-b);
    return {q:`Une ${iv.n} = combien de cases ?`, choices:c.map(String), ans:c.indexOf(iv.s), notion:'iv-'+iv.s}; }},
 earInterval:{name:'L\'intervalle à l\'oreille', icon:'👂', cat:['ear'], skill:'intervals', mic:false, type:'mcq', rounds:8,
  desc:'Deux notes jouées : quel intervalle ?',
  gen(d){ const pool = d < .4 ? INTERVALS.filter(i=>[3,4,7,12].includes(i.s)) : INTERVALS;
    const iv = rnd(pool); const root = 52 + rint(12);
    const wrong = pool.filter(i=>i.s!==iv.s).sort(()=>Math.random()-.5).slice(0,3);
    const opts = [iv,...wrong].sort(()=>Math.random()-.5);
    return {q:'Quel est cet intervalle ?', play:[root, root+iv.s], replay:true,
      choices:opts.map(o=>o.n), ans:opts.indexOf(iv), notion:'iv-'+iv.s}; }},

 /* --- Construction, triades, 7e --- */
 chordTones:{name:'1, 3 ou 5 ?', icon:'🎲', cat:['nogtr','quick'], skill:'chordconst', mic:false, type:'mcq', rounds:8,
  desc:'La fonction de chaque note dans l\'accord.',
  gen(d){ const type = rnd(['Majeur','Mineur']); const root = rint(12);
    const which = rnd([0,1,2]);
    const pc = (root + CHORDS[type].iv[which])%12;
    return {q:`Dans ${pcFR(root)} ${type}, la note ${pcFR(pc)} est…`,
      choices:['La fondamentale (1)','La tierce (3)','La quinte (5)'], ans:which, notion:'deg-fonctions'}; }},
 buildChord_sus:{name:'Accords suspendus', icon:'⏸️', cat:['guitar'], skill:'chordconst', mic:true, type:'micSet', rounds:4,
  desc:'Sus2 et sus4 : la tierce remplacée.',
  gen(d){ const type = rnd(['Sus2','Sus4']); const root = rint(12);
    const pcs = CHORDS[type].iv.map(iv=>(root+iv)%12);
    return {q:`${pcFR(root)} ${type.toLowerCase()}`, sub:'Joue ses 3 notes', pcs, notion:'chord-sus'}; }},
 buildChord_triad:{name:'Construis l\'accord', icon:'🔺', cat:['guitar'], skill:'triads', mic:true, type:'micSet', rounds:4,
  desc:'Les 3 notes de la triade, une par une.',
  gen(d){ const type = rnd(['Majeur','Mineur']); const root = rint(12);
    const pcs = CHORDS[type].iv.map(iv=>(root+iv)%12);
    return {q:`${pcFR(root)} ${type}`, sub:'Joue ses 3 notes (dans n\'importe quel ordre)', pcs, notion:'chord-'+(type==='Majeur'?'maj':'min')}; }},
 earMajMin:{name:'Majeur ou mineur ?', icon:'🌗', cat:['ear','quick'], skill:'triads', mic:false, type:'mcq', rounds:8,
  desc:'Un accord arpégé : joyeux ou mélancolique ?',
  gen(d){ const maj = Math.random() < .5; const root = 50 + rint(12);
    return {q:'Cet accord est…', play:(maj?[0,4,7]:[0,3,7]).map(iv=>root+iv), replay:true,
      choices:['Majeur 😊','Mineur 🌧️'], ans:maj?0:1, notion:maj?'chord-maj':'chord-min'}; }},
 findThird:{name:'Trouve la tierce', icon:'🎯', cat:['guitar','ear'], skill:'triads', mic:true, type:'micNote', rounds:6,
  desc:'J\'arpège un accord : rejoue sa tierce.',
  gen(d){ const maj = Math.random() < .5; const root = 48 + rint(12);
    return {q:'Joue la TIERCE de cet accord', sub:maj?'(accord majeur)':'(accord mineur)',
      play:(maj?[0,4,7]:[0,3,7]).map(iv=>root+iv), replay:true, targetPc:(root+(maj?4:3))%12, notion:'deg-tierce'}; }},
 findRoot:{name:'Trouve la fondamentale', icon:'🏠', cat:['guitar','ear'], skill:'triads', mic:true, type:'micNote', rounds:6,
  desc:'J\'arpège un accord : rejoue sa note maison.',
  gen(d){ const type = rnd(['Majeur','Mineur','7 (dominante)']); const root = 48 + rint(12);
    return {q:'Joue la FONDAMENTALE de cet accord', play:CHORDS[type].iv.map(iv=>root+iv), replay:true,
      targetPc:root%12, notion:'deg-fondamentale'}; }},
 buildChord_7:{name:'Construis l\'accord 7', icon:'7️⃣', cat:['guitar'], skill:'chords7', mic:true, type:'micSet', rounds:4,
  desc:'Les 4 notes des accords de septième.',
  gen(d){ const type = rnd(['7 (dominante)','Majeur 7','Mineur 7']); const root = rint(12);
    const pcs = CHORDS[type].iv.map(iv=>(root+iv)%12);
    return {q:`${pcFR(root)} ${type}`, sub:'Joue ses 4 notes', pcs, notion:'chord-7'}; }},
 seventhQuiz:{name:'Quelle septième ?', icon:'🃏', cat:['ear'], skill:'chords7', mic:false, type:'mcq', rounds:6,
  desc:'maj7, m7 ou 7 : reconnais la couleur.',
  gen(d){ const types = ['Majeur 7','Mineur 7','7 (dominante)'];
    const ti = rint(3); const root = 48 + rint(12);
    return {q:'Quelle couleur d\'accord ?', play:CHORDS[types[ti]].iv.map(iv=>root+iv), replay:true,
      choices:['Majeur 7 (doux)','Mineur 7 (soul)','7 dominante (bluesy)'], ans:ti, notion:'chord-7'}; }},
 blues:{name:'Blues 12 mesures', icon:'🎷', cat:['guitar'], skill:'chords7', mic:true, type:'micSeq', rounds:1,
  desc:'La grille I-IV-V : la fondamentale de chaque mesure.',
  gen(d){ const root = rint(12);
    const bars = [0,0,0,0,5,5,0,0,7,5,0,7];
    return {q:`Blues en ${pcFR(root)}`, sub:'Fondamentale de chaque mesure', seq:bars.map(b=>(root+b)%12), seqPc:true,
      seqLabels:bars.map((b,i)=>`${i+1}·${pcFR((root+b)%12)}7`), notion:'blues'}; }},

 /* --- Shell chords --- */
 shellQuiz:{name:'Quiz des shells', icon:'🐚', cat:['nogtr','quick'], skill:'shell', mic:false, type:'mcq', rounds:6,
  desc:'1-3-7 : le squelette de l\'accord.',
  gen(d){ if (Math.random() < .35){
      const qs = [
        {q:'Dans un shell chord, on supprime…', c:['la quinte','la tierce','la fondamentale','la septième'], a:0},
        {q:'Les « guide tones » (notes guides) sont…', c:['la tierce et la 7e','la fondamentale et la quinte','la 9 et la 13','les cordes à vide'], a:0},
        {q:'Pourquoi peut-on enlever la quinte ?', c:['elle n\'apporte pas de couleur','elle est trop grave','elle est dissonante','elle est fausse'], a:0}
      ]; const it = rnd(qs);
      const order = it.c.map((c,i)=>i).sort(()=>Math.random()-.5);
      return {q:it.q, choices:order.map(i=>it.c[i]), ans:order.indexOf(it.a), notion:'shell'};
    }
    const r = rint(12); const [tn, [t3, t7]] = rnd(Object.entries(SEVENTH_TYPES));
    const good = [r, (r+t3)%12, (r+t7)%12].map(pcFR).join(' · ');
    const opts = [good,
      [r, (r+t3)%12, (r+7)%12].map(pcFR).join(' · '),
      [r, (r+(t3===4?3:4))%12, (r+t7)%12].map(pcFR).join(' · '),
      [r, (r+5)%12, (r+t7)%12].map(pcFR).join(' · ')].sort(() => Math.random()-.5);
    return {q:`Le shell (1-3-7) de ${pcFR(r)}${tn} ?`, choices:opts, ans:opts.indexOf(good), notion:'shell'}; }},
 shellBuild:{name:'Construis le shell', icon:'🐚', cat:['guitar'], skill:'shell', mic:true, type:'micSet', rounds:4,
  desc:'Joue 1, 3 et 7 — rien d\'autre.',
  gen(d){ const r = rint(12); const [tn, [t3, t7]] = rnd(Object.entries(SEVENTH_TYPES));
    return {q:`Shell de ${pcFR(r)}${tn}`, sub:'Fondamentale · tierce · septième (où tu veux)',
      pcs:[r, (r+t3)%12, (r+t7)%12], notion:'shell'}; }},
 cadence251:{name:'Le ii-V-I', icon:'🚪', cat:['guitar'], skill:'shell', mic:true, type:'micSeq', rounds:2,
  desc:'LA cadence du jazz : joue les fondamentales.',
  gen(d){ const k = rint(12);
    return {q:`ii-V-I en ${pcFR(k)} majeur`, sub:'Joue les 3 fondamentales dans l\'ordre',
      seq:[(k+2)%12,(k+7)%12,k], seqPc:true,
      seqLabels:['ii · '+pcFR((k+2)%12)+'m7','V · '+pcFR((k+7)%12)+'7','I · '+pcFR(k)+'maj7'], notion:'251'}; }},

 /* --- Extensions --- */
 extQuiz:{name:'Quiz des extensions', icon:'✨', cat:['nogtr','quick'], skill:'extensions', mic:false, type:'mcq', rounds:6,
  desc:'9, 11, 13 — et les notes à éviter.',
  gen(d){ const v = rint(3); const r = rint(12);
    if (v === 0){ const ch = pcChoices((r+2)%12);
      return {q:`La 9e de ${pcFR(r)} = ?`, choices:ch.map(pcFR), ans:ch.indexOf((r+2)%12), notion:'ext'}; }
    if (v === 1){ const ch = pcChoices((r+9)%12);
      return {q:`La 13e de ${pcFR(r)}7 = ?`, choices:ch.map(pcFR), ans:ch.indexOf((r+9)%12), notion:'ext'}; }
    const qs = [
      {q:'L\'extension à éviter sur un accord majeur 7 ?', c:['la 11 juste','la 9','la 13','la quinte'], a:0},
      {q:'La 9e correspond à quelle note simple ?', c:['la seconde','la quarte','la sixte','la tierce'], a:0},
      {q:'La ♭9 se réserve à quel accord ?', c:['la dominante (V7)','le majeur 7','le mineur 7','le sus2'], a:0}
    ]; const it = rnd(qs);
    const order = it.c.map((c,i)=>i).sort(()=>Math.random()-.5);
    return {q:it.q, choices:order.map(i=>it.c[i]), ans:order.indexOf(it.a), notion:'ext'}; }},
 extEar:{name:'Triade, 7e ou add9 ?', icon:'👂', cat:['ear'], skill:'extensions', mic:false, type:'mcq', rounds:6,
  desc:'Entends la couleur qui s\'ajoute.',
  gen(d){ const types = [['Triade simple',[0,4,7]], ['Majeur 7',[0,4,7,11]], ['Add 9',[0,4,7,14]]];
    const ti = rint(3); const root = 50 + rint(10);
    return {q:'Quelle couleur entends-tu ?', play:types[ti][1].map(iv=>root+iv), replay:true,
      choices:types.map(t=>t[0]), ans:ti, notion:'ext'}; }},

 /* --- Substitutions --- */
 subQuiz:{name:'Quiz des substitutions', icon:'🔀', cat:['nogtr'], skill:'subs', mic:false, type:'mcq', rounds:6,
  desc:'Diatoniques et tritonique.',
  gen(d){ const k = rint(12);
    if (Math.random() < .5){
      const ch = pcChoices((k+6)%12);
      return {q:`Substitut tritonique de ${pcFR(k)}7 ?`, choices:ch.map(pc=>pcFR(pc)+'7'), ans:ch.indexOf((k+6)%12), notion:'sub'};
    }
    const ch = pcChoices((k+9)%12);
    return {q:`Substitut diatonique de ${pcFR(k)} majeur (son relatif) ?`,
      choices:ch.map(pc=>pcFR(pc)+' mineur'), ans:ch.indexOf((k+9)%12), notion:'sub'}; }},

 /* --- Voice leading --- */
 vlQuiz:{name:'Quiz voice leading', icon:'🎢', cat:['nogtr'], skill:'voicelead', mic:false, type:'mcq', rounds:6,
  desc:'La 7e qui devient tierce.',
  gen(d){ const k = rint(12);
    if (Math.random() < .3){
      const qs = [
        {q:'Le bon voice leading déplace chaque voix…', c:['le moins possible','d\'une octave','vers le haut','vers la basse'], a:0},
        {q:'Entre deux accords, on garde en priorité…', c:['les notes communes','les quintes','les basses','les cordes à vide'], a:0}
      ]; const it = rnd(qs);
      const order = it.c.map((c,i)=>i).sort(()=>Math.random()-.5);
      return {q:it.q, choices:order.map(i=>it.c[i]), ans:order.indexOf(it.a), notion:'vl'};
    }
    const ans = (k+11)%12;
    const ch = pcChoices(ans);
    return {q:`ii-V-I en ${pcFR(k)} majeur : la 7e de ${pcFR((k+2)%12)}m7 (le ${pcFR(k)}) descend vers…`,
      choices:ch.map(pcFR), ans:ch.indexOf(ans), notion:'vl'}; }},
 vlPlay:{name:'Joue la résolution', icon:'🎢', cat:['guitar','ear'], skill:'voicelead', mic:true, type:'micNote', rounds:6,
  desc:'Entends la note guide, joue sa résolution.',
  gen(d){ const k = rint(12);
    return {q:`La 7e de ${pcFR((k+2)%12)}m7 (jouée) descend d'un demi-ton : joue la note d'arrivée`,
      sub:'(la tierce de ' + pcFR((k+7)%12) + '7)', playFirst:[48 + k], targetPc:(k+11)%12, notion:'vl'}; }},
 inversionQuiz:{name:'Quelle basse ?', icon:'🔄', cat:['ear'], skill:'voicelead', mic:false, type:'mcq', rounds:6,
  desc:'Position fondamentale ou renversement ?',
  gen(d){ const root = 48 + rint(10); const inv = rint(3);
    const notes = inv===0 ? [root, root+4, root+7] : inv===1 ? [root+4, root+7, root+12] : [root+7, root+12, root+16];
    return {q:'Cet accord majeur est joué…', play:notes, replay:true,
      choices:['Fondamentale à la basse','1er renversement (tierce)','2e renversement (quinte)'], ans:inv, notion:'inversions'}; }},

 /* --- Drop 2 / Drop 3 / Open --- */
 drop2Quiz:{name:'Quiz drop 2', icon:'2️⃣', cat:['nogtr'], skill:'drop2', mic:false, type:'mcq', rounds:6,
  desc:'La recette et la lecture des drop 2.',
  gen(d){ if (Math.random() < .5){
      const qs = [
        {q:'Pour fabriquer un drop 2, on descend d\'une octave…', c:['la 2e voix depuis le haut','la basse','la note la plus haute','la tierce'], a:0},
        {q:'Le drop 2 se joue typiquement sur…', c:['4 cordes adjacentes','les 6 cordes','2 cordes','les cordes 6 et 1'], a:0},
        {q:'Combien de renversements possède un drop 2 ?', c:['4','2','3','12'], a:0}
      ]; const it = rnd(qs);
      const order = it.c.map((c,i)=>i).sort(()=>Math.random()-.5);
      return {q:it.q, choices:order.map(i=>it.c[i]), ans:order.indexOf(it.a), notion:'drop2'};
    }
    const sh = rnd(SHAPES.filter(s => s.drop));
    const ans = sh.drop === 2 ? 0 : 1;
    return {q:'Ce voicing est un…', svg:DG.chordbox(sh,true), choices:['Drop 2 (4 cordes adjacentes)','Drop 3 (corde sautée)'], ans, notion:'drop2'}; }},
 drop3Quiz:{name:'Quiz drop 3', icon:'3️⃣', cat:['nogtr'], skill:'drop3', mic:false, type:'mcq', rounds:6,
  desc:'La basse isolée des big bands.',
  gen(d){ const qs = [
      {q:'Pour un drop 3, on descend d\'une octave…', c:['la 3e voix depuis le haut','la 2e voix','la basse','la mélodie'], a:0},
      {q:'Signature visuelle du drop 3 sur le manche ?', c:['une corde étouffée entre la basse et le reste','tout serré sur 4 cordes','deux cordes à vide','pas de basse'], a:0},
      {q:'Le drop 3 est idéal pour…', c:['jouer seul (basse marquée)','le métal','les power chords','l\'accordage'], a:0},
      {q:'Drop 2 et drop 3 sont des voicings…', c:['ouverts','fermés','quartaux','suspendus'], a:0}
    ]; const it = rnd(qs);
    const order = it.c.map((c,i)=>i).sort(()=>Math.random()-.5);
    return {q:it.q, choices:order.map(i=>it.c[i]), ans:order.indexOf(it.a), notion:'drop3'}; }},
 bassNote:{name:'Joue la basse', icon:'🎸', cat:['guitar'], skill:'drop2', mic:true, type:'micNote', rounds:6,
  desc:'Rejoue la note la plus grave de l\'accord entendu.',
  gen(d){ const root = 45 + rint(10); const inv = rint(3);
    const notes = inv===0 ? [root, root+4, root+7] : inv===1 ? [root+4, root+7, root+12] : [root+7, root+12, root+16];
    return {q:'Rejoue la note la plus GRAVE', play:notes, replay:true, targetPc:notes[0]%12, notion:'inversions'}; }},
 openvQuiz:{name:'Quiz open voicings', icon:'🌌', cat:['nogtr','quick'], skill:'openv', mic:false, type:'mcq', rounds:5,
  desc:'L\'art d\'aérer les accords.',
  gen(d){ const qs = [
      {q:'Un voicing « ouvert », c\'est…', c:['plus d\'une octave entre les voix extrêmes','un accord avec cordes à vide','un accord sans tierce','un accord de 5 notes'], a:0},
      {q:'Règle d\'orchestration :', c:['graves espacés, aigus resserrés','graves serrés, aigus espacés','tout espacé','tout serré'], a:0},
      {q:'Pourquoi ouvrir un voicing ?', c:['chaque note respire mieux','c\'est plus facile','ça joue plus fort','ça évite les barrés'], a:0},
      {q:'Le voicing guitare idéal :', c:['basse isolée + notes serrées en haut','6 cordes toujours','que des aigus','que des basses'], a:0}
    ]; const it = rnd(qs);
    const order = it.c.map((c,i)=>i).sort(()=>Math.random()-.5);
    return {q:it.q, choices:order.map(i=>it.c[i]), ans:order.indexOf(it.a), notion:'openv'}; }},

 /* --- Quartal --- */
 quartalBuild:{name:'Construis le quartal', icon:'🏗️', cat:['guitar'], skill:'quartal', mic:true, type:'micSet', rounds:4,
  desc:'Empile deux quartes : le son moderne.',
  gen(d){ const r = rint(12);
    return {q:`Accord quartal depuis ${pcFR(r)}`, sub:'Trois notes : +5 cases, puis encore +5',
      pcs:[r, (r+5)%12, (r+10)%12], notion:'quartal'}; }},
 quartalQuiz:{name:'Quiz quartal', icon:'🏗️', cat:['nogtr','quick'], skill:'quartal', mic:false, type:'mcq', rounds:5,
  desc:'Quartes, So What et modernité.',
  gen(d){ if (Math.random() < .4){
      const r = rint(12); const ans = [r,(r+5)%12,(r+10)%12].map(pcFR).join(' · ');
      const opts = [ans, [r,(r+4)%12,(r+7)%12].map(pcFR).join(' · '),
        [r,(r+5)%12,(r+7)%12].map(pcFR).join(' · '), [r,(r+3)%12,(r+10)%12].map(pcFR).join(' · ')].sort(()=>Math.random()-.5);
      return {q:`L'accord quartal depuis ${pcFR(r)} ?`, choices:opts, ans:opts.indexOf(ans), notion:'quartal'};
    }
    const qs = [
      {q:'Un accord quartal empile des…', c:['quartes','tierces','quintes','secondes'], a:0},
      {q:'La guitare est accordée principalement en…', c:['quartes','tierces','quintes','octaves'], a:0},
      {q:'Le « So What chord » vient d\'un disque de…', c:['Miles Davis','AC/DC','Mozart','Daft Punk'], a:0},
      {q:'Les quartaux brillent sur les ambiances…', c:['modales et mineures','très majeures','punk','baroques'], a:0}
    ]; const it = rnd(qs);
    const order = it.c.map((c,i)=>i).sort(()=>Math.random()-.5);
    return {q:it.q, choices:order.map(i=>it.c[i]), ans:order.indexOf(it.a), notion:'quartal'}; }},

 /* --- Analyse --- */
 degreeQuiz:{name:'Les degrés', icon:'🏛️', cat:['nogtr'], skill:'analysis', mic:false, type:'mcq', rounds:8,
  desc:'Quel accord vit au degré demandé ?',
  gen(d){ const root = rint(12); const deg = rint(6);
    const pc = (root + SCALES.maj.iv[deg])%12;
    const minor = [1,2,5].includes(deg);
    const ch = pcChoices(pc);
    return {q:`En ${pcFR(root)} majeur, le degré ${DEGREE_NAMES[deg]}${minor?' (mineur)':''} est…`,
      choices:ch.map(pcFR), ans:ch.indexOf(pc), notion:'deg-'+DEGREE_NAMES[deg]}; }},
 degreePlay:{name:'Joue le degré', icon:'🎼', cat:['guitar'], skill:'analysis', mic:true, type:'micNote', rounds:8,
  desc:'Une tonalité, un degré : joue la note.',
  gen(d){ const root = rint(12); const deg = rint(7);
    return {q:`Tonalité de ${pcFR(root)} majeur : joue le degré ${DEGREE_NAMES[deg]}`,
      targetPc:(root + SCALES.maj.iv[deg])%12, notion:'deg-'+DEGREE_NAMES[deg]}; }},
 earCadence:{name:'La cadence à l\'oreille', icon:'🚪', cat:['ear'], skill:'analysis', mic:false, type:'mcq', rounds:6,
  desc:'Fin de phrase : parfaite ou rompue ?',
  gen(d){ const root = 50 + rint(8); const perfect = Math.random() < .5;
    const I = [root, root+4, root+7], V = [root+7, root+11, root+14], vi = [root+9, root+12, root+16];
    const seq = perfect ? [...V, ...I] : [...V, ...vi];
    return {q:'Cette fin de phrase est…', play:seq, gap:.34, replay:true,
      choices:['Parfaite (V → I) : repos','Rompue (V → vi) : surprise'], ans:perfect?0:1, notion:'cadences'}; }},
 cadenceQuiz:{name:'Quiz des cadences', icon:'📜', cat:['nogtr','quick'], skill:'analysis', mic:false, type:'mcq', rounds:6,
  desc:'La théorie des fins de phrase.',
  gen(d){ const qs = [
      {q:'La cadence parfaite, c\'est…', c:['V → I','IV → V','I → vi','ii → IV'], a:0},
      {q:'La cadence rompue, c\'est…', c:['V → vi','V → I','I → IV','vi → ii'], a:0},
      {q:'La cadence enrichie du jazz :', c:['ii → V → I','I → IV → V','vi → ii → V','I → V → I'], a:0},
      {q:'L\'accord « maison » (repos) est le degré…', c:['I','V','ii','vii°'], a:0},
      {q:'La demi-cadence s\'arrête sur…', c:['V (suspens)','I (repos)','vi','IV'], a:0}
    ]; const it = rnd(qs);
    const order = it.c.map((c,i)=>i).sort(()=>Math.random()-.5);
    return {q:it.q, choices:order.map(i=>it.c[i]), ans:order.indexOf(it.a), notion:'cadences'}; }},
 keyQuiz:{name:'Trouve la tonalité', icon:'🗝️', cat:['nogtr'], skill:'analysis', mic:false, type:'mcq', rounds:6,
  desc:'Des accords → une tonalité.',
  gen(d){ const root = rint(12);
    const degs = [0,3,4,5].sort(()=>Math.random()-.5).slice(0,3);
    const names = degs.map(dg => pcFR((root+SCALES.maj.iv[dg])%12) + ([1,2,5].includes(dg)?'m':''));
    const ch = pcChoices(root);
    return {q:`Une chanson utilise : ${names.join(' · ')}. Sa tonalité probable ?`,
      choices:ch.map(c=>pcFR(c)+' majeur'), ans:ch.indexOf(root), notion:'tonalite'}; }},

 /* --- Réharmonisation --- */
 reharmQuiz:{name:'Quiz réharmonisation', icon:'🎭', cat:['nogtr'], skill:'reharm', mic:false, type:'mcq', rounds:6,
  desc:'Substituer, insérer, éviter : les outils de l\'arrangeur.',
  gen(d){ const k = rint(12); const v = rint(3);
    if (v === 0){
      const ans = (k+1)%12; const ch = pcChoices(ans);
      return {q:`${pcFR((k+2)%12)}m7 – ${pcFR((k+7)%12)}7 – ${pcFR(k)} : remplace le V7 par sa tritonique…`,
        choices:ch.map(pc=>pcFR(pc)+'7'), ans:ch.indexOf(ans), notion:'reharm'};
    }
    if (v === 1){
      const ans = (k+5)%12; const ch = pcChoices(ans);
      return {q:`Note à éviter en mélodie sur ${pcFR(k)}maj7 ?`, choices:ch.map(pcFR), ans:ch.indexOf(ans), notion:'reharm'};
    }
    const good = pcFR((k+1)%12) + ' majeur';
    const opts = [good, pcFR(k)+' majeur', pcFR((k+9)%12)+' mineur', pcFR((k+5)%12)+' majeur'].sort(()=>Math.random()-.5);
    return {q:`La mélodie tient un ${pcFR(k)}. Quel accord NE convient PAS ?`,
      choices:opts, ans:opts.indexOf(good), notion:'reharm'}; }},

 /* --- Gammes & improvisation --- */
 buildScale_maj:{name:'Construis la gamme majeure', icon:'☀️', cat:['guitar'], skill:'improv', mic:true, type:'micSeq', rounds:1,
  desc:'Les 7 notes dans l\'ordre, où tu veux.',
  gen(d){ const root = rint(12); const pcs = SCALES.maj.iv.map(iv=>(root+iv)%12);
    return {q:`Gamme de ${pcFR(root)} majeur`, seq:[...pcs, root], seqPc:true, notion:'scale-maj'}; }},
 buildScale_pmin:{name:'Construis la pentatonique', icon:'⚡', cat:['guitar'], skill:'improv', mic:true, type:'micSeq', rounds:1,
  desc:'Les 5 notes des solos.',
  gen(d){ const root = rint(12); const pcs = SCALES.pmin.iv.map(iv=>(root+iv)%12);
    return {q:`${pcFR(root)} pentatonique mineure`, seq:[...pcs, root], seqPc:true, notion:'scale-pmin'}; }},
 buildScale_dor:{name:'Construis le dorien', icon:'🎨', cat:['guitar'], skill:'improv', mic:true, type:'micSeq', rounds:1,
  desc:'Le mode mineur groovy de Santana.',
  gen(d){ const root = rint(12); const pcs = SCALES.dor.iv.map(iv=>(root+iv)%12);
    return {q:`${pcFR(root)} dorien`, seq:[...pcs, root], seqPc:true, notion:'mode-dor'}; }},
 buildScale_mixo:{name:'Construis le mixolydien', icon:'🎷', cat:['guitar'], skill:'improv', mic:true, type:'micSeq', rounds:1,
  desc:'Le mode majeur bluesy d\'AC/DC.',
  gen(d){ const root = rint(12); const pcs = SCALES.mixo.iv.map(iv=>(root+iv)%12);
    return {q:`${pcFR(root)} mixolydien`, seq:[...pcs, root], seqPc:true, notion:'mode-mixo'}; }},
 completeScale:{name:'Complète la gamme', icon:'🧩', cat:['nogtr','quick'], skill:'improv', mic:false, type:'mcq', rounds:8,
  desc:'Il manque une note : laquelle ?',
  gen(d){ const key = rnd(['maj','min']); const root = rint(12);
    const pcs = SCALES[key].iv.map(iv=>(root+iv)%12);
    const hide = 1 + rint(pcs.length-1);
    const missing = pcs[hide];
    const ch = pcChoices(missing);
    return {q:`${pcFR(root)} ${key==='maj'?'majeur':'mineur'} : ${pcs.map((p,i)=>i===hide?'❓':pcFR(p)).join(' · ')}`,
      choices:ch.map(pcFR), ans:ch.indexOf(missing), notion:'scale-'+key}; }},
 intruder:{name:'Trouve l\'intrus', icon:'🕵️', cat:['nogtr','quick'], skill:'improv', mic:false, type:'mcq', rounds:8,
  desc:'Quelle note n\'appartient PAS à la gamme ?',
  gen(d){ const key = rnd(['maj','min']); const root = rint(12);
    const pcs = SCALES[key].iv.map(iv=>(root+iv)%12);
    const out = (root + rnd([1,3,6,8,10].filter(iv=>!SCALES[key].iv.includes(iv))))%12;
    const shown = [out, ...pcs.sort(()=>Math.random()-.5).slice(0,3)].sort(()=>Math.random()-.5);
    return {q:`Tonalité de ${pcFR(root)} ${key==='maj'?'majeur':'mineur'} : quel est l'intrus ?`,
      choices:shown.map(pcFR), ans:shown.indexOf(out), notion:'scale-'+key}; }},
 modeQuiz:{name:'Quiz des modes', icon:'🎨', cat:['nogtr','quick'], skill:'improv', mic:false, type:'mcq', rounds:6,
  desc:'Reconnaître les modes et leurs usages.',
  gen(d){ const qs = [
      {q:'Le mode dorien démarre sur le degré…', c:['II','I','V','VII'], a:0},
      {q:'Le mode mixolydien démarre sur le degré…', c:['V','II','IV','VI'], a:0},
      {q:'Le mode « majeur bluesy » (AC/DC) est…', c:['Mixolydien','Dorien','Lydien','Phrygien'], a:0},
      {q:'Le mode « mineur groovy » (Santana) est…', c:['Dorien','Mixolydien','Ionien','Locrien'], a:0},
      {q:'Le mode ionien est aussi appelé…', c:['Gamme majeure','Gamme mineure','Pentatonique','Gamme blues'], a:0}
    ]; const it = rnd(qs);
    const order = it.c.map((c,i)=>i).sort(()=>Math.random()-.5);
    return {q:it.q, choices:order.map(i=>it.c[i]), ans:order.indexOf(it.a), notion:'modes'}; }},
 melodyRepeat:{name:'Reproduis la mélodie', icon:'🎶', cat:['guitar','ear'], skill:'improv', mic:true, type:'melody', rounds:5,
  desc:'Écoute 3 à 5 notes, rejoue-les dans l\'ordre.',
  gen(d){ const len = d < .34 ? 3 : d < .67 ? 4 : 5;
    const root = 50 + rint(10);
    const seq = [root];
    for (let i = 1; i < len; i++) seq.push(root + rnd(SCALES.pmin.iv) + (Math.random()<.3?12:0));
    return {q:'Écoute… puis rejoue la mélodie', seq, notion:'melodie'}; }},
 simon:{name:'Simon musical', icon:'🟡', cat:['guitar','ear'], skill:'improv', mic:true, type:'simon', rounds:1,
  desc:'La séquence s\'allonge à chaque tour.',
  gen(d){ const root = 52 + rint(8); return {root, scale:SCALES.pmin.iv, notion:'melodie'}; }},
 improv:{name:'Impro guidée', icon:'🎤', cat:['guitar'], skill:'improv', mic:true, type:'improv', rounds:1,
  desc:'45 secondes d\'impro : reste dans la gamme !',
  gen(d){ const root = rint(12);
    return {q:`Improvise en ${pcFR(root)} pentatonique mineure`, root, iv:SCALES.pmin.iv, dur:45, notion:'scale-pmin'}; }},
 exam:{name:'Examen final', icon:'👑', cat:['exam'], skill:'mastery', mic:true, type:'exam', rounds:20,
  desc:'20 questions sur tout le parcours. 80 % = couronne.',
  gen(d){ return null; }}
};

