// Tela do modo de teste (janela #dlg-teste). A lógica e a estatística ficam em js/teste.js.

import { corDoBotao, formaDoBotao } from './layout.js';
import { criarSessao, gerarCsv, resumir, resumirPorBloco } from './teste.js';

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

const CRITERIO_ACERTO = 0.9;   // hipótese do artigo: acerto mínimo de 90%

const porcentagem = (f) => (f === null ? '—' : `${Math.round(f * 1000) / 10}%`.replace('.', ','));
const segundos = (ms) => (ms === null ? '—' : `${(ms / 1000).toFixed(2).replace('.', ',')} s`);

// ctx: { estado, botao, pictoHTML, avisar, abrirConexao, conectarDemonstracao, banco }
export function configurarModoTeste(ctx) {
  const dialogo = $('#dlg-teste');
  let sessao = null;
  let indice = 0;
  let aguardando = null;        // 'aperto' | 'confirmacao' | null
  let pedidoEm = 0;
  let ultimaApertada = null;    // tentativa à espera do AUDIO da placa
  let desligar = [];            // remove os ouvintes da placa ao terminar
  let ordemAleatoria = true;

  const tentativa = () => sessao?.tentativas[indice];

  function mostrar(secao) {
    for (const id of ['teste-config', 'teste-andamento', 'teste-resultado']) $(`#${id}`).hidden = id !== secao;
  }

  // ---------------------------------------------------------------- configuração

  function atualizarTotal() {
    const r = Number($('#teste-repeticoes').value);
    $('#teste-total').textContent = `${r}× · ${r * ctx.estado.placa.botoes.length} apertos`;
  }

  async function abrir() {
    if (sessao && !sessao.fim) {          // teste em andamento: só reabre a janela
      if (!dialogo.open) dialogo.showModal();
      return;
    }
    mostrar('teste-config');
    const conectada = Boolean(ctx.estado.dispositivo);
    $('#teste-sem-placa').hidden = conectada;
    $('#teste-iniciar').disabled = !conectada;
    atualizarTotal();
    await renderHistorico();
    if (!dialogo.open) dialogo.showModal();
  }

  async function renderHistorico() {
    const sessoes = (await ctx.banco.listarTestes().catch(() => [])).sort((a, b) => b.id.localeCompare(a.id));
    $('#teste-historico').hidden = !sessoes.length;
    $('#teste-lista').innerHTML = sessoes.map((s) => {
      const r = resumir(s.tentativas);
      const data = new Date(s.inicio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      return `<li data-id="${s.id}">
        <span><b>${data}</b> · ${escapar(s.avaliador)}<small>${r.acionamentos} apertos · acerto ${porcentagem(r.acertoAudio)} · ${segundos(r.tempo.media)}</small></span>
        <button type="button" class="btn link" data-acao="ver">Ver</button>
        <button type="button" class="btn link" data-acao="csv">CSV</button>
      </li>`;
    }).join('');
    $('#teste-lista').onclick = (e) => {
      const acao = e.target.closest('[data-acao]')?.dataset.acao;
      const id = e.target.closest('li')?.dataset.id;
      const escolhida = sessoes.find((s) => s.id === id);
      if (!escolhida) return;
      if (acao === 'ver') renderResultado(escolhida);
      if (acao === 'csv') baixarCsv(escolhida);
    };
  }

  // ---------------------------------------------------------------- andamento

  function iniciar() {
    const d = ctx.estado.dispositivo;
    if (!d) return;
    sessao = criarSessao({
      avaliador: $('#teste-avaliador').value.trim(),
      repeticoes: Number($('#teste-repeticoes').value),
      aleatoria: ordemAleatoria,
      confirmarAudio: $('#teste-confirmar').checked,
      placa: ctx.estado.placa,
      dispositivo: d.simulado ? 'demonstração' : d.nome,
    });
    indice = 0;
    desligar = [
      d.aoAcionarBotao(aoApertar),
      d.aoIniciarAudio(aoComecarAudio),
      d.aoDesconectar(() => {
        ctx.avisar('A placa desconectou: o teste foi encerrado e o que já foi feito está salvo.', 'erro');
        finalizar();
      }),
    ];
    $('#teste-dica-demo').hidden = !d.simulado;
    renderMini();
    mostrar('teste-andamento');
    mostrarTentativa();
  }

  function renderMini() {
    const botoes = ctx.estado.placa.botoes;
    $('#teste-mini').innerHTML = [0, 1].map((fileira) => `<div class="teste-mini-fileira">${botoes
      .filter((b) => b.fileira === fileira)
      .map((b) => `<button type="button" class="teste-mini-botao" data-numero="${b.numero}" style="--botao-cor:${corDoBotao(b).cor}" tabindex="-1"><span>${b.assento}</span></button>`)
      .join('')}</div>`).join('');
  }

  function mostrarTentativa() {
    const t = tentativa();
    const b = ctx.botao(t.alvo);
    const total = sessao.tentativas.length;
    $('#teste-contador').textContent = `Tentativa ${indice + 1} de ${total}`;
    $('#teste-barra').style.width = `${(indice / total) * 100}%`;
    $('#teste-alvo').innerHTML = `
      <span class="teste-alvo-picto">${ctx.pictoHTML(b)}</span>
      <span class="teste-alvo-texto">
        <small>Aperte o botão</small>
        <strong>${t.assento} · ${escapar(t.frase)}</strong>
        <small>${corDoBotao(b).nome} sobre ${formaDoBotao(b).nome} · ${escapar(t.bloco)}</small>
      </span>`;
    $$('.teste-mini-botao').forEach((el) => {
      el.classList.toggle('alvo', Number(el.dataset.numero) === t.alvo);
      el.classList.remove('apertado', 'errado');
    });
    $('#teste-confirmacao').hidden = true;
    $('#teste-estado').textContent = 'Aguardando o aperto…';
    aguardando = 'aperto';
    pedidoEm = performance.now();
  }

  function aoApertar(numero) {
    if (aguardando !== 'aperto' || !sessao) return;
    const t = tentativa();
    const apertado = ctx.botao(numero);
    Object.assign(t, {
      apertado: numero,
      assentoApertado: apertado.assento,
      botaoCerto: numero === t.alvo,
      reacaoMs: Math.round(performance.now() - pedidoEm),
    });
    ultimaApertada = t;
    const marcador = $(`.teste-mini-botao[data-numero="${numero}"]`);
    marcador?.classList.add(t.botaoCerto ? 'apertado' : 'errado');
    $('#teste-estado').textContent = t.botaoCerto
      ? `Botão ${apertado.assento} apertado.`
      : `Foi apertado o ${apertado.assento}, e não o ${t.assento}.`;

    if (sessao.confirmarAudio) {
      aguardando = 'confirmacao';
      $('#teste-pergunta').textContent = `O áudio tocado foi “${apertado.texto}”?`;
      $('#teste-confirmacao').hidden = false;
      $('#teste-confirmacao button').focus();
    } else {
      aguardando = null;
      t.audio = 'nao-confirmado';
      setTimeout(proxima, 1500);           // dá tempo de o áudio começar e ser medido
    }
  }

  function aoComecarAudio(numero, ms) {
    const t = ultimaApertada;
    if (!t || t.apertado !== numero || t.respostaMs !== null) return;
    t.respostaMs = ms;
    if (t === tentativa()) {
      $('#teste-estado').textContent += ` O áudio começou em ${segundos(ms)}.`;
    }
  }

  function responder(audio) {
    if (aguardando !== 'confirmacao') return;
    tentativa().audio = audio;
    aguardando = null;
    proxima();
  }

  function pular() {
    if (!sessao || sessao.fim) return;
    tentativa().audio = 'pulada';
    aguardando = null;
    proxima();
  }

  function proxima() {
    if (!sessao || sessao.fim) return;
    indice += 1;
    if (indice >= sessao.tentativas.length) finalizar();
    else mostrarTentativa();
  }

  async function finalizar() {
    if (!sessao || sessao.fim) return;
    aguardando = null;
    desligar.forEach((remover) => remover());
    desligar = [];
    sessao.fim = new Date().toISOString();
    const feita = sessao.tentativas.some((t) => t.audio);
    if (feita) await ctx.banco.salvarTeste(sessao).catch(() => ctx.avisar('Não foi possível salvar o teste neste navegador.', 'erro'));
    if (feita) renderResultado(sessao);
    else abrir();
  }

  // ---------------------------------------------------------------- resultado

  function renderResultado(s) {
    const r = resumir(s.tentativas);
    const data = new Date(s.inicio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    $('#teste-resumo-sessao').textContent =
      `${data} · ${s.avaliador} · ${s.dispositivo} · ${s.repeticoes}× por botão, ordem ${s.aleatoria ? 'aleatória' : 'em sequência'}`;
    $('#teste-cards').innerHTML = [
      ['Acerto do áudio', porcentagem(r.acertoAudio), s.confirmarAudio ? `${r.audiosJulgados} confirmados` : 'não confirmado nesta sessão'],
      ['Botão certo', porcentagem(r.botaoCerto), `${r.acionamentos} apertos`],
      ['Tempo de resposta', segundos(r.tempo.media), r.tempo.n ? `mediana ${segundos(r.tempo.mediana)} · DP ${segundos(r.tempo.dp)}` : 'sem medição'],
      ['Puladas', String(r.puladas), 'tentativas'],
    ].map(([rotulo, valor, detalhe]) => `<div class="teste-card"><small>${rotulo}</small><strong>${valor}</strong><span>${detalhe}</span></div>`).join('');

    const criterio = $('#teste-criterio');
    if (r.acertoAudio === null) {
      criterio.textContent = 'Sem confirmação do áudio: não dá para avaliar o critério de acerto do artigo (≥ 90%).';
      criterio.className = 'teste-criterio';
    } else {
      const atingiu = r.acertoAudio >= CRITERIO_ACERTO;
      criterio.textContent = atingiu
        ? `Atingiu o critério do artigo: acerto de ${porcentagem(r.acertoAudio)} (mínimo 90%).`
        : `Abaixo do critério do artigo: acerto de ${porcentagem(r.acertoAudio)} (mínimo 90%).`;
      criterio.className = `teste-criterio ${atingiu ? 'ok' : 'falta'}`;
    }

    const linha = (nome, x, total = false) => `<tr${total ? ' class="total"' : ''}><th scope="row">${escapar(nome)}</th>
      <td>${x.acionamentos}</td><td>${porcentagem(x.acertoAudio)}</td><td>${segundos(x.tempo.media)}</td><td>${segundos(x.tempo.dp)}</td></tr>`;
    $('#teste-tabela').innerHTML = resumirPorBloco(s.tentativas).map((b) => linha(b.bloco, b)).join('') + linha('Total', r, true);

    $('#teste-aviso-busy').hidden = !(r.acionamentos && !r.tempo.n);
    $('#teste-csv').onclick = () => baixarCsv(s);
    mostrar('teste-resultado');
    if (!dialogo.open) dialogo.showModal();
  }

  function baixarCsv(s) {
    const url = URL.createObjectURL(new Blob([gerarCsv(s)], { type: 'text/csv;charset=utf-8' }));
    const nome = `falaplaca-teste-${s.inicio.slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    const link = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // ---------------------------------------------------------------- eventos

  $('#btn-modo-teste').addEventListener('click', abrir);
  $('[data-fechar]', dialogo).addEventListener('click', () => dialogo.close());
  $('#teste-repeticoes').addEventListener('input', atualizarTotal);
  $('#teste-ordem').addEventListener('click', (e) => {
    const el = e.target.closest('[data-ordem]');
    if (!el) return;
    ordemAleatoria = el.dataset.ordem === 'aleatoria';
    $$('#teste-ordem [data-ordem]').forEach((b) => b.setAttribute('aria-checked', String(b === el)));
  });
  $('#teste-iniciar').addEventListener('click', iniciar);
  $('#teste-conectar').addEventListener('click', () => {
    dialogo.close();
    ctx.abrirConexao();
  });
  $('#teste-demo').addEventListener('click', async () => {
    await ctx.conectarDemonstracao();
    abrir();
  });
  $('#teste-confirmacao').addEventListener('click', (e) => {
    const audio = e.target.closest('[data-audio]')?.dataset.audio;
    if (audio) responder(audio);
  });
  $('#teste-pular').addEventListener('click', pular);
  $('#teste-encerrar').addEventListener('click', finalizar);
  $('#teste-novo').addEventListener('click', () => {
    sessao = null;
    abrir();
  });
  // Na demonstração, tocar no mini-mapa simula o aperto do botão físico.
  $('#teste-mini').addEventListener('click', (e) => {
    const el = e.target.closest('[data-numero]');
    const d = ctx.estado.dispositivo;
    if (el && d?.simulado) d.simularAperto(Number(el.dataset.numero));
  });
  // Atalhos durante a confirmação: S (sim), N (não), T (não tocou).
  dialogo.addEventListener('keydown', (e) => {
    if (aguardando !== 'confirmacao') return;
    const audio = { s: 'sim', n: 'nao', t: 'nao-tocou' }[e.key.toLowerCase()];
    if (audio) responder(audio);
  });
}

const escapar = (texto) => String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
