// Servidor local opcional do painel Apuração 2026 (Node 18+, sem dependências).
//   node servidor.js            → http://localhost:8080
//   PORT=3000 node servidor.js  → outra porta
// Serve os arquivos desta pasta e repassa /tse/... para https://resultados.tse.jus.br/oficial/...
// Só é necessário se o navegador não conseguir ler o TSE diretamente; a página detecta e usa sozinha.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const TSE = 'https://resultados.tse.jus.br/oficial';
const PASTA = __dirname;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };
const cache = new Map(); // url -> { etag, corpo, tipo, em }

async function proxy(req, res, resto) {
  if (!/^\/[a-z0-9_\-\/\.]+$/i.test(resto) || resto.includes('..')) { res.writeHead(400); return res.end(); }
  const url = TSE + resto;
  const ant = cache.get(url);
  if (ant && Date.now() - ant.em < 20000) return enviar(res, 200, ant.tipo, ant.corpo);
  try {
    const r = await fetch(url, { headers: ant && ant.etag ? { 'if-none-match': ant.etag } : {} });
    if (r.status === 304 && ant) { ant.em = Date.now(); return enviar(res, 200, ant.tipo, ant.corpo); }
    if (!r.ok) { res.writeHead(r.status); return res.end(); }
    const corpo = Buffer.from(await r.arrayBuffer());
    const tipo = r.headers.get('content-type') || 'application/octet-stream';
    cache.set(url, { etag: r.headers.get('etag'), corpo, tipo, em: Date.now() });
    enviar(res, 200, tipo, corpo);
  } catch (e) {
    if (ant) return enviar(res, 200, ant.tipo, ant.corpo);
    res.writeHead(502); res.end(String(e.message));
  }
}

function enviar(res, status, tipo, corpo) {
  res.writeHead(status, { 'content-type': tipo, 'cache-control': 'no-cache' });
  res.end(corpo);
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/tse/__ping') return enviar(res, 200, 'text/plain', 'apuracao-ok');
  if (u.pathname.startsWith('/tse/')) return proxy(req, res, u.pathname.slice(4));
  const rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1));
  const arq = path.join(PASTA, rel);
  if (!arq.startsWith(PASTA)) { res.writeHead(403); return res.end(); }
  fs.readFile(arq, (err, corpo) => {
    if (err) { res.writeHead(404); return res.end('não encontrado'); }
    enviar(res, 200, TIPOS[path.extname(arq)] || 'application/octet-stream', corpo);
  });
}).listen(PORT, () => console.log(`Apuração 2026 em http://localhost:${PORT}`));
