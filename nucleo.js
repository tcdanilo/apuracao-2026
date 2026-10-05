/* Apuração 2026 · núcleo de dados
 * Lê os arquivos públicos de resultado do TSE (formato "unificado", sufixo -u.json),
 * normaliza e oferece um gerador de dados FICTÍCIOS para o modo demonstração.
 * Funciona no navegador (window.Nucleo) e no Node (module.exports), para testes.
 *
 * Campos do arquivo do TSE usados aqui:
 *   ele, t, cdabr, dg/hg (data e hora de geração), tf (totalização final), md (matematicamente definido)
 *   carg[0]: cd, nmn, nv (vagas), qe (quociente eleitoral), agr[] (partido isolado, federação ou coligação)
 *   agr: n, nm, tp, com, vag (vagas conquistadas) e par[] (partidos) → cand[]
 *   cand: n, sqcand, nm, nmu, seq, e, st (situação: "Eleito", "Eleito por QP", "2º turno"...), vap (votos), pvap (% dos válidos), vs[] (vice/suplentes)
 *   s: ts (seções), st (totalizadas), pst (% totalizadas)
 *   e: te (eleitorado), c / pc (comparecimento), a / pa (abstenção)
 *   v: vv / pvv (válidos), vb / pvb (brancos), tvn / ptvn (nulos)
 */
