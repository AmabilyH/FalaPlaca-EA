// Servidor estático mínimo para o protótipo (sem dependências): node servidor.mjs [porta]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('./app/', import.meta.url));
const PORTA = Number(process.argv[2] ?? process.env.PORT ?? 5173);
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const arquivo = normalize(join(RAIZ, caminho.endsWith('/') ? `${caminho}index.html` : caminho));
  if (!arquivo.startsWith(RAIZ)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const conteudo = await readFile(arquivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(conteudo);
  } catch {
    res.writeHead(404).end('Não encontrado');
  }
}).listen(PORTA, () => {
  console.log(`FalaPlaca rodando em http://localhost:${PORTA}`);
  for (const rede of Object.values(networkInterfaces()).flat()) {
    if (rede.family === 'IPv4' && !rede.internal) console.log(`Na rede local:  http://${rede.address}:${PORTA}`);
  }
});
