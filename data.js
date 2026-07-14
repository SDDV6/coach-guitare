"use strict";
/* ============================================================
   DATA — théorie musicale, parcours, jeux, badges, schémas SVG
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
const rnd = a => a[Math.floor(Math.random()*a.length)];
const rint = n => Math.floor(Math.random()*n);

/* ============ Schémas SVG (illustrations intégrées) ============ */
const DG = {};
// Escalier de la gamme majeure (formule 2-2-1-2-2-2-1)
DG.formula = function(){
  const steps = [2,2,1,2,2,2,1], labels = ['Do','Ré','Mi','Fa','Sol','La','Si','Do'];
  let x = 20, y = 150, out = '';
  for (let i = 0; i < 8; i++){
    out += `<rect x="${x}" y="${y-28}" width="44" height="28" rx="6" fill="${i===0||i===7?'#f6a92c':'#5ba7f7'}"/>` +
           `<text x="${x+22}" y="${y-9}" text-anchor="middle" font-size="13" font-weight="700" fill="#14161c">${labels[i]}</text>`;
    if (i < 7){
      out += `<text x="${x+58}" y="${y-38}" text-anchor="middle" font-size="11" fill="${steps[i]===1?'#f97362':'#8d95a8'}" font-weight="600">${steps[i]===1?'½ ton':'1 ton'}</text>`;
      x += 50; y -= steps[i]*14;
    }
  }
  return `<svg viewBox="0 0 420 170" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
};
// Échelle des intervalles
DG.intervals = function(){
  const rows = [[12,'Octave','#a78bfa'],[7,'Quinte','#5ba7f7'],[5,'Quarte','#4ade80'],[4,'Tierce maj.','#f6a92c'],[3,'Tierce min.','#f97362'],[2,'Seconde','#8d95a8']];
  let out = '';
  rows.forEach(([s,n,c],i) => {
    const y = 18 + i*26, w = s*24;
    out += `<rect x="90" y="${y}" width="${w}" height="16" rx="8" fill="${c}"/>` +
           `<text x="84" y="${y+12}" text-anchor="end" font-size="11" fill="#8d95a8">${n}</text>` +
           `<text x="${96+w}" y="${y+12}" font-size="11" fill="#eef0f4" font-weight="600">${s} cases</text>`;
  });
  return `<svg viewBox="0 0 420 180" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
};
// Construction d'une triade (empilement de tierces)
DG.triad = function(){
  const blocks = [
    [150,'Quinte (7 cases)','#a78bfa',30],[150,'+ 3 cases','',0],
    [90,'Tierce (4 cases)','#4ade80',90],[90,'+ 4 cases','',0],
    [30,'Fondamentale','#f6a92c',150]
  ];
  return `<svg viewBox="0 0 420 200" xmlns="http://www.w3.org/2000/svg">
    <rect x="120" y="140" width="180" height="40" rx="9" fill="#f6a92c"/>
    <text x="210" y="165" text-anchor="middle" font-size="14" font-weight="700" fill="#14161c">Fondamentale (1)</text>
    <rect x="120" y="82" width="180" height="40" rx="9" fill="#4ade80"/>
    <text x="210" y="107" text-anchor="middle" font-size="14" font-weight="700" fill="#14161c">Tierce (3)</text>
    <rect x="120" y="24" width="180" height="40" rx="9" fill="#a78bfa"/>
    <text x="210" y="49" text-anchor="middle" font-size="14" font-weight="700" fill="#14161c">Quinte (5)</text>
    <text x="330" y="135" font-size="11" fill="#8d95a8">majeur : +4 cases</text>
    <text x="330" y="150" font-size="11" fill="#8d95a8">mineur : +3 cases</text>
    <text x="330" y="77" font-size="11" fill="#8d95a8">majeur : +3 cases</text>
    <text x="330" y="92" font-size="11" fill="#8d95a8">mineur : +4 cases</text>
  </svg>`;
};
// Cercle des quintes
DG.circle = function(){
  const notes = ['Do','Sol','Ré','La','Mi','Si','Fa#','Do#','Sol#','Ré#','La#','Fa'];
  let out = '';
  for (let i = 0; i < 12; i++){
    const a = i*Math.PI/6 - Math.PI/2;
    const x = 160 + Math.cos(a)*118, y = 140 + Math.sin(a)*118;
    const main = i <= 5 || i === 11;
    out += `<circle cx="${x}" cy="${y}" r="22" fill="${i===0?'#f6a92c':(main?'#1c1f27':'#14161c')}" stroke="${i===0?'#f6a92c':'#323744'}" stroke-width="2"/>` +
           `<text x="${x}" y="${y+5}" text-anchor="middle" font-size="13" font-weight="700" fill="${i===0?'#14161c':'#eef0f4'}">${notes[i]}</text>`;
  }
  out += `<text x="160" y="132" text-anchor="middle" font-size="12" fill="#8d95a8">sens horaire :</text>
          <text x="160" y="150" text-anchor="middle" font-size="12" fill="#f6a92c" font-weight="700">+ une quinte</text>`;
  return `<svg viewBox="0 0 320 285" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
};
// Portée + clef de Sol
DG.staff = function(){
  let out = '';
  for (let i = 0; i < 5; i++) out += `<line x1="60" y1="${40+i*18}" x2="400" y2="${40+i*18}" stroke="#5c6476" stroke-width="1.6"/>`;
  out += `<text x="30" y="102" font-size="82" fill="#f6a92c">𝄞</text>`;
  const notes = [['Mi',112],['Fa',103],['Sol',94],['La',85],['Si',76],['Do',67],['Ré',58],['Mi',49],['Fa',40]];
  notes.forEach(([n,y],i) => {
    const x = 130 + i*30;
    out += `<ellipse cx="${x}" cy="${y}" rx="9" ry="6.5" fill="${n==='Sol'&&y===94?'#f6a92c':'#eef0f4'}"/>` +
           `<text x="${x}" y="132" text-anchor="middle" font-size="11" fill="#8d95a8">${n}</text>`;
  });
  return `<svg viewBox="0 0 430 145" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
};
// Valeurs rythmiques
DG.rhythm = function(){
  const rows = [['Ronde','4 temps',1],['Blanche','2 temps',2],['Noire','1 temps',4],['Croche','½ temps',8]];
  let out = '';
  rows.forEach(([n,d,count],r) => {
    const y = 26 + r*40;
    out += `<text x="10" y="${y+5}" font-size="12" fill="#8d95a8">${n}</text><text x="360" y="${y+5}" font-size="11" fill="#5c6476">${d}</text>`;
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
// Famille d'accords d'une tonalité
DG.degrees = function(){
  const items = [['I','Maj','#f6a92c'],['ii','min','#5ba7f7'],['iii','min','#5ba7f7'],['IV','Maj','#f6a92c'],['V','Maj','#f97362'],['vi','min','#a78bfa'],['vii°','dim','#5c6476']];
  let out = '';
  items.forEach(([d,q,c],i) => {
    const x = 12 + i*58;
    out += `<rect x="${x}" y="30" width="50" height="56" rx="10" fill="#1c1f27" stroke="${c}" stroke-width="2"/>` +
           `<text x="${x+25}" y="55" text-anchor="middle" font-size="16" font-weight="700" fill="${c}">${d}</text>` +
           `<text x="${x+25}" y="74" text-anchor="middle" font-size="11" fill="#8d95a8">${q}</text>`;
  });
  out += `<text x="215" y="16" text-anchor="middle" font-size="12" fill="#8d95a8">Les 7 accords « compatibles » d'une tonalité majeure</text>`;
  return `<svg viewBox="0 0 430 100" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
};

/* ============ Le Parcours — 16 étapes ============ */
const PATH = [
 {id:'discover', icon:'🌱', name:'Découverte',
  desc:'Les 12 notes et la règle d\'or du manche.',
  lessons:[
   {t:'Les 12 notes', x:`Il n'existe que <b>12 notes</b>, en boucle : Do, Do#, Ré, Ré#, Mi, Fa, Fa#, Sol, Sol#, La, La#, Si. Piège : entre <b>Mi et Fa</b> et entre <b>Si et Do</b>, pas de dièse.`, try:'findNote'},
   {t:'La règle d\'or', x:`Sur la guitare, <b>1 case = 1 demi-ton</b> et 2 cases = 1 ton. À la <b>case 12</b>, la note de départ revient, une octave plus haut. Les repères du manche : cases 3, 5, 7, 9 et 12.`, try:'reverseQuiz'},
   {t:'Les positions', x:`Une « <b>position</b> », c'est la case où joue ton index : en 5e position, l'index gère la case 5, les autres doigts les cases 6, 7 et 8. C'est comme ça qu'on s'organise sur le manche.`}
  ],
  games:['findNote','reverseQuiz'], badge:{icon:'🌱', name:'Premier pas'}},

 {id:'fretboard', icon:'🧭', name:'Notes du manche',
  desc:'Trouver n\'importe quelle note, sur n\'importe quelle corde.',
  lessons:[
   {t:'Cordes à vide', x:`De la plus grosse à la plus fine : <b>Mi, La, Ré, Sol, Si, Mi</b>. Retiens-les : chaque corde à vide est ton point de départ pour compter les cases.`, try:'findNote'},
   {t:'L\'octave miroir', x:`La même note existe à <b>plusieurs endroits</b> du manche. Astuce : +2 cordes et +2 cases (depuis les cordes graves) = la même note à l'octave.`, try:'octaves'}
  ],
  games:['findNote','reverseQuiz','octaves','speedNotes'], badge:{icon:'🧭', name:'Cartographe'}},

 {id:'intervals', icon:'📏', name:'Intervalles',
  desc:'La distance entre deux notes : le vocabulaire de toute la musique.',
  lessons:[
   {t:'Compter en cases', x:`Un intervalle = une <b>distance en demi-tons</b> (cases). Les stars : tierce mineure = <b>3</b>, tierce majeure = <b>4</b>, quarte = <b>5</b>, quinte = <b>7</b>, octave = <b>12</b>.`, dg:'intervals', try:'buildInterval'},
   {t:'La couleur des tierces', x:`La tierce donne l'émotion : <b>majeure (4 cases) = joyeux</b>, <b>mineure (3 cases) = mélancolique</b>. Ton oreille les connaît déjà — mets-leur un nom.`, try:'earInterval'}
  ],
  games:['buildInterval','semitones','earInterval'], badge:{icon:'📏', name:'Arpenteur'}},

 {id:'scalesMaj', icon:'☀️', name:'Gammes majeures',
  desc:'La recette 2-2-1-2-2-2-1, mère de toute la théorie.',
  lessons:[
   {t:'La formule magique', x:`Une gamme majeure = 7 notes choisies avec la recette <b>ton, ton, ½, ton, ton, ton, ½</b>. Elle marche depuis n'importe quelle note de départ.`, dg:'formula', try:'buildScale_maj'},
   {t:'Sur une corde', x:`Pour la <b>voir</b> : joue-la sur une seule corde — cases 0, 2, 4, 5, 7, 9, 11, 12. Puis apprends-la « en position » : même son, moins de déplacements.`}
  ],
  games:['buildScale_maj','completeScale','intruder'], badge:{icon:'☀️', name:'Soleil levant'}},

 {id:'scalesMin', icon:'🌙', name:'Gammes mineures',
  desc:'Le côté mélancolique, et sa parenté cachée avec le majeur.',
  lessons:[
   {t:'La formule mineure', x:`Gamme mineure naturelle : <b>2-1-2-2-1-2-2</b>. Trois notes changent par rapport au majeur — c'est ce qui assombrit tout.`, try:'buildScale_min'},
   {t:'La relative', x:`Chaque gamme majeure cache une <b>mineure relative</b> : mêmes notes, autre point de départ (le VI<sup>e</sup> degré). La mineure de Do majeur, c'est La mineur. Deux ambiances, une seule famille de notes.`}
  ],
  games:['buildScale_min','completeScale','intruder'], badge:{icon:'🌙', name:'Clair-obscur'}},

 {id:'penta', icon:'⚡', name:'Pentatoniques',
  desc:'5 notes, zéro fausse note : l\'arme des solos.',
  lessons:[
   {t:'5 notes suffisent', x:`Retire 2 notes de la gamme : voilà la <b>pentatonique</b>, la gamme de 90 % des solos rock et blues. Impossible de sonner faux tant que tu restes dedans.`, try:'buildScale_pmin'},
   {t:'Ta première impro', x:`Choisis La pentatonique mineure, lance le métronome, et joue <b>ce que tu veux</b> avec ces 5 notes. C'est ça, improviser.`, try:'improv'}
  ],
  games:['buildScale_pmin','improv','melodyRepeat'], badge:{icon:'⚡', name:'Soliste'}},

 {id:'triads', icon:'🔺', name:'Triades',
  desc:'3 notes qui font un accord : fondamentale, tierce, quinte.',
  lessons:[
   {t:'L\'empilement', x:`Une triade = <b>fondamentale + tierce + quinte</b> (1-3-5). Accord = les 3 ensemble ; arpège = les 3 l'une après l'autre.`, dg:'triad', try:'buildChord_triad'},
   {t:'Majeur ou mineur ?', x:`Seule la <b>tierce</b> change : à 4 cases = majeur (joyeux), à 3 cases = mineur (sombre). La quinte, elle, ne bouge pas.`, try:'earMajMin'}
  ],
  games:['buildChord_triad','earMajMin','findThird'], badge:{icon:'🔺', name:'Architecte'}},

 {id:'chords', icon:'🎸', name:'Accords',
  desc:'Des triades aux accords complets que tu grattes.',
  lessons:[
   {t:'6 cordes, 3 notes', x:`Quand tu grattes un accord ouvert, tu joues les <b>3 notes de la triade, doublées</b> à plusieurs octaves. Rien de plus.`, try:'buildChord_triad'},
   {t:'Sus2 et sus4', x:`Remplace la tierce par la seconde (<b>sus2</b>) ou la quarte (<b>sus4</b>) : l'accord devient « suspendu », ni joyeux ni triste — il appelle une résolution.`, try:'buildChord_sus'}
  ],
  games:['buildChord_triad','buildChord_sus','findRoot','chordTones'], badge:{icon:'🎸', name:'Rythmicien'}},

 {id:'chords7', icon:'7️⃣', name:'Accords 7',
  desc:'La 4e note qui apporte le blues, le jazz et la soul.',
  lessons:[
   {t:'Une tierce de plus', x:`Empile encore une tierce : <b>1-3-5-7</b>. Quatre couleurs : <b>maj7</b> (doux), <b>m7</b> (soul), <b>7</b> (bluesy, instable), <b>m7♭5</b> (tendu).`, try:'buildChord_7'},
   {t:'Le pouvoir du V7', x:`L'accord <b>7 de dominante</b> « pousse » vers l'accord suivant. C'est le moteur du blues et de mille chansons. Écoute cette tension → résolution.`}
  ],
  games:['buildChord_7','seventhQuiz','blues'], badge:{icon:'7️⃣', name:'Bluesman'}},

 {id:'inversions', icon:'🔄', name:'Renversements',
  desc:'Le même accord, la basse en plus — trois visages d\'une triade.',
  lessons:[
   {t:'Changer la basse', x:`Un accord n'est pas obligé de commencer par sa fondamentale. Tierce à la basse = <b>1er renversement</b>, quinte à la basse = <b>2e renversement</b>. Mêmes notes, couleur différente.`, try:'inversionQuiz'},
   {t:'Pourquoi c\'est utile', x:`Les renversements permettent d'enchaîner les accords <b>sans sauter</b> sur le manche : la basse se déplace d'une ou deux cases au lieu de cinq.`}
  ],
  games:['inversionQuiz','bassNote'], badge:{icon:'🔄', name:'Équilibriste'}},

 {id:'functions', icon:'🏛️', name:'Fonctions harmoniques',
  desc:'Pourquoi certains accords vont ensemble : les degrés.',
  lessons:[
   {t:'La famille de 7', x:`Les 7 notes d'une gamme donnent <b>7 accords compatibles</b> : I, ii, iii, IV, V, vi, vii°. Majuscule = majeur, minuscule = mineur.`, dg:'degrees', try:'degreeQuiz'},
   {t:'Les 3 piliers', x:`<b>I</b> = la maison (repos), <b>IV</b> = le voyage, <b>V</b> = la tension qui ramène à la maison. La plupart des chansons vivent avec ces trois-là + le <b>vi</b>.`, try:'degreePlay'}
  ],
  games:['degreeQuiz','degreePlay','blues'], badge:{icon:'🏛️', name:'Harmoniste'}},

 {id:'cadences', icon:'🚪', name:'Cadences',
  desc:'Les fins de phrase de la musique : tension et résolution.',
  lessons:[
   {t:'La cadence parfaite', x:`<b>V → I</b> : la tension qui rentre à la maison. C'est la fin de phrase la plus forte de la musique occidentale.`, try:'earCadence'},
   {t:'La surprise', x:`<b>V → vi</b> : la cadence « rompue ». L'oreille attendait la maison… et atterrit sur le voisin mineur. Effet de surprise garanti.`}
  ],
  games:['earCadence','cadenceQuiz'], badge:{icon:'🚪', name:'Conteur'}},

 {id:'modes', icon:'🎨', name:'Modes',
  desc:'7 ambiances cachées dans une seule gamme.',
  lessons:[
   {t:'Changer de point de vue', x:`Joue les notes de Do majeur en partant de <b>Ré</b> : c'est le mode <b>dorien</b> (mineur groovy). En partant de <b>Sol</b> : <b>mixolydien</b> (majeur bluesy). Mêmes notes, ambiance neuve.`, try:'buildScale_dor'},
   {t:'Les 2 modes à connaître', x:`Pour le rock : <b>dorien</b> (Santana, Pink Floyd) et <b>mixolydien</b> (AC/DC, blues-rock). Les autres viendront tout seuls après.`}
  ],
  games:['buildScale_dor','buildScale_mixo','modeQuiz'], badge:{icon:'🎨', name:'Coloriste'}},

 {id:'improv', icon:'🎤', name:'Improvisation',
  desc:'Tout relier : jouer TES phrases en toute liberté.',
  lessons:[
   {t:'Phrase = respiration', x:`Une impro n'est pas un flot de notes : c'est des <b>phrases</b> avec des silences, comme une conversation. Joue 3-4 notes, respire, réponds-toi.`, try:'improv'},
   {t:'Viser les notes de l\'accord', x:`Le secret des pros : atterrir sur une note de <b>l'accord en cours</b> (1, 3 ou 5) aux moments forts. Entre les deux, tout est permis.`, try:'melodyRepeat'}
  ],
  games:['improv','melodyRepeat','simon'], badge:{icon:'🎤', name:'Improvisateur'}},

 {id:'analysis', icon:'🔬', name:'Analyse harmonique',
  desc:'Entendre une chanson et comprendre ce qui s\'y passe.',
  lessons:[
   {t:'Trouver la tonalité', x:`Joue les notes d'une chanson : celle qui sonne « à la maison » est la <b>tonique</b>. Le Studio te propose la tonalité probable en direct pendant que tu joues.`},
   {t:'Le cercle des quintes', x:`La carte du musicien : chaque pas horaire = <b>une quinte</b>. Les tonalités voisines sur le cercle partagent presque toutes leurs notes — c'est pour ça qu'elles s'enchaînent si bien.`, dg:'circle', try:'keyQuiz'}
  ],
  games:['keyQuiz','degreeQuiz','earCadence'], badge:{icon:'🔬', name:'Détective'}},

 {id:'mastery', icon:'👑', name:'Maîtrise complète',
  desc:'L\'examen final : tout, mélangé, sans filet.',
  lessons:[
   {t:'Le grand examen', x:`20 questions tirées de <b>tout le parcours</b>, guitare en main et à l'oreille. 80 % de réussite = couronne. Tu peux le repasser autant de fois que tu veux.`, try:'exam'}
  ],
  games:['exam','simon','improv'], badge:{icon:'👑', name:'Maître du manche'}}
];

/* ============ Badges globaux ============ */
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
  {id:'survivor',icon:'💀', name:'Survivant',         desc:'15 bonnes réponses en mode survie'}
];

