// Proxy opcional para o painel Apuração 2026 rodando no GitHub Pages.
// Só é necessário se o navegador não conseguir ler resultados.tse.jus.br diretamente (bloqueio de CORS).
//
// Como publicar (grátis):
//   1. Entre em https://dash.cloudflare.com → Workers & Pages → Create → Create Worker.
//   2. Dê o nome "apuracao-tse", clique em Deploy, depois em "Edit code".
//   3. Apague o código de exemplo, cole este arquivo inteiro e clique em Deploy.
//   4. Copie o endereço do Worker (ex.: https://apuracao-tse.seu-usuario.workers.dev)
//      e coloque em PROXY_EXTERNO, no index.html.
const TSE = 'https://resultados.tse.jus.br/oficial';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'accept',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Método não permitido', { status: 405, headers: cors });
    const { pathname } = new URL(request.url);
    if (pathname === '/__ping') return new Response('apuracao-ok', { headers: { ...cors, 'content-type': 'text/plain' } });
    // Só repassa os caminhos que o painel usa.
    if (!/^\/(comum\/config\/ele-c\.json|ele2026\/\d+\/(dados|fotos)\/[a-z]{2}\/[\w.-]+)$/.test(pathname)) {
      return new Response('Caminho não permitido', { status: 400, headers: cors });
    }
    const r = await fetch(TSE + pathname, { cf: { cacheTtl: 20, cacheEverything: true } });
    const headers = new Headers(cors);
    for (const h of ['content-type', 'etag', 'last-modified']) if (r.headers.get(h)) headers.set(h, r.headers.get(h));
    headers.set('cache-control', 'public, max-age=15');
    return new Response(r.body, { status: r.status, headers });
  },
};