(function (raiz) {
  'use strict';

  const BASE = 'https://resultados.tse.jus.br/oficial';
  const CICLO = 'ele2026';
  // Códigos do 1º turno de 2026 publicados pelo TSE. São confirmados em tempo de execução pelo ele-c.json.
  const ELEICOES_PADRAO = { federal: { 1: '6257', 2: '6258' }, estadual: { 1: '6259', 2: '6260' } };

  const UFS = [
    ['ac', 'Acre'], ['al', 'Alagoas'], ['am', 'Amazonas'], ['ap', 'Amapá'], ['ba', 'Bahia'], ['ce', 'Ceará'],
    ['df', 'Distrito Federal'], ['es', 'Espírito Santo'], ['go', 'Goiás'], ['ma', 'Maranhão'], ['mg', 'Minas Gerais'],
    ['ms', 'Mato Grosso do Sul'], ['mt', 'Mato Grosso'], ['pa', 'Pará'], ['pb', 'Paraíba'], ['pe', 'Pernambuco'],
    ['pi', 'Piauí'], ['pr', 'Paraná'], ['rj', 'Rio de Janeiro'], ['rn', 'Rio Grande do Norte'], ['ro', 'Rondônia'],
    ['rr', 'Roraima'], ['rs', 'Rio Grande do Sul'], ['sc', 'Santa Catarina'], ['se', 'Sergipe'], ['sp', 'São Paulo'],
    ['to', 'Tocantins'],
  ];
  const NOME_UF = Object.fromEntries(UFS);
  NOME_UF.br = 'Brasil';
  NOME_UF.zz = 'Exterior';

  const CARGOS = {
    1: { codigo: 1, nome: 'Presidente', pleito: 'federal', majoritario: true },
    3: { codigo: 3, nome: 'Governador', pleito: 'estadual', majoritario: true },
    5: { codigo: 5, nome: 'Senador', pleito: 'estadual', majoritario: true },
    6: { codigo: 6, nome: 'Deputado Federal', pleito: 'estadual', majoritario: false },
    7: { codigo: 7, nome: 'Deputado Estadual', pleito: 'estadual', majoritario: false },
    8: { codigo: 8, nome: 'Deputado Distrital', pleito: 'estadual', majoritario: false },
  };
  // Na UF "df" o cargo estadual é o de deputado distrital.
  const cargoEstadual = (uf) => (uf === 'df' ? 8 : 7);

  const pad = (v, n) => String(v).padStart(n, '0');

  function caminhoResultado(eleicao, abr, cargo) {
    return `/${CICLO}/${eleicao}/dados/${abr}/${abr}-c${pad(cargo, 4)}-e${pad(eleicao, 6)}-u.json`;
  }
  // Resultado de um município: o código é o do TSE (5 dígitos), não o do IBGE.
  function caminhoResultadoMun(eleicao, uf, cdmun, cargo) {
    return `/${CICLO}/${eleicao}/dados/${uf}/${uf}${pad(cdmun, 5)}-c${pad(cargo, 4)}-e${pad(eleicao, 6)}-u.json`;
  }
  // Lista de municípios (e cidades do exterior) por UF, publicada antes da eleição.
  function caminhoMunicipios(eleicao) {
    return `/${CICLO}/${eleicao}/config/mun-e${pad(eleicao, 6)}-cm.json`;
  }
  function lerMunicipios(json) {
    const r = {};
    for (const abr of (json && json.abr) || []) {
      const uf = String(abr.cd || '').toLowerCase();
      if (!uf) continue;
      r[uf] = (abr.mu || [])
        .map((m) => ({ cd: String(m.cd), nm: m.nm || '', capital: /^s$/i.test(String(m.c || '')) }))
        .filter((m) => m.cd && m.nm)
        .sort((a, b) => a.nm.localeCompare(b.nm, 'pt-BR'));
    }
    return r;
  }
  function caminhoFoto(eleicao, abr, sqcand) {
    return `/${CICLO}/${eleicao}/fotos/${abr}/${sqcand}.jpeg`;
  }

  // Lê o índice ele-c.json e acha os códigos das eleições federal e estadual do ciclo.
  function lerIndice(indice) {
    for (const pleito of (indice && indice.pl) || []) {
      if (pleito.c !== CICLO) continue;
      const r = {};
      for (const e of pleito.e || []) {
        if (String(e.t) !== '1') continue;
        const tipo = String(e.tp) === '8' ? 'federal' : String(e.tp) === '1' ? 'estadual' : null;
        if (tipo && !r[tipo]) r[tipo] = { 1: String(e.cd), 2: e.cdt2 ? String(e.cdt2) : null };
      }
      if (r.federal && r.estadual) return r;
    }
    return null;
  }

  const inteiro = (v) => {
    const n = parseInt(String(v == null ? '' : v).replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  };
  const decimal = (v) => {
    const n = parseFloat(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const semAcento = (t) =>
    String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/º/g, 'o').trim();

  // O texto de `st` manda; a flag `e` só vale quando `st` vem vazio (mesma regra do app do TSE).
  function classificarSituacao(st, e) {
    const t = semAcento(st);
    if (t) {
      if (/^eleit[oa]/.test(t)) return 'eleito';
      if (/^(2o|segundo)\s*turno/.test(t)) return 'segundo-turno';
      if (/^suplente/.test(t)) return 'suplente';
      if (/^nao\s*eleit/.test(t)) return 'nao-eleito';
      return 'outra';
    }
    const f = String(e == null ? '' : e).toLowerCase();
    if (f === 's') return 'eleito';
    if (f === '2') return 'segundo-turno';
    return 'nenhuma';
  }

  function paraData(dg, hg) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dg || '');
    if (!m || !/^\d{2}:\d{2}:\d{2}$/.test(hg || '')) return null;
    return new Date(`${m[3]}-${m[2]}-${m[1]}T${hg}-03:00`);
  }

  function normalizar(bruto) {
    const cargo = (bruto.carg && bruto.carg[0]) || {};
    const s = bruto.s || {}, e = bruto.e || {}, v = bruto.v || {};
    const candidatos = [];
    const agrupamentos = [];
    for (const agr of cargo.agr || []) {
      const partidos = agr.par || [];
      let votos = 0, legenda = 0;
      for (const par of partidos) {
        legenda += inteiro(par.tval);
        for (const c of par.cand || []) {
          const vv = inteiro(c.vap);
          votos += vv;
          candidatos.push({
            numero: String(c.n || ''),
            sq: String(c.sqcand || ''),
            nome: c.nm || '',
            nomeUrna: c.nmu || c.nm || '',
            partido: par.sg || '',
            coligacao: agr.tp === 'c' ? agr.nm || '' : '',
            composicao: agr.com || par.sg || '',
            votos: vv,
            pct: decimal(c.pvap),
            ordem: inteiro(c.seq),
            situacao: classificarSituacao(c.st, c.e),
            situacaoTexto: c.st || '',
            vices: (c.vs || []).map((x) => ({ tipo: x.tp, nomeUrna: x.nmu || x.nm, partido: x.sgp })),
          });
        }
      }
      agrupamentos.push({
        nome: agr.nm || '',
        sigla: agr.com || partidos.map((p) => p.sg).join('/'),
        tipo: agr.tp,
        partidos: partidos.map((p) => p.sg),
        vagas: inteiro(agr.vag),
        votos: votos + legenda,
      });
    }
    candidatos.sort((a, b) => b.votos - a.votos || a.ordem - b.ordem || a.nomeUrna.localeCompare(b.nomeUrna));
    agrupamentos.sort((a, b) => b.vagas - a.vagas || b.votos - a.votos);
    const tf = String(bruto.tf || '').toLowerCase();
    const md = String(bruto.md || '').toLowerCase();
    const temVv = v.vv !== undefined;
    return {
      eleicao: String(bruto.ele || ''),
      turno: inteiro(bruto.t) || 1,
      abrangencia: String(bruto.cdabr || '').toLowerCase(),
      geradoEm: paraData(bruto.dg, bruto.hg),
      cargo: { codigo: inteiro(cargo.cd), nome: cargo.nmn || '', vagas: inteiro(cargo.nv) || 1, qe: inteiro(cargo.qe) },
      final: tf === 's',
      matematicamenteDefinido: tf !== 's' && md !== '' && md !== 'n',
      secoes: { total: inteiro(s.ts), totalizadas: inteiro(s.st), pct: decimal(s.pst) },
      eleitorado: {
        total: inteiro(e.te), comparecimento: inteiro(e.c), pctComparecimento: decimal(e.pc),
        abstencao: inteiro(e.a), pctAbstencao: decimal(e.pa),
      },
      votos: {
        validos: inteiro(temVv ? v.vv : v.vvc), pctValidos: decimal(temVv ? v.pvv : v.pvvc),
        brancos: inteiro(v.vb), pctBrancos: decimal(v.pvb),
        nulos: inteiro(v.tvn), pctNulos: decimal(v.ptvn),
      },
      candidatos,
      agrupamentos,
    };
  }

  /* ---------- cores de partido ---------- */
  const CORES = {
    PT: '#c8102e', 'PC do B': '#a3001b', PCdoB: '#a3001b', PV: '#3f9b35', PSB: '#e8a200', PDT: '#d6402b',
    PSOL: '#c99700', REDE: '#0f8f8a', PL: '#1d3f8f', PP: '#2d6cc0', PROGRESSISTAS: '#2d6cc0', UNIÃO: '#0b5394',
    REPUBLICANOS: '#3f7fbf', PSD: '#d18a00', MDB: '#2e8b57', PSDB: '#1e88e5', CIDADANIA: '#c2185b', NOVO: '#ef6c00',
    PODE: '#5e8c31', AVANTE: '#7b4fa0', SOLIDARIEDADE: '#e65100', PRD: '#365f91', DC: '#00796b', AGIR: '#6d4c41',
    MOBILIZA: '#8d6e63', PMB: '#ad1457', PCO: '#8e0000', PSTU: '#b71c1c', UP: '#9c2a2a', PCB: '#9b1c1c', PRTB: '#2e7d32',
    DEMOCRATA: '#00838f', MISSÃO: '#5d4037',
  };
  function corPartido(sg) {
    if (!sg) return '#8a8f98';
    if (CORES[sg]) return CORES[sg];
    const up = sg.toUpperCase();
    for (const k of Object.keys(CORES)) if (k.toUpperCase() === up) return CORES[k];
    let h = 0;
    for (const ch of sg) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${h} 45% 45%)`;
  }

  /* ---------- modo demonstração (dados fictícios) ---------- */
  // Eleitorado aproximado por UF (milhões) e vagas na Câmara. Só alimenta a simulação.
  const ELEITORADO = { ac: .6, al: 2.4, am: 2.7, ap: .55, ba: 11.3, ce: 7, df: 2.2, es: 2.9, go: 4.8, ma: 5, mg: 16.4,
    ms: 2, mt: 2.5, pa: 6.2, pb: 3.1, pe: 7.1, pi: 2.6, pr: 8.6, rj: 12.8, rn: 2.6, ro: 1.3, rr: .37, rs: 8.6, sc: 5.6,
    se: 1.7, sp: 34.1, to: 1.1, zz: .7 };
  const VAGAS_FED = { sp: 70, mg: 53, rj: 46, ba: 39, rs: 31, pr: 30, pe: 25, ce: 22, ma: 18, go: 17, pa: 17, sc: 16,
    pb: 12, es: 10, pi: 10, al: 9 };
  const vagasFederal = (uf) => VAGAS_FED[uf] || 8;
  const vagasEstadual = (uf) => { if (uf === 'df') return 24; const f = vagasFederal(uf); return f <= 12 ? f * 3 : 36 + f - 12; };

  const PARTIDOS_DEMO = ['ALFA', 'BETA', 'GAMA', 'DELTA', 'SIGMA', 'ÔMEGA', 'ZETA', 'KAPA'];
  const CORES_DEMO = { ALFA: '#c8102e', BETA: '#1d3f8f', GAMA: '#d18a00', DELTA: '#2e8b57', SIGMA: '#7b4fa0',
    ÔMEGA: '#0f8f8a', ZETA: '#ef6c00', KAPA: '#6d4c41' };
  Object.assign(CORES, CORES_DEMO);
  const NOMES = ['Aurora', 'Benedito', 'Celina', 'Dorival', 'Estela', 'Fausto', 'Glória', 'Horácio', 'Iracema', 'Jurandir',
    'Lucélia', 'Moacir', 'Nádia', 'Otacílio', 'Petrúcia', 'Quitéria', 'Rosalvo', 'Selma', 'Tibério', 'Ubirajara',
    'Valdirene', 'Wanderlei', 'Zuleica', 'Anésio', 'Berenice', 'Cleonice', 'Deodato', 'Eulália'];
  const SOBRENOMES = ['da Fictícia', 'Imaginário', 'Exemplar', 'do Teste', 'Simulado', 'de Mentirinha', 'Hipotético',
    'Ilustrativo', 'Modelo', 'Provisório'];

  function semente(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function aleatorio(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const br = (n, casas = 2) => n.toFixed(casas).replace('.', ',');

  /* ---------- exterior: cidade → país ----------
     O TSE trata o exterior como a UF "zz" e cada cidade com seção eleitoral é um "município" dela,
     mas não diz de que país é a cidade. Esta tabela faz esse vínculo pelo código TSE da cidade
     (conferido com a lista de 186 cidades de 2026); se o código não bater, tenta pelo nome.
     Formato: 'ISO|País|código Cidade;código Cidade'. */
  const EXTERIOR = [
    'AL|Albânia|99139 Tirana',
    'DE|Alemanha|29386 Berlim;29696 Frankfurt;30180 Munique',
    'AO|Angola|29998 Luanda',
    'AG|Antígua e Barbuda|99147 Saint John\'s',
    'AR|Argentina|29467 Buenos Aires;29602 Córdoba;39004 Mendoza;30295 Paso de los Libres;99155 Puerto Iguazú',
    'DZ|Argélia|29300 Argel',
    'AM|Armênia|38989 Ierevan',
    'SA|Arábia Saudita|30422 Riade',
    'AU|Austrália|29491 Camberra;30562 Sydney',
    'AZ|Azerbaijão|39128 Baku',
    'BS|Bahamas|99180 Nassau',
    'BD|Bangladesh|29629 Daca',
    'BB|Barbados|29424 Bridgetown',
    'BH|Barein|99473 Barein',
    'BZ|Belize|38881 Belmopan',
    'BJ|Benim|38920 Cotonou',
    'BO|Bolívia|99210 Cobija;29572 Cochabamba;29904 La Paz;99236 Puerto Quijarro;30473 Santa Cruz de la Sierra',
    'BW|Botsuana|30669 Gaborone',
    'BG|Bulgária|30546 Sófia',
    'BF|Burkina Faso|39284 Uagadugu',
    'BE|Bélgica|29432 Bruxelas',
    'BA|Bósnia e Herzegovina|30988 Sarajevo',
    'CV|Cabo Verde|30368 Praia',
    'CM|Camarões|29815 Iaundê',
    'CA|Canadá|30155 Montreal;30252 Ottawa;30635 Toronto;39063 Vancouver',
    'QA|Catar|29653 Doha',
    'KZ|Cazaquistão|39241 Astana',
    'CL|Chile|30481 Santiago',
    'CN|China|30651 Cantão;30317 Pequim;30848 Xangai',
    'HK|China (Hong Kong)|29793 Hong Kong',
    'CY|Chipre|39322 Nicósia',
    'CO|Colômbia|29408 Bogotá',
    'KP|Coreia do Norte|99295 Pyongyang',
    'KR|Coreia do Sul|30538 Seul',
    'CR|Costa Rica|30511 São José',
    'CI|Costa do Marfim|29254 Abidjã',
    'HR|Croácia|39020 Zagreb',
    'CU|Cuba|29777 Havana',
    'DK|Dinamarca|29599 Copenhague',
    'EG|Egito|29483 Cairo',
    'SV|El Salvador|30520 São Salvador',
    'AE|Emirados Árabes Unidos|29262 Abu Dhabi',
    'EC|Equador|30392 Quito',
    'SK|Eslováquia|39209 Bratislava',
    'SI|Eslovênia|39160 Liubliana',
    'ES|Espanha|29351 Barcelona;30066 Madri',
    'US|Estados Unidos|39080 Atlanta;29416 Boston;29513 Chicago;30902 Hartford;29807 Houston;29980 Los Angeles;30112 Miami;30228 Nova York;99490 Orlando;30503 São Francisco;30783 Washington',
    'EE|Estônia|99317 Talin',
    'ET|Etiópia|99325 Adis Abeba',
    'PH|Filipinas|30082 Manila',
    'FI|Finlândia|29785 Helsinque',
    'FR|França|99511 Marselha;30287 Paris',
    'GA|Gabão|29939 Libreville',
    'GH|Gana|29270 Accra',
    'GE|Geórgia|99104 Tbilisi',
    'GR|Grécia|29335 Atenas',
    'GT|Guatemala|98000 Guatemala',
    'GY|Guiana|29718 Georgetown',
    'GF|Guiana Francesa|29475 Caiena;99333 Saint-Georges de l\'Oyapock',
    'GN|Guiné|38903 Conacri',
    'GQ|Guiné Equatorial|39263 Malabo',
    'GW|Guiné-Bissau|29394 Bissau',
    'HT|Haiti|30333 Porto Príncipe',
    'HN|Honduras|30600 Tegucigalpa',
    'HU|Hungria|29459 Budapeste',
    'ID|Indonésia|29840 Jacarta',
    'IQ|Iraque|99171 Bagdá',
    'IE|Irlanda|29661 Dublin',
    'IR|Irã|30597 Teerã',
    'IL|Israel|30619 Tel Aviv',
    'IT|Itália|30120 Milão;30449 Roma',
    'JM|Jamaica|99430 Kingston',
    'JP|Japão|29742 Hamamatsu;30198 Nagóia;30627 Tóquio',
    'JO|Jordânia|29289 Amã',
    'KW|Kuwait|29882 Kuaite',
    'LB|Líbano|29360 Beirute',
    'LY|Líbia|30686 Trípoli',
    'MW|Malawi|99341 Lilongue',
    'ML|Mali|99350 Bamako',
    'MY|Malásia|29890 Kuala Lumpur',
    'MA|Marrocos|30406 Rabat',
    'MM|Mianmar|99376 Yangon',
    'MZ|Moçambique|30090 Maputo',
    'MX|México|30104 Cidade do México',
    'NA|Namíbia|30821 Windhoek',
    'NP|Nepal|29173 Katmandu',
    'NI|Nicarágua|30074 Manágua',
    'NG|Nigéria|99198 Abuja;29912 Lagos',
    'NO|Noruega|30244 Oslo',
    'NZ|Nova Zelândia|30805 Wellington',
    'OM|Omã|39102 Mascate',
    'PS|Palestina|30414 Ramallah',
    'PA|Panamá|30260 Panamá',
    'PK|Paquistão|29831 Islamabade',
    'PY|Paraguai|29327 Assunção;29556 Ciudad del Este;29580 Concepción;29670 Encarnación;30309 Pedro Juan Caballero;30465 Salto del Guairá',
    'NL|Países Baixos|30457 Amsterdã',
    'PE|Peru|29823 Iquitos;29947 Lima',
    'PL|Polônia|30740 Varsóvia',
    'PT|Portugal|30961 Faro;29955 Lisboa;30341 Porto',
    'KE|Quênia|30201 Nairóbi',
    'GB|Reino Unido|99503 Edimburgo;29971 Londres',
    'CD|República Democrática do Congo|29874 Kinshasa',
    'DO|República Dominicana|30490 São Domingos',
    'CG|República do Congo|39187 Brazzaville',
    'RO|Romênia|29440 Bucareste',
    'RU|Rússia|30163 Moscou',
    'LC|Santa Lúcia|99384 Castries',
    'SN|Senegal|29610 Dacar',
    'SG|Singapura|29548 Singapura',
    'LK|Sri Lanka|30929 Colombo',
    'SR|Suriname|30279 Paramaribo',
    'SE|Suécia|29688 Estocolmo',
    'CH|Suíça|29700 Genebra;30864 Zurique',
    'ST|São Tomé e Príncipe|39225 São Tomé',
    'RS|Sérvia|29378 Belgrado',
    'SY|Síria|29637 Damasco',
    'TH|Tailândia|29343 Bangkok',
    'TW|Taiwan|30570 Taipé',
    'TZ|Tanzânia|38962 Dar es Salaam',
    'CZ|Tchéquia|30350 Praga',
    'TL|Timor-Leste|29645 Díli',
    'TG|Togo|29963 Lomé',
    'TT|Trinidad e Tobago|30325 Port of Spain',
    'TN|Tunísia|30708 Túnis',
    'TR|Turquia|29297 Ancara;39306 Istambul',
    'UA|Ucrânia|29858 Kiev',
    'UY|Uruguai|29319 Artigas;29521 Chuy;30147 Montevidéu;30430 Rio Branco;99244 Rivera',
    'VE|Venezuela|29505 Caracas;29564 Ciudad Guayana;99279 Santa Elena de Uairén',
    'VN|Vietnã|29750 Hanói',
    'ZW|Zimbábue|29769 Harare',
    'ZM|Zâmbia|99287 Lusaca',
    'ZA|África do Sul|29530 Cidade do Cabo;30376 Pretória',
    'AT|Áustria|30767 Viena',
    'IN|Índia|30171 Mumbai;30210 Nova Délhi',
  ];
  const PAIS_POR_CODIGO = new Map(), PAIS_POR_NOME = new Map(), NOME_PAIS = {};
  for (const linha of EXTERIOR) {
    const [iso, nome, cidades] = linha.split('|');
    NOME_PAIS[iso] = nome;
    for (const c of cidades.split(';')) {
      const i = c.indexOf(' ');
      PAIS_POR_CODIGO.set(c.slice(0, i), iso);
      PAIS_POR_NOME.set(semAcento(c.slice(i + 1)), iso);
    }
  }
  // grafias em que o TSE pode publicar o nome da cidade
  for (const [nome, iso] of [['abidjan', 'CI'], ['nova iorque', 'US'], ['new york', 'US'], ['nagoya', 'JP'], ['tokyo', 'JP'],
    ['islamabad', 'PK'], ['kuwait', 'KW'], ['bahrein', 'BH'], ['barem', 'BH'], ['cidade do panama', 'PA'], ['cidade da guatemala', 'GT'],
    ['san jose', 'CR'], ['san salvador', 'SV'], ['santo domingo', 'DO'], ['assuncao', 'PY'], ['asuncion', 'PY'], ['munchen', 'DE'],
    ['mexico', 'MX'], ['zurich', 'CH'], ['geneve', 'CH'], ['kyiv', 'UA'], ['kiev', 'UA'], ['taipei', 'TW'], ['guangzhou', 'CN'],
    ['xangai', 'CN'], ['shanghai', 'CN'], ['canberra', 'AU'], ['abu dabi', 'AE'], ['dubai', 'AE'], ['lilongwe', 'MW'], ['lusaka', 'ZM']]) {
    if (!PAIS_POR_NOME.has(nome)) PAIS_POR_NOME.set(nome, iso);
  }
  // País de uma cidade do exterior ({cd, nm} da lista de municípios). Sem correspondência: "XX".
  function paisDaCidade(m) {
    const iso = PAIS_POR_CODIGO.get(String(m.cd)) || PAIS_POR_NOME.get(semAcento(m.nm).replace(/\s*\(.*\)\s*$/, '').trim()) || 'XX';
    return { iso, nome: iso === 'XX' ? 'Outros locais' : NOME_PAIS[iso] };
  }
  // Agrupa as cidades do exterior por país, em ordem alfabética.
  function paisesExterior(cidades) {
    const r = new Map();
    for (const m of cidades || []) {
      const p = paisDaCidade(m);
      if (!r.has(p.iso)) r.set(p.iso, { iso: p.iso, nome: p.nome, cidades: [] });
      r.get(p.iso).cidades.push(m);
    }
    return [...r.values()].sort((a, b) => (a.iso === 'XX') - (b.iso === 'XX') || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // Soma vários resultados já normalizados (as cidades de um país) num resultado do mesmo formato.
  // Percentuais são recalculados; a situação de cada candidato (eleito, 2º turno) não vale para o recorte.
  function somarResultados(lista) {
    lista = lista.filter(Boolean);
    if (!lista.length) return null;
    const pct = (a, b) => (b ? 100 * a / b : 0);
    const cands = new Map();
    const z = { secoes: { total: 0, totalizadas: 0 }, eleitorado: { total: 0, comparecimento: 0, abstencao: 0 },
      votos: { validos: 0, brancos: 0, nulos: 0 } };
    for (const d of lista) {
      for (const g of ['secoes', 'eleitorado', 'votos']) for (const k of Object.keys(z[g])) z[g][k] += d[g][k] || 0;
      for (const c of d.candidatos) {
        const x = cands.get(c.numero) || { ...c, votos: 0, situacao: '', situacaoTexto: '' };
        x.votos += c.votos;
        cands.set(c.numero, x);
      }
    }
    const candidatos = [...cands.values()];
    for (const c of candidatos) c.pct = pct(c.votos, z.votos.validos);
    candidatos.sort((a, b) => b.votos - a.votos || a.ordem - b.ordem);
    const geradoEm = lista.map((d) => d.geradoEm).filter(Boolean).sort((a, b) => b - a)[0] || null;
    return {
      ...lista[0], geradoEm, candidatos, final: lista.every((d) => d.final), matematicamenteDefinido: false,
      secoes: { ...z.secoes, pct: pct(z.secoes.totalizadas, z.secoes.total) },
      eleitorado: { ...z.eleitorado, pctComparecimento: pct(z.eleitorado.comparecimento, z.eleitorado.total),
        pctAbstencao: pct(z.eleitorado.abstencao, z.eleitorado.total) },
      votos: { ...lista[0].votos, ...z.votos, pctValidos: pct(z.votos.validos, z.eleitorado.comparecimento),
        pctBrancos: pct(z.votos.brancos, z.eleitorado.comparecimento), pctNulos: pct(z.votos.nulos, z.eleitorado.comparecimento) },
    };
  }

  // Municípios fictícios para a demonstração (o primeiro é a "capital").
  function municipiosDemo() {
    const r = {};
    const nomes = ['Vila Exemplo', 'Campo Fictício', 'Serra do Teste', 'Porto Imaginário', 'São Simulado', 'Lagoa Modelo',
      'Ribeirão Hipotético', 'Nova Ilustração'];
    for (const [uf] of UFS) {
      const rnd = aleatorio(semente('mun-' + uf));
      const total = uf === 'df' ? 1 : nomes.length;
      r[uf] = Array.from({ length: total }, (_, i) => ({
        cd: String(90000 + i * 7 + UFS.findIndex((u) => u[0] === uf)), nm: uf === 'df' ? 'Distrito Exemplo' : nomes[i],
        capital: i === 0, eleitorado: (i === 0 ? 0.25 : 0.03 + rnd() * 0.05) * (ELEITORADO[uf] || 0.5) * 1e6,
      })).sort((a, b) => a.nm.localeCompare(b.nm, 'pt-BR'));
    }
    const rnd = aleatorio(semente('mun-zz'));
    r.zz = [['30112', 'MIAMI'], ['30228', 'NOVA YORK'], ['29416', 'BOSTON'], ['29980', 'LOS ANGELES'], ['29955', 'LISBOA'],
      ['30341', 'PORTO'], ['30961', 'FARO'], ['30627', 'TÓQUIO'], ['30198', 'NAGÓIA'], ['29742', 'HAMAMATSU'], ['29971', 'LONDRES'],
      ['30287', 'PARIS'], ['30449', 'ROMA'], ['30120', 'MILÃO'], ['29467', 'BUENOS AIRES'], ['29327', 'ASSUNÇÃO'], ['29700', 'GENEBRA'],
      ['30635', 'TORONTO'], ['99999', 'CIDADE NOVA']]
      .map(([cd, nm], i) => ({ cd, nm, capital: false, eleitorado: (0.01 + rnd() * 0.04) * (ELEITORADO.zz || 0.5) * 1e6 }))
      .sort((a, b) => a.nm.localeCompare(b.nm, 'pt-BR'));
    return r;
  }

  // Gera um arquivo no MESMO formato do TSE, para que a demonstração passe pelo mesmo leitor.
  // `progresso` vai de 0 a 1 (fração das seções totalizadas).
  function gerarDemo(eleicao, abr, cargo, progresso, mun) {
    const rnd = aleatorio(semente(`${abr}-${cargo}${mun ? '-' + mun.cd : ''}`));
    const ufs = abr === 'br' ? UFS.map((u) => u[0]) : [abr];
    const eleitorado = mun ? Math.round(mun.eleitorado) : Math.round(ufs.reduce((s, u) => s + ELEITORADO[u], 0) * 1e6);
    const secoesTotal = Math.round(eleitorado / 330);
    const p = Math.max(0, Math.min(1, progresso));
    const final = p >= 1;
    const nv = cargo === 5 ? 2 : cargo === 6 ? vagasFederal(abr) : cargo === 7 || cargo === 8 ? vagasEstadual(abr) : 1;
    const nCand = cargo === 1 ? 7 : cargo === 3 ? 5 : cargo === 5 ? 7 : Math.min(nv * 3, 120);
    // presidente: mesmos candidatos em todas as abrangências, com força regional diferente
    // presidente: mesmos candidatos em todo lugar; nos municípios, os candidatos da UF
    const rndCand = cargo === 1 ? aleatorio(semente('pres')) : mun ? aleatorio(semente(`${abr}-${cargo}`)) : rnd;
    const cands = [];
    for (let i = 0; i < nCand; i++) {
      const partido = PARTIDOS_DEMO[cargo === 1 ? i % PARTIDOS_DEMO.length : Math.floor(rndCand() * PARTIDOS_DEMO.length)];
      const nome = `${NOMES[Math.floor(rndCand() * NOMES.length)]} ${SOBRENOMES[Math.floor(rndCand() * SOBRENOMES.length)]}`;
      const base = cargo === 1 ? [36, 33, 11, 7, 4, 2, 1][i] : Math.pow(rndCand(), 2.2) * 100 + 1;
      const regional = cargo === 1 ? 0.55 + rnd() * 0.9 : 1;
      const deriva = (rnd() - 0.5) * 0.35; // a vantagem muda ao longo da apuração
      cands.push({ i, partido, nome, peso: base * regional, deriva, numero: String(10 + i * 3 + (cargo >= 6 ? 1000 : cargo === 5 ? 100 : 0)) });
    }
    const pesoAtual = cands.map((c) => Math.max(0.1, c.peso * (1 + c.deriva * (1 - p))));
    const soma = pesoAtual.reduce((a, b) => a + b, 0);
    const comparecimento = Math.round(eleitorado * 0.79 * p);
    const brancos = Math.round(comparecimento * 0.025), nulos = Math.round(comparecimento * 0.04);
    const validos = comparecimento - brancos - nulos;
    cands.forEach((c, k) => { c.votos = Math.round(validos * pesoAtual[k] / soma); });
    const ordenados = [...cands].sort((a, b) => b.votos - a.votos);
    if (final) {
      if (cargo === 1 || cargo === 3) {
        if (ordenados[0].votos > validos / 2) ordenados[0].st = 'Eleito';
        else { ordenados[0].st = '2º turno'; ordenados[1].st = '2º turno'; }
        ordenados.slice(ordenados[0].st === 'Eleito' ? 1 : 2).forEach((c) => { c.st = 'Não eleito'; });
      } else {
        ordenados.forEach((c, k) => { c.st = k < nv ? (cargo === 5 ? 'Eleito' : 'Eleito por QP') : (cargo === 5 ? 'Não eleito' : 'Suplente'); });
      }
    }
    const porPartido = {};
    for (const c of cands) (porPartido[c.partido] = porPartido[c.partido] || []).push(c);
    const agr = Object.entries(porPartido).map(([sg, lista]) => ({
      n: sg, nm: `PARTIDO ${sg} (FICTÍCIO)`, tp: 'i', com: sg,
      vag: String(final ? lista.filter((c) => /^Eleit/.test(c.st || '')).length : 0),
      par: [{ n: sg, sg, nm: `PARTIDO ${sg}`, tval: '0', cand: lista.map((c) => ({
        n: c.numero, sqcand: `demo${abr}${cargo}${c.i}`, nm: c.nome.toUpperCase(), nmu: c.nome.toUpperCase(),
        seq: String(c.i + 1), e: '', st: c.st || '', vap: String(c.votos), pvap: br(validos ? 100 * c.votos / validos : 0),
      })) }],
    }));
    const agora = new Date(Date.now() - 3 * 3600e3);
    const dg = `${pad(agora.getUTCDate(), 2)}/${pad(agora.getUTCMonth() + 1, 2)}/${agora.getUTCFullYear()}`;
    const hg = `${pad(agora.getUTCHours(), 2)}:${pad(agora.getUTCMinutes(), 2)}:${pad(agora.getUTCSeconds(), 2)}`;
    const st = Math.round(secoesTotal * p);
    return {
      ele: eleicao, t: '1', cdabr: mun ? abr + mun.cd : abr, dg, hg, tf: final ? 's' : 'n', md: 'n',
      carg: [{ cd: String(cargo), nmn: CARGOS[cargo].nome, nv: String(nv), agr }],
      s: { ts: String(secoesTotal), st: String(st), pst: br(100 * p) },
      e: { te: String(eleitorado), c: String(comparecimento), pc: br(eleitorado ? 100 * comparecimento / eleitorado : 0),
        a: String(Math.round(eleitorado * p) - comparecimento), pa: br(p ? 21 : 0) },
      v: { vv: String(validos), pvv: br(comparecimento ? 100 * validos / comparecimento : 0), vb: String(brancos),
        pvb: br(comparecimento ? 100 * brancos / comparecimento : 0), tvn: String(nulos), ptvn: br(comparecimento ? 100 * nulos / comparecimento : 0) },
    };
  }

  const Nucleo = {
    BASE, CICLO, ELEICOES_PADRAO, UFS, NOME_UF, CARGOS, cargoEstadual, caminhoResultado, caminhoFoto, lerIndice,
    caminhoResultadoMun, caminhoMunicipios, lerMunicipios, municipiosDemo, paisDaCidade, paisesExterior, somarResultados,
    normalizar, classificarSituacao, corPartido, gerarDemo, PARTIDOS_DEMO,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Nucleo;
  else raiz.Nucleo = Nucleo;
})(typeof window !== 'undefined' ? window : globalThis);