/* ============ Jeux ============ */
/* Chaque jeu : type de mécanique + générateur de question.
   d = difficulté 0..1 (selon la maîtrise de la compétence). */
function gStrings(d){ return QUIZ_STRINGS.slice(0, d < .34 ? 2 : d < .67 ? 4 : 6); }
function gFrets(d){ return d < .34 ? 5 : d < .67 ? 9 : 12; }

const GAMES = {
 findNote:{name:'Trouve la note', icon:'🎯', cat:['guitar','quick'], skill:'fretboard', mic:true, type:'micNote', rounds:8,
  desc:'Je te donne une note et une corde : trouve la case.',
  gen(d){ const s = rnd(gStrings(d)), fret = rint(gFrets(d)+1), m = s.midi+fret;
    return {q:`Joue ${pcFR(m%12)} sur la corde de ${s.name}`, targetMidi:m, open:s.midi,
      notion:'note-'+pcEN(m%12)}; }},

 octaves:{name:'Chasse aux octaves', icon:'🪞', cat:['guitar'], skill:'fretboard', mic:true, type:'micSet', rounds:5,
  desc:'Trouve la même note à plusieurs octaves.',
  gen(d){ const pc = rint(12); const n = d < .5 ? 2 : 3;
    return {q:`Joue ${pcFR(pc)} dans ${n} octaves différentes`, sub:'N\'importe quelles cordes', pc, needCount:n, distinctMidi:true, notion:'octaves'}; }},

 speedNotes:{name:'Notes chrono', icon:'⏱️', cat:['guitar','quick'], skill:'fretboard', mic:true, type:'micNote', rounds:10, timer:60,
  desc:'Un maximum de notes justes en 60 secondes.',
  gen(d){ const s = rnd(gStrings(Math.min(1,d+.2))), fret = rint(gFrets(d)+1), m = s.midi+fret;
    return {q:`${pcFR(m%12)} — corde de ${s.name}`, targetMidi:m, open:s.midi, notion:'note-'+pcEN(m%12)}; }},

 reverseQuiz:{name:'Quiz du manche', icon:'🧠', cat:['nogtr','quick'], skill:'fretboard', mic:false, type:'mcq', rounds:8,
  desc:'Quelle note se cache à cette case ? (sans guitare)',
  gen(d){ const s = rnd(gStrings(d)), fret = rint(gFrets(d)+1), pc = (s.midi+fret)%12;
    const choices = [pc]; while (choices.length < 4){ const c = rint(12); if (!choices.includes(c)) choices.push(c); }
    choices.sort(() => Math.random()-.5);
    return {q:`Corde de ${s.name}, case ${fret} : quelle note ?`, choices:choices.map(pcFR), ans:choices.indexOf(pc), notion:'note-'+pcEN(pc)}; }},

 buildInterval:{name:'Construis l\'intervalle', icon:'📏', cat:['guitar'], skill:'intervals', mic:true, type:'micNote', rounds:8,
  desc:'Pars d\'une note, monte du bon nombre de cases.',
  gen(d){ const ivs = d < .4 ? INTERVALS.filter(i=>[3,4,5,7,12].includes(i.s)) : INTERVALS;
    const iv = rnd(ivs); const root = 45 + rint(15);
    return {q:`Depuis ${pcFR(root%12)}, joue une ${iv.n}`, sub:`(+${iv.s} cases, n'importe où)`, targetPc:(root+iv.s)%12, playFirst:[root], notion:'iv-'+iv.s}; }},

 semitones:{name:'Compte les cases', icon:'🔢', cat:['nogtr','quick'], skill:'intervals', mic:false, type:'mcq', rounds:8,
  desc:'Combien de demi-tons dans cet intervalle ?',
  gen(d){ const iv = rnd(INTERVALS);
    const choices = [iv.s]; while (choices.length < 4){ const c = 1+rint(12); if (!choices.includes(c)) choices.push(c); }
    choices.sort((a,b)=>a-b);
    return {q:`Une ${iv.n} = combien de cases ?`, choices:choices.map(String), ans:choices.indexOf(iv.s), notion:'iv-'+iv.s}; }},

 earInterval:{name:'L\'intervalle à l\'oreille', icon:'👂', cat:['ear'], skill:'intervals', mic:false, type:'mcq', rounds:8,
  desc:'Deux notes jouées : quel est l\'intervalle ?',
  gen(d){ const pool = d < .4 ? INTERVALS.filter(i=>[3,4,7,12].includes(i.s)) : INTERVALS;
    const iv = rnd(pool); const root = 52 + rint(12);
    const wrong = pool.filter(i=>i.s!==iv.s).sort(()=>Math.random()-.5).slice(0,3);
    const opts = [iv,...wrong].sort(()=>Math.random()-.5);
    return {q:'Quel est cet intervalle ?', play:[root, root+iv.s], replay:true,
      choices:opts.map(o=>o.n), ans:opts.indexOf(iv), notion:'iv-'+iv.s}; }},

 buildScale_maj:{name:'Construis la gamme majeure', icon:'☀️', cat:['guitar'], skill:'scalesMaj', mic:true, type:'micSeq', rounds:1,
  desc:'Joue les 7 notes dans l\'ordre, où tu veux.',
  gen(d){ const root = rint(12); const pcs = SCALES.maj.iv.map(iv=>(root+iv)%12);
    return {q:`Gamme de ${pcFR(root)} majeur`, seq:[...pcs, root], seqPc:true, notion:'scale-maj'}; }},

 buildScale_min:{name:'Construis la gamme mineure', icon:'🌙', cat:['guitar'], skill:'scalesMin', mic:true, type:'micSeq', rounds:1,
  desc:'La formule 2-1-2-2-1-2-2, note par note.',
  gen(d){ const root = rint(12); const pcs = SCALES.min.iv.map(iv=>(root+iv)%12);
    return {q:`Gamme de ${pcFR(root)} mineur`, seq:[...pcs, root], seqPc:true, notion:'scale-min'}; }},

 buildScale_pmin:{name:'Construis la pentatonique', icon:'⚡', cat:['guitar'], skill:'penta', mic:true, type:'micSeq', rounds:1,
  desc:'Les 5 notes des solos, dans l\'ordre.',
  gen(d){ const root = rint(12); const pcs = SCALES.pmin.iv.map(iv=>(root+iv)%12);
    return {q:`${pcFR(root)} pentatonique mineure`, seq:[...pcs, root], seqPc:true, notion:'scale-pmin'}; }},

 buildScale_dor:{name:'Construis le dorien', icon:'🎨', cat:['guitar'], skill:'modes', mic:true, type:'micSeq', rounds:1,
  desc:'Le mode mineur groovy de Santana.',
  gen(d){ const root = rint(12); const pcs = SCALES.dor.iv.map(iv=>(root+iv)%12);
    return {q:`${pcFR(root)} dorien`, seq:[...pcs, root], seqPc:true, notion:'mode-dor'}; }},

 buildScale_mixo:{name:'Construis le mixolydien', icon:'🎷', cat:['guitar'], skill:'modes', mic:true, type:'micSeq', rounds:1,
  desc:'Le mode majeur bluesy d\'AC/DC.',
  gen(d){ const root = rint(12); const pcs = SCALES.mixo.iv.map(iv=>(root+iv)%12);
    return {q:`${pcFR(root)} mixolydien`, seq:[...pcs, root], seqPc:true, notion:'mode-mixo'}; }},

 completeScale:{name:'Complète la gamme', icon:'🧩', cat:['nogtr','quick'], skill:'scalesMaj', mic:false, type:'mcq', rounds:8,
  desc:'Il manque une note : laquelle ?',
  gen(d){ const key = rnd(['maj','min']); const root = rint(12);
    const pcs = SCALES[key].iv.map(iv=>(root+iv)%12);
    const hide = 1 + rint(pcs.length-1);
    const missing = pcs[hide];
    const choices = [missing]; while (choices.length < 4){ const c = rint(12); if (!choices.includes(c)) choices.push(c); }
    choices.sort(() => Math.random()-.5);
    return {q:`${pcFR(root)} ${key==='maj'?'majeur':'mineur'} : ${pcs.map((p,i)=>i===hide?'❓':pcFR(p)).join(' · ')}`,
      choices:choices.map(pcFR), ans:choices.indexOf(missing), notion:'scale-'+key}; }},

 intruder:{name:'Trouve l\'intrus', icon:'🕵️', cat:['nogtr','quick'], skill:'scalesMaj', mic:false, type:'mcq', rounds:8,
  desc:'Quelle note n\'appartient PAS à la gamme ?',
  gen(d){ const key = rnd(['maj','min']); const root = rint(12);
    const pcs = SCALES[key].iv.map(iv=>(root+iv)%12);
    const out = (root + rnd([1,3,6,8,10].filter(iv=>!SCALES[key].iv.includes(iv))))%12;
    const shown = [out, ...pcs.sort(()=>Math.random()-.5).slice(0,3)].sort(()=>Math.random()-.5);
    return {q:`Tonalité de ${pcFR(root)} ${key==='maj'?'majeur':'mineur'} : quel est l'intrus ?`,
      choices:shown.map(pcFR), ans:shown.indexOf(out), notion:'scale-'+key}; }},

 buildChord_triad:{name:'Construis l\'accord', icon:'🔺', cat:['guitar'], skill:'triads', mic:true, type:'micSet', rounds:4,
  desc:'Les 3 notes de la triade, une par une.',
  gen(d){ const type = rnd(['Majeur','Mineur']); const root = rint(12);
    const pcs = CHORDS[type].iv.map(iv=>(root+iv)%12);
    return {q:`${pcFR(root)} ${type}`, sub:'Joue ses 3 notes (dans n\'importe quel ordre)', pcs, notion:'chord-'+(type==='Majeur'?'maj':'min')}; }},

 buildChord_sus:{name:'Accords suspendus', icon:'⏸️', cat:['guitar'], skill:'chords', mic:true, type:'micSet', rounds:4,
  desc:'Sus2 et sus4 : la tierce remplacée.',
  gen(d){ const type = rnd(['Sus2','Sus4']); const root = rint(12);
    const pcs = CHORDS[type].iv.map(iv=>(root+iv)%12);
    return {q:`${pcFR(root)} ${type.toLowerCase()}`, sub:'Joue ses 3 notes', pcs, notion:'chord-sus'}; }},

 buildChord_7:{name:'Construis l\'accord 7', icon:'7️⃣', cat:['guitar'], skill:'chords7', mic:true, type:'micSet', rounds:4,
  desc:'Les 4 notes des accords de septième.',
  gen(d){ const type = rnd(['7 (dominante)','Majeur 7','Mineur 7']); const root = rint(12);
    const pcs = CHORDS[type].iv.map(iv=>(root+iv)%12);
    return {q:`${pcFR(root)} ${type}`, sub:'Joue ses 4 notes', pcs, notion:'chord-7'}; }},

 earMajMin:{name:'Majeur ou mineur ?', icon:'🌗', cat:['ear','quick'], skill:'triads', mic:false, type:'mcq', rounds:8,
  desc:'Un accord arpégé : joyeux ou mélancolique ?',
  gen(d){ const maj = Math.random() < .5; const root = 50 + rint(12);
    const ivs = maj ? [0,4,7] : [0,3,7];
    return {q:'Cet accord est…', play:ivs.map(iv=>root+iv), replay:true,
      choices:['Majeur 😊','Mineur 🌧️'], ans:maj?0:1, notion:maj?'chord-maj':'chord-min'}; }},

 findThird:{name:'Trouve la tierce', icon:'🎯', cat:['guitar','ear'], skill:'triads', mic:true, type:'micNote', rounds:6,
  desc:'J\'arpège un accord : rejoue sa tierce.',
  gen(d){ const maj = Math.random() < .5; const root = 48 + rint(12);
    const ivs = maj ? [0,4,7] : [0,3,7];
    return {q:'Joue la TIERCE de cet accord', sub:maj?'(accord majeur)':'(accord mineur)',
      play:ivs.map(iv=>root+iv), replay:true, targetPc:(root+(maj?4:3))%12, notion:'deg-tierce'}; }},

 findRoot:{name:'Trouve la fondamentale', icon:'🏠', cat:['guitar','ear'], skill:'chords', mic:true, type:'micNote', rounds:6,
  desc:'J\'arpège un accord : rejoue sa note maison.',
  gen(d){ const type = rnd(['Majeur','Mineur','7 (dominante)']); const root = 48 + rint(12);
    return {q:'Joue la FONDAMENTALE de cet accord', play:CHORDS[type].iv.map(iv=>root+iv), replay:true,
      targetPc:root%12, notion:'deg-fondamentale'}; }},

 chordTones:{name:'1, 3 ou 5 ?', icon:'🎲', cat:['nogtr','quick'], skill:'chords', mic:false, type:'mcq', rounds:8,
  desc:'Quelle est la fonction de cette note dans l\'accord ?',
  gen(d){ const type = rnd(['Majeur','Mineur']); const root = rint(12);
    const which = rnd([0,1,2]);
    const pc = (root + CHORDS[type].iv[which])%12;
    return {q:`Dans ${pcFR(root)} ${type}, la note ${pcFR(pc)} est…`,
      choices:['La fondamentale (1)','La tierce (3)','La quinte (5)'], ans:which, notion:'deg-fonctions'}; }},

 seventhQuiz:{name:'Quelle septième ?', icon:'🃏', cat:['ear'], skill:'chords7', mic:false, type:'mcq', rounds:6,
  desc:'maj7, m7 ou 7 : reconnais la couleur.',
  gen(d){ const types = ['Majeur 7','Mineur 7','7 (dominante)'];
    const ti = rint(3); const root = 48 + rint(12);
    return {q:'Quelle couleur d\'accord ?', play:CHORDS[types[ti]].iv.map(iv=>root+iv), replay:true,
      choices:['Majeur 7 (doux)','Mineur 7 (soul)','7 dominante (bluesy)'], ans:ti, notion:'chord-7'}; }},

 inversionQuiz:{name:'Quelle basse ?', icon:'🔄', cat:['ear'], skill:'inversions', mic:false, type:'mcq', rounds:6,
  desc:'Position fondamentale ou renversement ?',
  gen(d){ const root = 48 + rint(10); const inv = rint(3);
    const iv = [0,4,7];
    const notes = inv===0 ? [root, root+4, root+7] : inv===1 ? [root+4, root+7, root+12] : [root+7, root+12, root+16];
    return {q:'Cet accord majeur est joué…', play:notes, replay:true,
      choices:['Fondamentale à la basse','1er renversement (tierce)','2e renversement (quinte)'], ans:inv, notion:'inversions'}; }},

 bassNote:{name:'Joue la basse', icon:'🎸', cat:['guitar'], skill:'inversions', mic:true, type:'micNote', rounds:6,
  desc:'Rejoue la note la plus grave de l\'accord entendu.',
  gen(d){ const root = 45 + rint(10); const inv = rint(3);
    const notes = inv===0 ? [root, root+4, root+7] : inv===1 ? [root+4, root+7, root+12] : [root+7, root+12, root+16];
    return {q:'Rejoue la note la plus GRAVE', play:notes, replay:true, targetPc:notes[0]%12, notion:'inversions'}; }},

 degreeQuiz:{name:'Les degrés', icon:'🏛️', cat:['nogtr'], skill:'functions', mic:false, type:'mcq', rounds:8,
  desc:'Quel accord vit au degré demandé ?',
  gen(d){ const root = rint(12); const deg = rint(6);
    const pc = (root + SCALES.maj.iv[deg])%12;
    const minor = [1,2,5].includes(deg);
    const choices = [pc]; while (choices.length < 4){ const c = rint(12); if (!choices.includes(c)) choices.push(c); }
    choices.sort(() => Math.random()-.5);
    return {q:`En ${pcFR(root)} majeur, le degré ${DEGREE_NAMES[deg]}${minor?' (mineur)':''} est…`,
      choices:choices.map(pcFR), ans:choices.indexOf(pc), notion:'deg-'+DEGREE_NAMES[deg]}; }},

 degreePlay:{name:'Joue le degré', icon:'🎼', cat:['guitar'], skill:'functions', mic:true, type:'micNote', rounds:8,
  desc:'Je te donne une tonalité et un degré : joue la note.',
  gen(d){ const root = rint(12); const deg = rint(7);
    return {q:`Tonalité de ${pcFR(root)} majeur : joue le degré ${DEGREE_NAMES[deg]}`,
      targetPc:(root + SCALES.maj.iv[deg])%12, notion:'deg-'+DEGREE_NAMES[deg]}; }},

 earCadence:{name:'La cadence à l\'oreille', icon:'🚪', cat:['ear'], skill:'cadences', mic:false, type:'mcq', rounds:6,
  desc:'Fin de phrase : parfaite ou rompue ?',
  gen(d){ const root = 50 + rint(8); const perfect = Math.random() < .5;
    const I = [root, root+4, root+7], V = [root+7, root+11, root+14], vi = [root+9, root+12, root+16];
    const seq = perfect ? [...V, ...I] : [...V, ...vi];
    return {q:'Cette fin de phrase est…', play:seq, gap:.34, replay:true,
      choices:['Parfaite (V → I) : repos','Rompue (V → vi) : surprise'], ans:perfect?0:1, notion:'cadences'}; }},

 cadenceQuiz:{name:'Quiz des cadences', icon:'📜', cat:['nogtr','quick'], skill:'cadences', mic:false, type:'mcq', rounds:6,
  desc:'La théorie des fins de phrase.',
  gen(d){ const qs = [
      {q:'La cadence parfaite, c\'est…', c:['V → I','IV → V','I → vi','ii → IV'], a:0},
      {q:'La cadence rompue, c\'est…', c:['V → vi','V → I','I → IV','vi → ii'], a:0},
      {q:'L\'accord de dominante est le degré…', c:['V','I','IV','vi'], a:0},
      {q:'L\'accord « maison » (repos) est le degré…', c:['I','V','ii','vii°'], a:0},
      {q:'La demi-cadence s\'arrête sur…', c:['V (suspens)','I (repos)','vi','IV'], a:0}
    ]; const it = rnd(qs);
    const order = it.c.map((c,i)=>i).sort(()=>Math.random()-.5);
    return {q:it.q, choices:order.map(i=>it.c[i]), ans:order.indexOf(it.a), notion:'cadences'}; }},

 modeQuiz:{name:'Quiz des modes', icon:'🎨', cat:['nogtr','quick'], skill:'modes', mic:false, type:'mcq', rounds:6,
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

 keyQuiz:{name:'Trouve la tonalité', icon:'🗝️', cat:['nogtr'], skill:'analysis', mic:false, type:'mcq', rounds:6,
  desc:'Des accords → une tonalité.',
  gen(d){ const root = rint(12);
    const degs = [0,3,4,5].sort(()=>Math.random()-.5).slice(0,3);
    const names = degs.map(dg => pcFR((root+SCALES.maj.iv[dg])%12) + ([1,2,5].includes(dg)?'m':''));
    const choices = [root]; while (choices.length < 4){ const c = rint(12); if (!choices.includes(c)) choices.push(c); }
    choices.sort(() => Math.random()-.5);
    return {q:`Une chanson utilise : ${names.join(' · ')}. Sa tonalité probable ?`,
      choices:choices.map(c=>pcFR(c)+' majeur'), ans:choices.indexOf(root), notion:'tonalite'}; }},

 melodyRepeat:{name:'Reproduis la mélodie', icon:'🎶', cat:['guitar','ear'], skill:'improv', mic:true, type:'melody', rounds:5,
  desc:'Écoute 3 à 5 notes, rejoue-les dans l\'ordre.',
  gen(d){ const len = d < .34 ? 3 : d < .67 ? 4 : 5;
    const root = 50 + rint(10);
    const scale = SCALES.pmin.iv;
    const seq = [root];
    for (let i = 1; i < len; i++) seq.push(root + rnd(scale) + (Math.random()<.3?12:0));
    return {q:'Écoute… puis rejoue la mélodie', seq, notion:'melodie'}; }},

 simon:{name:'Simon musical', icon:'🟡', cat:['guitar','ear'], skill:'improv', mic:true, type:'simon', rounds:1,
  desc:'La séquence s\'allonge à chaque tour. Jusqu\'où iras-tu ?',
  gen(d){ const root = 52 + rint(8); return {root, scale:SCALES.pmin.iv, notion:'melodie'}; }},

 improv:{name:'Impro guidée', icon:'🎤', cat:['guitar'], skill:'penta', mic:true, type:'improv', rounds:1,
  desc:'45 secondes d\'impro : reste dans la gamme !',
  gen(d){ const root = rint(12);
    return {q:`Improvise en ${pcFR(root)} pentatonique mineure`, root, iv:SCALES.pmin.iv, dur:45, notion:'scale-pmin'}; }},

 blues:{name:'Blues 12 mesures', icon:'🎷', cat:['guitar'], skill:'functions', mic:true, type:'micSeq', rounds:1,
  desc:'La grille I-IV-V : joue la fondamentale de chaque mesure.',
  gen(d){ const root = rint(12);
    const bars = [0,0,0,0,5,5,0,0,7,5,0,7];
    return {q:`Blues en ${pcFR(root)}`, sub:'Fondamentale de chaque mesure', seq:bars.map(b=>(root+b)%12), seqPc:true,
      seqLabels:bars.map((b,i)=>`${i+1}·${pcFR((root+b)%12)}7`), notion:'blues'}; }},

 exam:{name:'Examen final', icon:'👑', cat:['exam'], skill:'mastery', mic:true, type:'exam', rounds:20,
  desc:'20 questions sur tout le parcours. 80 % = couronne.',
  gen(d){ return null; }}
};
