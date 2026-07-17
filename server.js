// Mini serveur local pour Coach Guitare IA — aucun module externe requis.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8765;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.wasm': 'application/wasm', '.nam': 'application/json', '.wav': 'audio/wav' };

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const file = path.join(__dirname, path.normalize(url));
  if (!file.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Introuvable'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      // Isolation cross-origin : requise par SharedArrayBuffer (ampli neuronal NAM)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Coach Guitare IA lancé : http://localhost:' + PORT);
  console.log('Laisse cette fenêtre ouverte pendant que tu utilises l\'application.');
});
