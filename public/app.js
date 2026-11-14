// Shaq o Betta: telas do app. Sem framework, sem dependências.
// Regra de segurança: todo texto vem para a tela como texto (createTextNode), nunca como HTML.
(() => {
  'use strict';

  // ---------- DOM ----------
  const NS = 'http://www.w3.org/2000/svg';

  function h(tag, props, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null) continue;
      if (k.startsWith('aria-')) el.setAttribute(k, String(v));
      else if (v === false) continue;
      else if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
    anexar(el, filhos);
    return el;
  }

  function hs(tag, props, ...filhos) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      el.setAttribute(k, String(v));
    }
    anexar(el, filhos);
    return el;
  }

  function anexar(el, filhos) {
    for (const f of filhos.flat(Infinity)) {
      if (f == null || f === false) continue;
      el.append(typeof f === 'object' && f.nodeType ? f : document.createTextNode(String(f)));
    }
  }

  // ---------- Ícones e peixes ----------
  const CAMINHO_CORPO = 'M3 12c2.5-4.5 7-6 11-4.5 1.6.7 2.7 2.4 3.2 4.5-.5 2.1-1.6 3.8-3.2 4.5-4 1.5-8.5 0-11-4.5z';
  const CAMINHO_CAUDA = 'M16.5 12l5.5-5v10z';

  function peixeGrupo(transform, corpo, cauda, olho, opacidade) {
    return hs(
      'g',
      { transform, opacity: opacidade },
      hs('path', { d: CAMINHO_CORPO, fill: corpo }),
      hs('path', { d: CAMINHO_CAUDA, fill: cauda }),
      hs('circle', { cx: 7.5, cy: 11, r: 1.1, fill: olho }),
    );
  }

  function peixe(corpo, cauda, tamanho, opacidade) {
    return hs('svg', { viewBox: '0 0 24 24', width: tamanho, height: tamanho, 'aria-hidden': 'true' }, peixeGrupo('', corpo, cauda, '#fff', opacidade));
  }

  function icone(caminhos, tamanho = 24) {
    return hs(
      'svg',
      { viewBox: '0 0 24 24', width: tamanho, height: tamanho, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
      caminhos.map((d) => hs('path', { d })),
    );
  }

  const ICONES = {
    sino: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.9 1.9 0 0 0 3.4 0'],
    ok: ['M5 12l5 5 9-10'],
    inicio: ['M3 11l9-8 9 8', 'M5 10v10h14V10'],
    historico: ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'],
    ajustes: ['M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'],
  };

  const HUMORES = [
    { id: 'ativo', rotulo: 'Ativo', cor: '#d6317a', opacidade: 1, frase: 'Nadando pra todo lado' },
    { id: 'calmo', rotulo: 'Calmo', cor: '#2748c9', opacidade: 1, frase: 'Sossegado, na dele' },
    { id: 'bravo', rotulo: 'Bravo', cor: '#b3153f', opacidade: 1, frase: 'Brigando com o reflexo' },
    { id: 'apatico', rotulo: 'Apático', cor: '#8d98c0', opacidade: 1, frase: 'Quietinho demais' },
    { id: 'escondendo', rotulo: 'Se escondendo', cor: '#7a3fd0', opacidade: 0.6, frase: 'Sumiu na decoração' },
  ];

  // ---------- Datas (sempre no fuso configurado) ----------
  const formatadores = new Map();
  function fmt(locale, fuso, opcoes) {
    const chave = locale + fuso + JSON.stringify(opcoes);
    if (!formatadores.has(chave)) formatadores.set(chave, new Intl.DateTimeFormat(locale, { timeZone: fuso, ...opcoes }));
    return formatadores.get(chave);
  }

  const hora = (iso, fuso) => fmt('pt-BR', fuso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  const diaIso = (iso, fuso) => fmt('en-CA', fuso, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function diffDias(a, b) {
    const [aa, am, ad] = a.split('-').map(Number);
    const [ba, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(aa, am - 1, ad) - Date.UTC(ba, bm - 1, bd)) / 86400000);
  }

  function relativo(iso, agoraIso, fuso) {
    const dias = diffDias(diaIso(agoraIso, fuso), diaIso(iso, fuso));
    if (dias <= 0) return 'hoje';
    if (dias === 1) return 'ontem';
    return `há ${dias} dias`;
  }

  function rotuloDia(iso, agoraIso, fuso) {
    const dias = diffDias(diaIso(agoraIso, fuso), diaIso(iso, fuso));
    if (dias <= 0) return 'Hoje';
    if (dias === 1) return 'Ontem';
    return maiuscula(fmt('pt-BR', fuso, { weekday: 'long', day: '2-digit', month: '2-digit' }).format(new Date(iso)));
  }

  const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function dataCurta(dataIso) {
    const [a, m, d] = dataIso.split('-').map(Number);
    return `${SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, ${d} ${MESES[m - 1]}`;
  }

  function duracao(min) {
    const hh = Math.floor(min / 60);
    const mm = min % 60;
    return [hh ? `${hh} h` : '', mm ? `${mm} min` : ''].filter(Boolean).join(' ') || '0 min';
  }

  const temp = (v) => v.toFixed(1).replace('.', ',');

  // ---------- API ----------
  class ErroApi extends Error {
    constructor(status, json) {
      super(json?.erro || `erro ${status}`);
      this.status = status;
      this.json = json;
    }
  }

  async function api(metodo, caminho, corpo) {
    let r;
    try {
      r = await fetch(`/api${caminho}`, {
        method: metodo,
        headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } catch {
      throw new ErroApi(0, null);
    }
    let json = null;
    try {
      json = await r.json();
    } catch {
      /* sem corpo */
    }
    if (r.status === 401 && caminho !== '/login') {
      sessaoExpirou();
      throw new ErroApi(401, json);
    }
    if (!r.ok) throw new ErroApi(r.status, json);
    return json;
  }

  const MENSAGENS = {
    credenciais_invalidas: 'Login ou senha incorretos.',
    senha_atual_incorreta: 'A senha atual está incorreta.',
    senha_igual_a_atual: 'A nova senha deve ser diferente da atual.',
    limite_de_aparelhos: 'Limite de aparelhos com notificação atingido.',
    push_desativado: 'As notificações não estão configuradas no servidor.',
  };

  function mensagemDeErro(e) {
    if (e.status === 0) return 'Sem conexão. Tente de novo.';
    if (e.status === 429) return `Muitas tentativas. Tente de novo em ${e.json?.tenteEmSegundos ?? 60} segundos.`;
    const codigo = e.json?.erro;
    if (e.json?.mensagem) return e.json.mensagem;
    if (codigo && MENSAGENS[codigo]) return MENSAGENS[codigo];
    if (codigo && codigo.includes(' ')) return maiuscula(codigo) + '.';
    return 'Algo deu errado. Tente de novo.';
  }

  // ---------- Estado da tela ----------
  const S = {
    fase: 'carregando', // carregando | login | app | offline
    aba: 'inicio',
    estado: null,
    config: null,
    rascunho: null,
    historico: null,
    apagando: null,
    confirmando: false,
    tipoTroca: 'parcial',
    tempInput: null,
    ocupado: false,
    offline: false,
    erroLogin: '',
    loginTexto: '',
    msgSenha: null,
    push: { carregado: false, suportado: false, ativoNoServidor: false, inscrito: false, permissao: 'default' },
  };

  const $app = document.getElementById('app');
  let temporizadorToast;

  function toast(texto, erro) {
    document.querySelector('.toast')?.remove();
    const el = h('div', { class: erro ? 'toast erro-toast' : 'toast', role: 'status' }, texto);
    document.body.append(el);
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => el.remove(), 2600);
  }

  function sessaoExpirou() {
    S.fase = 'login';
    S.estado = null;
    S.config = null;
    S.historico = null;
    render();
  }

  async function executar(fn, mensagemOk) {
    if (S.ocupado) return;
    S.ocupado = true;
    render();
    try {
      await fn();
      if (mensagemOk) toast(mensagemOk);
    } catch (e) {
      if (e.status !== 401) toast(mensagemDeErro(e), true);
    } finally {
      S.ocupado = false;
      render();
    }
  }

  // ---------- Peças de tela ----------
  const TOM_ALIMENTACAO = { ok: 'ok', agora: 'aviso', atrasada: 'perigo', completa: 'bom' };
  const TOM_TROCA = { ok: 'ok', amanha: 'aviso', hoje: 'aviso', atrasada: 'perigo', sem_registro: 'neutro' };
  const TOM_TEMP = { fria: 'ok', saudavel: 'bom', quente: 'perigo' };

  function pill(texto, tom) {
    return h('span', { class: `pill ${tom || ''}` }, texto);
  }

  function topo(e) {
    const corHumor = HUMORES.find((m) => m.id === e.humor?.tipo)?.cor || '#f25c9a';
    const cena = hs(
      'svg',
      { class: 'cena', viewBox: '0 0 350 124', preserveAspectRatio: 'xMaxYMax slice', 'aria-hidden': 'true' },
      hs('path', { d: 'M0 100 Q44 88 88 100 T176 100 T264 100 T352 100 V124 H0z', fill: '#3a5cd8' }),
      hs('path', { d: 'M0 110 Q44 100 88 110 T176 110 T264 110 T352 110 V124 H0z', fill: '#4a6be0' }),
      hs('circle', { cx: 318, cy: 26, r: 5, fill: 'none', stroke: '#dce7ff', 'stroke-width': 2 }),
      hs('circle', { cx: 334, cy: 46, r: 3, fill: 'none', stroke: '#dce7ff', 'stroke-width': 2 }),
      hs('circle', { cx: 296, cy: 18, r: 3, fill: 'none', stroke: '#dce7ff', 'stroke-width': 2 }),
      peixeGrupo('translate(222 36) scale(3.2)', corHumor === '#2748c9' ? '#7f9bff' : corHumor, '#ffb3d1', '#fff'),
      peixeGrupo('translate(166 74) scale(1.5)', '#dce7ff', '#b7c9ff', '#16204a'),
      peixeGrupo('translate(298 70) scale(1)', '#ffb3d1', '#f25c9a', '#16204a'),
    );
    const data = maiuscula(dataCurta(diaIso(e.agora, e.fuso)));
    return h('header', { class: 'topo' }, cena, h('div', { class: 'texto' }, h('h1', null, 'Shaq o Betta'), h('p', null, `${data} · ${hora(e.agora, e.fuso)}`)));
  }

  function alertas(e) {
    if (e.tudoEmDia) {
      return h(
        'div',
        { class: 'alertas', role: 'status' },
        h('div', { class: 'alerta bom' }, peixe('#14633a', '#6ccba0', 28), h('div', null, h('div', { class: 't' }, 'Tudo em dia'), h('div', { class: 's' }, 'O Shaq está feliz da vida.'))),
      );
    }
    return h(
      'div',
      { class: 'alertas', role: 'status' },
      e.alertas.map((a) => h('div', { class: `alerta ${a.nivel === 'aviso' ? 'aviso' : ''}` }, icone(ICONES.sino), h('div', null, h('div', { class: 't' }, a.titulo), h('div', { class: 's' }, a.sub)))),
    );
  }

  function cartaoRefeicao(e) {
    const a = e.alimentacao;
    let msg;
    if (a.status === 'completa') msg = 'Refeições de hoje completas';
    else if (a.status === 'atrasada') msg = `Atrasada há ${duracao(-a.minutos)}`;
    else if (a.status === 'agora') msg = a.minutos > 0 ? `Daqui a ${duracao(a.minutos)}` : 'Na hora de alimentar';
    else msg = `Faltam ${duracao(a.minutos)}`;

    const pontos = h(
      'span',
      { class: 'pontos', role: 'img', 'aria-label': `Hoje: ${Math.min(a.feitasHoje, a.totalHoje)} de ${a.totalHoje} refeições` },
      Array.from({ length: a.totalHoje }, (_, i) => h('span', { class: i < a.feitasHoje ? 'ponto feito' : 'ponto' })),
    );
    const ultima = a.ultima ? `Última: ${relativo(a.ultima.quando, e.agora, e.fuso)}, ${hora(a.ultima.quando, e.fuso)} · ${a.ultima.bolinhas} bolinhas` : 'Nenhuma refeição registrada ainda';

    const cheio = a.feitasHoje >= a.totalHoje;
    const acao = S.confirmando
      ? h(
          'div',
          { class: 'confirma' },
          h('p', null, `Já foram ${a.feitasHoje} de ${a.totalHoje} hoje. Registrar mesmo assim?`),
          h(
            'div',
            { class: 'botoes' },
            h('button', { class: 'btn sec', type: 'button', onclick: () => { S.confirmando = false; render(); } }, 'Cancelar'),
            h('button', { class: 'btn forte', type: 'button', disabled: S.ocupado, onclick: registrarAlimentacao }, 'Registrar'),
          ),
        )
      : h(
          'button',
          {
            class: 'btn primario',
            type: 'button',
            disabled: S.ocupado,
            onclick: () => {
              if (cheio) {
                S.confirmando = true;
                render();
              } else registrarAlimentacao();
            },
          },
          icone(ICONES.ok),
          `Alimentei · ${a.bolinhas} bolinhas`,
        );

    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'linha' }, h('span', { class: 'rotulo' }, 'Próxima refeição'), pontos),
      h('div', { class: 'linha-base' }, h('span', { class: 'grande' }, a.proxima.horario), h('span', { class: 'sub' }, `${a.proxima.quando === 'hoje' ? 'Hoje' : 'Amanhã'} · ${a.bolinhas} bolinhas`)),
      pill(msg, TOM_ALIMENTACAO[a.status]),
      h('span', { class: 'sub' }, ultima),
      acao,
    );
  }

  function cartaoTroca(e) {
    const t = e.troca;
    let msg = 'Sem registro';
    if (t.status === 'ok') msg = `Em ${t.dias} dias`;
    else if (t.status === 'amanha') msg = 'Amanhã';
    else if (t.status === 'hoje') msg = 'Hoje';
    else if (t.status === 'atrasada') msg = `Atrasada há ${-t.dias} ${-t.dias === 1 ? 'dia' : 'dias'}`;
    const sub = t.ultima
      ? `Última troca ${relativo(t.ultima.quando, e.agora, e.fuso)}, ${t.ultima.tipo} · a cada ${t.intervaloDias} ${t.intervaloDias === 1 ? 'dia' : 'dias'}`
      : 'Registre a primeira troca de água';

    return h(
      'section',
      { class: 'card' },
      h('span', { class: 'rotulo' }, 'Trocar a água'),
      h('div', { class: 'linha' }, h('span', { class: 'medio' }, t.proximaData ? dataCurta(t.proximaData) : '—'), pill(msg, TOM_TROCA[t.status])),
      h('span', { class: 'sub' }, sub),
      h(
        'div',
        { class: 'acoes' },
        h(
          'div',
          { class: 'seg', role: 'group', 'aria-label': 'Tipo de troca' },
          ['parcial', 'total'].map((tipo) =>
            h('button', { type: 'button', 'aria-pressed': S.tipoTroca === tipo, onclick: () => { S.tipoTroca = tipo; render(); } }, maiuscula(tipo)),
          ),
        ),
        h('button', { class: 'btn rosa', type: 'button', disabled: S.ocupado, onclick: registrarTroca }, 'Troquei a água'),
      ),
    );
  }

  const DICA_TEMP = { fria: 'Frio demais: confira o aquecedor.', saudavel: 'Na faixa certa.', quente: 'Quente demais: confira o aquecedor e a luz.' };

  function cartaoTemperatura(e) {
    const t = e.temperatura;
    const lim = e.limitesTemperatura;
    if (S.tempInput === null) S.tempInput = t ? t.valor : 25.5;

    let escala = null;
    if (t) {
      const min = Math.min(18, lim.minima - 2);
      const max = Math.max(32, lim.maxima + 2);
      const pos = (v) => `${(Math.max(min, Math.min(max, v)) - min) / (max - min) * 100}%`;
      const parte = (cls, tamanho) => {
        const el = h('div', { class: cls });
        el.style.flexGrow = String(tamanho);
        return el;
      };
      const marcador = h('div', { class: 'marcador' });
      marcador.style.left = pos(t.valor);
      const marca = (v) => {
        const el = h('span', { class: 'marca' }, `${Number.isInteger(v) ? v : temp(v)}°`);
        el.style.left = pos(v);
        return el;
      };
      escala = h(
        'div',
        { class: 'escala', role: 'img', 'aria-label': `Medição de ${temp(t.valor)} graus em uma escala de ${min} a ${max}` },
        h('div', { class: 'faixa' }, parte('frio', lim.minima - min), parte('bom', lim.maxima - lim.minima), parte('quente', max - lim.maxima)),
        marcador,
        marca(lim.minima),
        marca(lim.maxima),
      );
    }

    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'linha' }, h('span', { class: 'rotulo' }, 'Temperatura'), pill(t ? t.rotulo : 'Sem registro', t ? TOM_TEMP[t.faixa] : 'neutro')),
      h('span', { class: 'grande' }, t ? `${temp(t.valor)} °C` : '—'),
      h('span', { class: 'sub' }, t ? `${DICA_TEMP[t.faixa]} Medida ${relativo(t.quando, e.agora, e.fuso)}, ${hora(t.quando, e.fuso)}.` : 'Registre a primeira medição.'),
      escala,
      h(
        'div',
        { class: 'stepper' },
        h('button', { type: 'button', 'aria-label': 'Diminuir temperatura', onclick: () => { S.tempInput = Math.max(10, Math.round((S.tempInput - 0.5) * 10) / 10); render(); } }, '−'),
        h('span', { class: 'valor' }, `${temp(S.tempInput)} °C`),
        h('button', { type: 'button', 'aria-label': 'Aumentar temperatura', onclick: () => { S.tempInput = Math.min(40, Math.round((S.tempInput + 0.5) * 10) / 10); render(); } }, '+'),
      ),
      h('button', { class: 'btn rosa', type: 'button', disabled: S.ocupado, onclick: registrarTemperatura }, 'Registrar temperatura'),
    );
  }

  function cartaoHumor(e) {
    const atual = HUMORES.find((m) => m.id === e.humor?.tipo);
    return h(
      'section',
      { class: 'card' },
      h('span', { class: 'rotulo' }, 'Humor do Shaq'),
      h('span', { class: 'titulo' }, atual ? atual.frase : 'Como está o Shaq agora?'),
      h('span', { class: 'sub' }, e.humor ? `Registrado ${relativo(e.humor.quando, e.agora, e.fuso)}, ${hora(e.humor.quando, e.fuso)}` : 'Toque no humor de agora.'),
      h(
        'div',
        { class: 'humores' },
        HUMORES.map((m) =>
          h(
            'button',
            { class: 'humor', type: 'button', 'aria-pressed': atual?.id === m.id, disabled: S.ocupado, onclick: () => registrarHumor(m) },
            peixe(m.cor, m.cor, 26, m.opacidade),
            m.rotulo,
          ),
        ),
      ),
    );
  }

  function cartaoLuz(e) {
    const l = e.luz;
    const msg = l.ok ? (l.esperada ? 'Acesa, como deve ser' : 'Apagada, como deve ser') : l.esperada ? 'Hora de acender a luz' : 'Hora de apagar a luz';
    return h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'linha' },
        h('div', null, h('span', { class: 'rotulo' }, 'Luz do aquário'), h('div', { class: 'titulo' }, l.esperada ? 'Dia: luz acesa' : 'Noite: luz apagada')),
        h('button', { class: 'chave', type: 'button', role: 'switch', 'aria-checked': l.ligada, 'aria-label': 'Luz acesa', disabled: S.ocupado, onclick: alternarLuz }),
      ),
      h('span', { class: 'sub' }, `${l.esperada ? 'Apaga' : 'Acende'} às ${l.proximaMudanca}, em ${duracao(l.minutosParaMudar)}`),
      pill(msg, l.ok ? 'ok' : 'perigo'),
    );
  }

  // ---------- Ações ----------
  async function registrarAlimentacao() {
    await executar(async () => {
      S.estado = (await api('POST', '/alimentacoes', {})).estado;
      S.confirmando = false;
      S.historico = null;
    }, 'Alimentação registrada');
  }

  async function registrarTroca() {
    await executar(async () => {
      S.estado = (await api('POST', '/limpezas', { tipo: S.tipoTroca })).estado;
      S.historico = null;
    }, 'Troca de água registrada');
  }

  async function registrarTemperatura() {
    await executar(async () => {
      S.estado = (await api('POST', '/temperaturas', { valor: S.tempInput })).estado;
      S.historico = null;
    }, 'Temperatura registrada');
  }

  async function registrarHumor(m) {
    if (S.estado?.humor?.tipo === m.id) return;
    await executar(async () => {
      S.estado = (await api('POST', '/humores', { tipo: m.id })).estado;
      S.historico = null;
    }, `Humor: ${m.rotulo.toLowerCase()}`);
  }

  async function alternarLuz() {
    await executar(async () => {
      S.estado = (await api('PUT', '/luz', { ligada: !S.estado.luz.ligada })).estado;
    });
  }

  async function recarregarEstado() {
    try {
      S.estado = await api('GET', '/estado');
      S.offline = false;
    } catch (e) {
      if (e.status === 0) S.offline = true;
    }
    render();
  }

  async function carregarHistorico() {
    try {
      S.historico = (await api('GET', '/historico?dias=30')).itens;
      S.offline = false;
    } catch (e) {
      if (e.status === 0) S.offline = true;
      else if (e.status !== 401) toast(mensagemDeErro(e), true);
    }
    render();
  }

  const ROTA_TIPO = { alimentacao: 'alimentacoes', limpeza: 'limpezas', temperatura: 'temperaturas', humor: 'humores' };

  async function apagarRegistro(item) {
    await executar(async () => {
      await api('DELETE', `/${ROTA_TIPO[item.tipo]}/${item.id}`);
      S.apagando = null;
      S.historico = (await api('GET', '/historico?dias=30')).itens;
      S.estado = await api('GET', '/estado');
    }, 'Registro apagado');
  }

  // ---------- Histórico ----------
  const COR_TIPO = { alimentacao: '#2748c9', limpeza: '#d6317a', temperatura: '#16204a', humor: '#7a3fd0' };
  const NOME_TIPO = { alimentacao: 'Alimentação', limpeza: 'Troca de água', temperatura: 'Temperatura', humor: 'Humor' };

  function detalhe(item) {
    if (item.tipo === 'alimentacao') return `${item.bolinhas} bolinhas`;
    if (item.tipo === 'limpeza') return maiuscula(item.troca);
    if (item.tipo === 'temperatura') return `${temp(item.valor)} °C`;
    return item.rotulo;
  }

  function telaHistorico() {
    const e = S.estado;
    if (!S.historico || !e) return [h('h1', { class: 'titulo-tela' }, 'Histórico'), h('p', { class: 'sub' }, 'Carregando...')];
    const filhos = [
      h('div', null, h('h1', { class: 'titulo-tela' }, 'Histórico'), h('p', { class: 'sub' }, 'Apague um registro feito por engano; os horários se recalculam.')),
    ];
    if (!S.historico.length) filhos.push(h('p', { class: 'sub' }, 'Nenhum registro nos últimos 30 dias.'));
    let anterior = null;
    for (const item of S.historico) {
      const dia = rotuloDia(item.quando, e.agora, e.fuso);
      if (dia !== anterior) {
        filhos.push(h('div', { class: 'dia' }, dia));
        anterior = dia;
      }
      const chave = `${item.tipo}:${item.id}`;
      const confirmando = S.apagando === chave;
      const bolinha = h('span', { class: 'bolinha' });
      bolinha.style.background = COR_TIPO[item.tipo];
      filhos.push(
        h(
          'div',
          { class: 'item' },
          bolinha,
          h('div', { class: 'txt' }, h('div', { class: 't' }, NOME_TIPO[item.tipo]), h('div', { class: 'sub' }, `${hora(item.quando, e.fuso)} · ${detalhe(item)}`)),
          h(
            'button',
            {
              class: 'btn perigo pequeno',
              type: 'button',
              disabled: S.ocupado,
              'aria-label': confirmando ? 'Confirmar apagar registro' : `Apagar ${NOME_TIPO[item.tipo]} das ${hora(item.quando, e.fuso)}`,
              onclick: () => {
                if (confirmando) apagarRegistro(item);
                else {
                  S.apagando = chave;
                  render();
                }
              },
            },
            confirmando ? 'Confirmar?' : 'Apagar',
          ),
        ),
      );
    }
    return filhos;
  }

  // ---------- Ajustes ----------
  const FUSOS = ['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza', 'America/Bahia', 'America/Cuiaba', 'America/Rio_Branco', 'America/Noronha', 'Europe/Lisbon', 'UTC'];

  function stepper(nome, valorTexto, menos, mais) {
    return h(
      'div',
      { class: 'linha' },
      h('span', { class: 'nome' }, nome),
      h(
        'div',
        { class: 'stepper' },
        h('button', { type: 'button', 'aria-label': `Diminuir: ${nome}`, onclick: menos }, '−'),
        h('span', { class: 'valor' }, valorTexto),
        h('button', { type: 'button', 'aria-label': `Aumentar: ${nome}`, onclick: mais }, '+'),
      ),
    );
  }

  const arred1 = (v) => Math.round(v * 10) / 10;

  function ajustar(campo, delta, min, max) {
    const r = S.rascunho;
    r[campo] = Math.max(min, Math.min(max, arred1(r[campo] + delta)));
    render();
  }

  function mudarRefeicoes(delta) {
    const r = S.rascunho;
    const novo = Math.max(1, Math.min(6, r.refeicoesPorDia + delta));
    if (novo === r.refeicoesPorDia) return;
    if (novo > r.refeicoesPorDia) {
      const ultimo = r.horarios[r.horarios.length - 1] || '08:00';
      const proxima = Math.min(23, Number(ultimo.slice(0, 2)) + 3);
      r.horarios.push(`${String(proxima).padStart(2, '0')}:${ultimo.slice(3)}`);
    } else r.horarios.pop();
    r.refeicoesPorDia = novo;
    render();
  }

  async function salvarAjustes() {
    await executar(async () => {
      const r = S.rascunho;
      const resposta = await api('PUT', '/configuracao', {
        refeicoesPorDia: r.refeicoesPorDia,
        horarios: r.horarios,
        bolinhasPorRefeicao: r.bolinhasPorRefeicao,
        intervaloTrocaDias: r.intervaloTrocaDias,
        luzAcende: r.luzAcende,
        luzApaga: r.luzApaga,
        tempMinima: r.tempMinima,
        tempMaxima: r.tempMaxima,
        fusoHorario: r.fusoHorario,
      });
      S.config = resposta.configuracao;
      S.rascunho = structuredClone(S.config);
      S.estado = resposta.estado;
    }, 'Ajustes salvos');
  }

  async function carregarConfig() {
    try {
      S.config = await api('GET', '/configuracao');
      S.rascunho = structuredClone(S.config);
    } catch (e) {
      if (e.status !== 401) toast(mensagemDeErro(e), true);
    }
    await atualizarPush();
    render();
  }

  // ----- notificações -----
  const ehIphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const instalado = () => navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

  function chaveParaBytes(base64url) {
    const preenchido = base64url + '='.repeat((4 - (base64url.length % 4)) % 4);
    const bruto = atob(preenchido.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
  }

  async function atualizarPush() {
    const p = S.push;
    p.suportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    p.permissao = 'Notification' in window ? Notification.permission : 'denied';
    try {
      p.ativoNoServidor = (await api('GET', '/push/chave')).ativo;
    } catch {
      p.ativoNoServidor = false;
    }
    p.inscrito = false;
    if (p.suportado) {
      try {
        const reg = await navigator.serviceWorker.ready;
        p.inscrito = Boolean(await reg.pushManager.getSubscription());
      } catch {
        /* sem service worker */
      }
    }
    p.carregado = true;
  }

  async function ativarNotificacoes() {
    await executar(async () => {
      const permissao = await Notification.requestPermission();
      S.push.permissao = permissao;
      if (permissao !== 'granted') throw new ErroApi(400, { erro: 'Permissão negada. Libere as notificações nos Ajustes do iPhone' });
      const { chave } = await api('GET', '/push/chave');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) });
      const { endpoint, keys } = sub.toJSON();
      await api('POST', '/push/inscrever', { endpoint, keys });
      S.push.inscrito = true;
    }, 'Notificações ativadas');
  }

  async function desativarNotificacoes() {
    await executar(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api('DELETE', '/push/inscrever', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      S.push.inscrito = false;
    }, 'Notificações desativadas');
  }

  async function testarNotificacao() {
    await executar(async () => {
      const r = await api('POST', '/push/testar', {});
      if (!r.enviados) throw new ErroApi(400, { erro: 'Não consegui enviar o teste. Ative as notificações de novo' });
    }, 'Teste enviado');
  }

  async function mudarAviso(chave, valor) {
    await executar(async () => {
      S.config.avisos = (await api('PUT', '/notificacoes', { [chave]: valor })).avisos;
    });
  }

  const AVISOS = [
    { chave: 'comer', nome: 'Hora de comer', desc: 'No horário de cada refeição' },
    { chave: 'agua', nome: 'Trocar a água', desc: 'No dia previsto, a partir das 09:00' },
    { chave: 'luz', nome: 'Luz do aquário', desc: 'Quando for hora de acender ou apagar' },
    { chave: 'temp', nome: 'Temperatura fora da faixa', desc: 'Frio demais ou quente demais' },
    { chave: 'humor', nome: 'Humor preocupante', desc: 'Apático ou se escondendo' },
  ];

  function secaoNotificacoes() {
    const p = S.push;
    const cabecalho = h('div', null, h('h2', { class: 'titulo' }, 'Notificações'), h('p', { class: 'sub' }, 'Avisos no iPhone, mesmo com o app fechado.'));
    if (!p.carregado) return h('section', { class: 'card' }, cabecalho, h('p', { class: 'sub' }, 'Verificando...'));
    if (!p.suportado) {
      const texto = ehIphone && !instalado()
        ? 'No iPhone, primeiro instale o app: toque em Compartilhar e depois em "Adicionar à Tela de Início". Abra pelo ícone e ative aqui.'
        : 'Este navegador não suporta notificações.';
      return h('section', { class: 'card' }, cabecalho, h('p', { class: 'sub' }, texto));
    }
    if (!p.ativoNoServidor) {
      return h('section', { class: 'card' }, cabecalho, h('p', { class: 'sub' }, 'As notificações ainda não foram configuradas no servidor (chaves VAPID).'));
    }
    if (p.permissao === 'denied') {
      return h('section', { class: 'card' }, cabecalho, h('p', { class: 'sub' }, 'As notificações estão bloqueadas. Libere em Ajustes do iPhone, Notificações, Shaq o Betta.'));
    }
    const botoes = p.inscrito
      ? h(
          'div',
          { class: 'acoes' },
          h('button', { class: 'btn sec pequeno', type: 'button', style: null, disabled: S.ocupado, onclick: testarNotificacao }, 'Enviar teste'),
          h('button', { class: 'btn perigo pequeno', type: 'button', disabled: S.ocupado, onclick: desativarNotificacoes }, 'Desativar'),
        )
      : h('button', { class: 'btn primario', type: 'button', disabled: S.ocupado, onclick: ativarNotificacoes }, 'Ativar neste iPhone');
    const lista = p.inscrito
      ? h(
          'div',
          { class: 'lista' },
          AVISOS.map((a) =>
            h(
              'div',
              { class: 'linha' },
              h('div', null, h('div', { class: 'nome' }, a.nome), h('div', { class: 'desc' }, a.desc)),
              h('button', { class: 'chave', type: 'button', role: 'switch', 'aria-checked': S.config.avisos[a.chave], 'aria-label': a.nome, disabled: S.ocupado, onclick: () => mudarAviso(a.chave, !S.config.avisos[a.chave]) }),
            ),
          ),
        )
      : null;
    return h('section', { class: 'card' }, cabecalho, botoes, lista);
  }

  // ----- senha -----
  async function trocarSenha(ev) {
    ev.preventDefault();
    const f = ev.target;
    const atual = f.elements.atual.value;
    const nova = f.elements.nova.value;
    if (nova !== f.elements.confirmar.value) {
      S.msgSenha = { erro: true, texto: 'A confirmação não confere com a nova senha.' };
      render();
      return;
    }
    await executar(async () => {
      try {
        await api('POST', '/senha', { atual, nova });
        S.msgSenha = { erro: false, texto: 'Senha alterada. Os outros aparelhos foram desconectados.' };
      } catch (e) {
        S.msgSenha = { erro: true, texto: mensagemDeErro(e) };
        throw e;
      }
    });
  }

  async function sair() {
    await executar(async () => {
      await api('POST', '/logout', {});
      S.fase = 'login';
      S.estado = null;
      S.config = null;
      S.historico = null;
    });
  }

  function telaAjustes() {
    const r = S.rascunho;
    if (!r) return [h('h1', { class: 'titulo-tela' }, 'Ajustes'), h('p', { class: 'sub' }, 'Carregando...')];

    const linhasHorarios = r.horarios.map((horario, i) =>
      h('input', {
        type: 'time',
        value: horario,
        step: 60,
        required: true,
        'aria-label': `Horário da refeição ${i + 1}`,
        onchange: (ev) => {
          if (ev.target.value) r.horarios[i] = ev.target.value;
        },
      }),
    );

    const fusos = FUSOS.includes(r.fusoHorario) ? FUSOS : [r.fusoHorario, ...FUSOS];

    return [
      h('div', null, h('h1', { class: 'titulo-tela' }, 'Ajustes'), h('p', { class: 'sub' }, 'Valem para os próximos registros e cálculos.')),

      h(
        'section',
        { class: 'lista' },
        stepper('Refeições por dia', String(r.refeicoesPorDia), () => mudarRefeicoes(-1), () => mudarRefeicoes(1)),
        h('div', { class: 'horarios' }, h('span', { class: 'desc' }, 'Horários das refeições'), linhasHorarios),
        stepper('Bolinhas por refeição', String(r.bolinhasPorRefeicao), () => ajustar('bolinhasPorRefeicao', -1, 1, 20), () => ajustar('bolinhasPorRefeicao', 1, 1, 20)),
        stepper('Trocar a água a cada', `${r.intervaloTrocaDias} ${r.intervaloTrocaDias === 1 ? 'dia' : 'dias'}`, () => ajustar('intervaloTrocaDias', -1, 1, 60), () => ajustar('intervaloTrocaDias', 1, 1, 60)),
      ),

      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'titulo' }, 'Luz e temperatura'),
        h(
          'div',
          { class: 'form' },
          h('label', null, 'Luz acende às', h('input', { type: 'time', value: r.luzAcende, required: true, onchange: (ev) => { if (ev.target.value) r.luzAcende = ev.target.value; } })),
          h('label', null, 'Luz apaga às', h('input', { type: 'time', value: r.luzApaga, required: true, onchange: (ev) => { if (ev.target.value) r.luzApaga = ev.target.value; } })),
        ),
        stepper('Temperatura mínima', `${temp(r.tempMinima)} °C`, () => ajustar('tempMinima', -0.5, 10, 40), () => ajustar('tempMinima', 0.5, 10, 40)),
        stepper('Temperatura máxima', `${temp(r.tempMaxima)} °C`, () => ajustar('tempMaxima', -0.5, 10, 40), () => ajustar('tempMaxima', 0.5, 10, 40)),
        h('p', { class: 'sub' }, 'Abaixo da mínima: "Peixe congelando". A partir da máxima: "Peixe frito".'),
        h('label', null, 'Fuso horário', h('select', { onchange: (ev) => { r.fusoHorario = ev.target.value; } }, fusos.map((f) => h('option', { value: f, selected: f === r.fusoHorario }, f)))),
      ),

      h('button', { class: 'btn primario cheio', type: 'button', disabled: S.ocupado, onclick: salvarAjustes }, 'Salvar ajustes'),

      secaoNotificacoes(),

      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'titulo' }, 'Trocar a senha'),
        h(
          'form',
          { class: 'form', onsubmit: trocarSenha },
          h('label', null, 'Senha atual', h('input', { type: 'password', name: 'atual', autocomplete: 'current-password', required: true, maxlength: 200 })),
          h('label', null, 'Nova senha (mínimo 12 caracteres)', h('input', { type: 'password', name: 'nova', autocomplete: 'new-password', required: true, minlength: 12, maxlength: 200 })),
          h('label', null, 'Repita a nova senha', h('input', { type: 'password', name: 'confirmar', autocomplete: 'new-password', required: true, minlength: 12, maxlength: 200 })),
          S.msgSenha ? h('p', { class: S.msgSenha.erro ? 'erro' : 'ok-texto', role: 'alert' }, S.msgSenha.texto) : null,
          h('button', { class: 'btn sec', type: 'submit', disabled: S.ocupado }, 'Trocar a senha'),
        ),
      ),

      h('button', { class: 'btn perigo cheio', type: 'button', disabled: S.ocupado, onclick: sair }, 'Sair'),
    ];
  }

  // ---------- Login ----------
  async function entrar(ev) {
    ev.preventDefault();
    if (S.ocupado) return;
    const f = ev.target;
    S.ocupado = true;
    S.erroLogin = '';
    render();
    try {
      await api('POST', '/login', { login: f.elements.login.value, senha: f.elements.senha.value });
      S.estado = await api('GET', '/estado');
      S.fase = 'app';
      S.aba = 'inicio';
      S.tempInput = null;
    } catch (e) {
      S.erroLogin = mensagemDeErro(e);
    } finally {
      S.ocupado = false;
      render();
    }
  }

  function telaLogin() {
    return h(
      'main',
      { class: 'tela sem-nav' },
      h(
        'div',
        { class: 'login' },
        h('div', { class: 'marca' }, peixe('#d6317a', '#2748c9', 72), h('h1', { class: 'titulo-tela' }, 'Shaq o Betta'), h('p', { class: 'sub' }, 'Entre para cuidar do Shaq.')),
        h(
          'form',
          { class: 'card form', onsubmit: entrar },
          h('label', null, 'Login', h('input', { type: 'text', name: 'login', value: S.loginTexto, oninput: (ev) => { S.loginTexto = ev.target.value; }, autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true, maxlength: 100 })),
          h('label', null, 'Senha', h('input', { type: 'password', name: 'senha', autocomplete: 'current-password', required: true, maxlength: 200 })),
          S.erroLogin ? h('p', { class: 'erro', role: 'alert' }, S.erroLogin) : null,
          h('button', { class: 'btn primario', type: 'submit', disabled: S.ocupado }, S.ocupado ? 'Entrando...' : 'Entrar'),
        ),
      ),
    );
  }

  // ---------- Estrutura geral ----------
  function navegacao() {
    const abas = [
      ['inicio', 'Início', ICONES.inicio],
      ['historico', 'Histórico', ICONES.historico],
      ['ajustes', 'Ajustes', ICONES.ajustes],
    ];
    return h(
      'nav',
      { class: 'nav', 'aria-label': 'Principal' },
      h(
        'div',
        { class: 'dentro' },
        abas.map(([id, nome, caminhos]) => h('button', { type: 'button', 'aria-current': S.aba === id ? 'page' : null, onclick: () => irPara(id) }, icone(caminhos), nome)),
      ),
    );
  }

  function irPara(aba) {
    if (S.aba === aba) return;
    S.aba = aba;
    S.confirmando = false;
    S.apagando = null;
    S.msgSenha = null;
    render();
    window.scrollTo(0, 0);
    if (aba === 'historico') carregarHistorico();
    if (aba === 'inicio') recarregarEstado();
    if (aba === 'ajustes') carregarConfig();
  }

  function telaApp() {
    let conteudo;
    if (S.aba === 'inicio') {
      const e = S.estado;
      conteudo = e ? [topo(e), alertas(e), cartaoRefeicao(e), cartaoTroca(e), cartaoTemperatura(e), cartaoHumor(e), cartaoLuz(e)] : [h('p', { class: 'sub' }, 'Carregando...')];
    } else if (S.aba === 'historico') conteudo = telaHistorico();
    else conteudo = telaAjustes();
    return h('div', null, h('main', { class: 'tela' }, h('div', { class: 'pilha' }, S.offline ? h('div', { class: 'faixa-offline', role: 'status' }, 'Sem conexão. Mostrando o último estado conhecido.') : null, conteudo)), navegacao());
  }

  function telaMensagem(texto, botao) {
    return h('main', { class: 'tela sem-nav' }, h('div', { class: 'login' }, h('div', { class: 'marca' }, peixe('#d6317a', '#2748c9', 72), h('p', null, texto)), botao));
  }

  function render() {
    const y = window.scrollY;
    let tela;
    if (S.fase === 'login') tela = telaLogin();
    else if (S.fase === 'app') tela = telaApp();
    else if (S.fase === 'offline') tela = telaMensagem('Sem conexão com o servidor.', h('button', { class: 'btn primario', type: 'button', onclick: iniciar }, 'Tentar de novo'));
    else tela = telaMensagem('Carregando...');
    $app.replaceChildren(tela);
    window.scrollTo(0, y);
  }

  async function iniciar() {
    S.fase = 'carregando';
    render();
    try {
      S.estado = await api('GET', '/estado');
      S.fase = 'app';
    } catch (e) {
      S.fase = e.status === 401 ? 'login' : 'offline';
    }
    render();
  }

  // ---------- Início ----------
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || S.fase !== 'app' || S.ocupado) return;
    if (S.aba === 'inicio') recarregarEstado();
    if (S.aba === 'historico') carregarHistorico();
  });

  setInterval(() => {
    if (document.visibilityState === 'visible' && S.fase === 'app' && S.aba === 'inicio' && !S.ocupado) recarregarEstado();
  }, 60000);

  iniciar();
})();
