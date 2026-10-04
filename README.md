# Apuração 2026

Painel para acompanhar ao vivo a apuração do 1º turno de 4 de outubro de 2026: presidente (Brasil e por UF), governador, senador (2 vagas), deputado federal e deputado estadual/distrital nos 27 estados.

## Arquivos

- `index.html`: o painel (HTML, CSS e JS, sem build).
- `nucleo.js`: leitura e normalização dos arquivos do TSE e o gerador da demonstração.
- `servidor.js`: servidor local opcional (Node 18+, sem dependências) que serve o painel e repassa os pedidos ao TSE.
- `proxy-cloudflare.js`: proxy opcional para quando o site está no GitHub Pages e o navegador não consegue ler o TSE diretamente.

## Como usar

**Opção 1, a mais simples:** coloque `index.html` e `nucleo.js` em qualquer hospedagem estática (GitHub Pages, Netlify Drop, Vercel) e abra. O navegador lê o TSE diretamente.

**Opção 2, se a opção 1 mostrar "Não consegui acessar o TSE":** no computador, dentro desta pasta:

```bash
node servidor.js
```

e abra <http://localhost:8080>. A página percebe o servidor e passa a buscar os dados por ele.

**No GitHub Pages, se aparecer "Não consegui acessar o TSE":** publique `proxy-cloudflare.js` como um Worker gratuito do Cloudflare (o passo a passo está no topo do arquivo) e coloque o endereço dele em `PROXY_EXTERNO`, no `index.html`. A página só usa o proxy quando o acesso direto falha.

**Demonstração:** abra com `#demo` no fim do endereço (ex.: `http://localhost:8080/#demo`). Candidatos, partidos e votos são fictícios e a apuração simulada completa em uns 5 minutos.

## De onde vêm os dados

Arquivos públicos de divulgação do TSE, formato "resultado unificado" (leiaute EA20):

```
https://resultados.tse.jus.br/oficial/ele2026/{eleição}/dados/{uf}/{uf}-c{cargo}-e{eleição}-u.json
```

- Eleições do 1º turno: 6257 (federal: presidente) e 6259 (estadual: governador, senador e deputados). A página confirma os códigos no índice `oficial/comum/config/ele-c.json` ao abrir.
- Municípios: `…/{eleição}/dados/{uf}/{uf}{município}-c{cargo}-e{eleição}-u.json`, com o código de 5 dígitos do TSE. A lista de municípios de cada UF vem de `…/{eleição}/config/mun-e{eleição}-cm.json` (estadual para as UFs, federal para as cidades do exterior) e é baixada uma vez. Só o município escolhido é baixado e atualizado (5 arquivos por minuto a mais).
- Cargos: 1 presidente, 3 governador, 5 senador (um arquivo com as 2 vagas), 6 dep. federal, 7 dep. estadual, 8 dep. distrital (DF).
- Atualização automática a cada 60 s (o CDN do TSE renova os arquivos mais ou menos a cada minuto). O limite do TSE é 100 requisições por segundo por IP; o painel faz no máximo 6 ao mesmo tempo.
- A visão Brasil baixa 82 arquivos pequenos (presidente nacional e por UF, governador e senador das 27 UFs). Os arquivos de deputados, que são grandes, só são baixados para a UF aberta.

## O que o painel mostra e o que não mostra

- Percentuais são sobre votos válidos, como no app oficial. A barra de progresso é de seções totalizadas.
- "Eleito", "Eleito por QP", "2º turno" e "Suplente" vêm do próprio TSE. Antes disso o painel só diz quem lidera.
- Senado: as duas vagas são os dois mais votados; durante a apuração aparecem como "Lidera 1ª vaga" e "Lidera 2ª vaga".
- Fotos dos candidatos vêm de `…/{eleição}/fotos/{uf}/{sqcand}.jpeg`; se não carregarem, aparecem as iniciais.
