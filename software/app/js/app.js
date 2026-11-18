import {
  BLOCOS, ICONES, PERFIS_TREMOR, TEXTO_MAXIMO, corDoBotao, formaDoBotao, migrarPlaca, nomeArquivo,
} from './layout.js';
import * as banco from './store.js';
import { prepararAudio, Gravador, GRAVACAO_MAXIMA_S } from './audio.js';
import { arquivosDoCartao, podeGravarDireto, gravarNoCartao, baixarZip } from './sdcard.js';
import { DispositivoSimulado } from './protocolo.js';
import { formasDisponiveis, procurarFalaPlaca, reconectarConhecida } from './conexao.js';
import { icone, preencherIcones } from './icones.js';
import { googleConfigurado, prepararBotaoGoogle, sairDoGoogle } from './google.js';
import { baixarPictograma, buscarPictogramas, termosDaFrase, urlPictograma } from './arasaac.js';
import { configurarModoTeste } from './modo-teste.js';

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

const estado = {
  placa: null,
  audios: new Map(),      // número do botão -> Blob WAV
  selecionado: null,
  dispositivo: null,
  gravacao: null,         // { gravador, numero, inicio }
  reproducao: null,       // HTMLAudioElement em execução
  enviando: false,
  pictos: new Map(),      // id ARASAAC -> URL da imagem guardada no aparelho
  fontePicto: 'arasaac',  // aba do editor: 'arasaac' | 'emoji'
  buscaPicto: null,       // { numero, termo } da última busca mostrada no editor
  buscaManual: false,     // já tentou reconectar sozinho: o próximo toque abre a janela de escolha
  tentativasBusca: 0,     // buscas canceladas: alterna entre Bluetooth BLE e porta serial
};

const botao = (numero) => estado.placa.botoes.find((b) => b.numero === numero);
const telaLarga = () => matchMedia('(min-width: 960px)').matches;

// ---------------------------------------------------------------- avisos

function avisar(mensagem, tipo = '') {
  const el = Object.assign(document.createElement('div'), { className: `aviso ${tipo}`, textContent: mensagem });
  $('#avisos').append(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 6000 : 3200);
}

let timerSalvar;
function salvarPlaca() {
  clearTimeout(timerSalvar);
  timerSalvar = setTimeout(() => {
    banco.salvarPlaca(estado.placa).catch(() => avisar('Não foi possível salvar neste navegador.', 'erro'));
  }, 300);
}

// ---------------------------------------------------------------- sessão

const CHAVE_USUARIO = 'falaplaca.usuario';

function lerUsuario() {
  try { return JSON.parse(localStorage.getItem(CHAVE_USUARIO)); } catch { return null; }
}

function guardarUsuario(usuario) {
  try {
    if (usuario) localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
    else localStorage.removeItem(CHAVE_USUARIO);
  } catch { /* navegação privada: segue sem lembrar o login */ }
}

function mostrarTela(id) {
  $$('.tela').forEach((tela) => { tela.hidden = tela.id !== id; });
  window.scrollTo(0, 0);
}

async function entrar(usuario) {
  guardarUsuario(usuario);
  await abrirPainel(usuario);
}

function configurarEntrada() {
  $('#form-entrada').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = new FormData(e.target);
    await entrar({
      nome: String(dados.get('nome') || '').trim() || 'Professor(a)',
      email: String(dados.get('email') || '').trim(),
      provedor: 'local',
    });
  });

  $('#btn-sair').addEventListener('click', () => {
    if (lerUsuario()?.provedor === 'google') sairDoGoogle();
    guardarUsuario(null);
    fecharEditor();
    mostrarTela('tela-entrada');
  });

  configurarGoogle();
}

async function configurarGoogle() {
  const indisponivel = (mensagem) => {
    $('#google-entrar').hidden = true;
    $('#google-indisponivel').hidden = false;
    $('#google-aviso').textContent = mensagem;
    $('#google-aviso').hidden = false;
  };
  if (!googleConfigurado()) {
    indisponivel('Login com Google ainda não configurado: defina GOOGLE_CLIENT_ID em js/config.js.');
    return;
  }
  try {
    await prepararBotaoGoogle($('#google-entrar'), (usuario) => {
      entrar(usuario).catch((err) => avisar(err.message, 'erro'));
    });
  } catch (err) {
    indisponivel(err.message);
  }
}

async function abrirPainel(usuario) {
  $('#saudacao').textContent = `Olá, ${usuario.nome.split(' ')[0]}`;
  const avatar = $('#avatar');
  avatar.hidden = !usuario.foto;
  if (usuario.foto) avatar.src = usuario.foto;
  await carregarDados();
  renderPlaca();
  mostrarTela('tela-painel');
  carregarPictogramas();
}

// ---------------------------------------------------------------- pictogramas ARASAAC

// Imagem do pictograma guardada no aparelho; baixa da ARASAAC só na primeira vez.
async function garantirPictograma(id) {
  if (estado.pictos.has(id)) return estado.pictos.get(id);
  let blob = await banco.carregarPictograma(id).catch(() => null);
  if (!blob && navigator.onLine) {
    blob = await baixarPictograma(id).catch(() => null);
    if (blob) await banco.salvarPictograma(id, blob).catch(() => {});
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  estado.pictos.set(id, url);
  return url;
}

async function carregarPictogramas() {
  await Promise.all(estado.placa.botoes.filter((b) => b.picto).map(async (b) => {
    if (await garantirPictograma(b.picto.id)) atualizarAssento(b.numero);
  }));
  if (estado.selecionado) renderEditor();
}

// Pictograma ARASAAC quando disponível no aparelho; senão, o emoji do botão.
function pictoHTML(b, classe = 'picto') {
  const url = b.picto && estado.pictos.get(b.picto.id);
  return url
    ? `<img class="${classe}" src="${url}" alt="">`
    : `<span class="emoji">${b.icone || '❔'}</span>`;
}

async function carregarDados() {
  if (estado.placa) return;
  let salva = null;
  try { salva = await banco.carregarPlaca(); } catch { /* sem IndexedDB: usa padrão em memória */ }
  estado.placa = migrarPlaca(salva);
  for (const b of estado.placa.botoes) {
    if (!b.audio) continue;
    const blob = await banco.carregarAudio(b.numero).catch(() => null);
    if (blob) estado.audios.set(b.numero, blob);
    else b.audio = null;
  }
}

// ---------------------------------------------------------------- mapa da placa

function renderPlaca() {
  const destino = $('#fileiras');
  destino.innerHTML = '';
  for (const fileira of [0, 1]) {
    const el = document.createElement('div');
    el.className = 'fileira';
    el.dataset.fileira = fileira + 1;
    for (const b of estado.placa.botoes.filter((x) => x.fileira === fileira)) {
      el.insertAdjacentHTML('beforeend', `
        <button type="button" class="assento" data-numero="${b.numero}" style="--botao-cor:${corDoBotao(b).cor}">
          <span class="assento-etiqueta"><span class="assento-icone"></span><span class="assento-texto"></span></span>
          <span class="assento-base">
            <svg class="assento-forma" viewBox="0 0 100 100" aria-hidden="true"><path d="${formaDoBotao(b).d}"/></svg>
            <span class="assento-botao"></span>
            <span class="assento-status">${icone('ok')}</span>
          </span>
        </button>`);
    }
    destino.append(el);
  }
  estado.placa.botoes.forEach((b) => atualizarAssento(b.numero));
  atualizarProgresso();
}

function atualizarAssento(numero) {
  const b = botao(numero);
  const el = $(`.assento[data-numero="${numero}"]`);
  if (!el) return;
  el.style.setProperty('--cor', BLOCOS[b.bloco].cor);
  $('.assento-icone', el).innerHTML = pictoHTML(b);
  $('.assento-texto', el).textContent = b.texto || 'Sem frase';
  el.classList.toggle('sem-audio', !b.audio);
  el.classList.toggle('sem-texto', !b.texto);
  el.setAttribute('aria-pressed', String(estado.selecionado === numero));
  el.setAttribute('aria-label',
    `Botão ${b.assento}, ${corDoBotao(b).nome}: ${b.texto || 'sem frase'}. ${b.audio ? 'Com áudio' : 'Falta gravar o áudio'}.`);
}

function atualizarProgresso() {
  const prontos = estado.placa.botoes.filter((b) => b.audio && b.texto).length;
  const total = estado.placa.botoes.length;
  $('#progresso-texto').textContent = `${prontos} de ${total} botões prontos`;
  $('#progresso-barra').style.width = `${(prontos / total) * 100}%`;
}

function configurarMapa() {
  $('#fileiras').addEventListener('click', (e) => {
    const assento = e.target.closest('.assento');
    if (assento) selecionar(Number(assento.dataset.numero));
  });

  $('#btn-imprimir').addEventListener('click', () => window.print());
}

function acenderLed(numero) {
  const led = $('#led');
  led.classList.add('aceso');
  clearTimeout(acenderLed.timer);
  acenderLed.timer = setTimeout(() => led.classList.remove('aceso'), 2000); // mesmo tempo do firmware

  const assento = $(`.assento[data-numero="${numero}"]`);
  assento?.classList.add('tocando');
  if (!assento) return;
  clearTimeout(assento.timerTocando);   // o botão fica aceso como o LED, por 2 s
  assento.timerTocando = setTimeout(() => assento.classList.remove('tocando'), 2000);
}

// ---------------------------------------------------------------- editor

async function selecionar(numero) {
  if (estado.gravacao && estado.gravacao.numero !== numero) await pararGravacao();
  estado.selecionado = numero;
  estado.placa.botoes.forEach((b) => atualizarAssento(b.numero));
  renderEditor();
  abrirEditor();
}

function abrirEditor() {
  if (telaLarga()) return;
  $('#editor').classList.add('aberto');
  $('#fundo-editor').hidden = false;
}

function fecharEditor() {
  if (estado.gravacao) pararGravacao();
  $('#editor').classList.remove('aberto');
  $('#fundo-editor').hidden = true;
}

function renderEditor() {
  const numero = estado.selecionado;
  $('#editor-vazio').hidden = Boolean(numero);
  $('#editor-conteudo').hidden = !numero;
  if (!numero) return;

  const b = botao(numero);
  const bloco = BLOCOS[b.bloco];
  const editor = $('#editor');
  editor.style.setProperty('--cor', bloco.cor);
  editor.style.setProperty('--clara', bloco.clara);
  editor.style.setProperty('--botao-cor', corDoBotao(b).cor);

  $('#editor-assento').textContent = b.assento;
  $('#editor-titulo').textContent = `Botão ${numero} · ${bloco.nome}`;
  $('#previa-posicao').textContent = `Botão ${corDoBotao(b).nome} · ${formaDoBotao(b).nome}`;
  $('#previa-forma path').setAttribute('d', formaDoBotao(b).d);
  $('#editor-arquivo').textContent = `Cartão: 01/${nomeArquivo(numero)}`;
  $('#previa-icone').innerHTML = pictoHTML(b);
  $('#previa-texto').textContent = b.texto || 'Sem frase';

  const campo = $('#campo-texto');
  if (document.activeElement !== campo) campo.value = b.texto;
  $('#contador-texto').textContent = `${campo.value.length}/${TEXTO_MAXIMO}`;

  $$('#grade-blocos button').forEach((el) => {
    el.setAttribute('aria-checked', String(Number(el.dataset.bloco) === b.bloco));
  });

  $$('#grade-icones button').forEach((el) => {
    el.setAttribute('aria-selected', String(!b.picto && el.dataset.pictograma === b.icone));
  });
  renderPictogramas();

  renderAudio();
}

function renderAudio() {
  const b = botao(estado.selecionado);
  const info = $('#audio-info');
  const gravandoEste = estado.gravacao?.numero === b.numero;
  if (gravandoEste) {
    info.className = 'audio-info';
  } else if (b.audio) {
    info.textContent = `${b.audio.duracao.toFixed(1)} s · ${b.audio.origem}`;
    info.className = 'audio-info ok';
  } else {
    info.textContent = 'Falta gravar';
    info.className = 'audio-info falta';
  }
  $('#btn-ouvir').disabled = !b.audio;
  $('#btn-remover-audio').disabled = !b.audio;
  $('#btn-tocar-placa').hidden = !(estado.dispositivo && (b.audio || estado.dispositivo.audioPeloCartao));
  desenharOnda(b.audio?.picos);
}

function desenharOnda(picos) {
  const canvas = $('#onda');
  const escala = window.devicePixelRatio || 1;
  const largura = canvas.clientWidth || 300;
  const altura = canvas.clientHeight || 56;
  canvas.width = largura * escala;
  canvas.height = altura * escala;
  const ctx = canvas.getContext('2d');
  ctx.scale(escala, escala);
  ctx.clearRect(0, 0, largura, altura);

  const cor = getComputedStyle($('#editor')).getPropertyValue('--cor').trim() || '#5b4bdb';
  const valores = picos ?? Array(48).fill(0.04);
  const passo = largura / valores.length;
  ctx.fillStyle = picos ? cor : '#d9d4ca';
  valores.forEach((v, i) => {
    const h = Math.max(3, v * (altura - 10));
    const x = i * passo + passo * 0.2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, (altura - h) / 2, passo * 0.6, h, 2);
    else ctx.rect(x, (altura - h) / 2, passo * 0.6, h);
    ctx.fill();
  });
}

// Aba de pictogramas do editor: ARASAAC (busca online) ou emoji.
function renderPictogramas() {
  const arasaac = estado.fontePicto === 'arasaac';
  $$('.abas-picto [data-fonte]').forEach((el) => el.setAttribute('aria-selected', String(el.dataset.fonte === estado.fontePicto)));
  $('#picto-arasaac').hidden = !arasaac;
  $('#grade-icones').hidden = arasaac;
  if (!arasaac) return;
  const b = botao(estado.selecionado);
  // Ao abrir outro botão, busca sugestões a partir do termo salvo ou da frase.
  if (estado.buscaPicto?.numero !== b.numero) {
    const termo = b.picto?.termo;
    $('#campo-busca-picto').value = termo ?? '';
    buscarPictos(termo ? [termo] : termosDaFrase(b.texto));
  } else {
    marcarPictoEscolhido();
  }
}

function marcarPictoEscolhido() {
  const b = botao(estado.selecionado);
  $$('#resultados-picto [data-id]').forEach((el) => {
    el.setAttribute('aria-selected', String(Number(el.dataset.id) === b.picto?.id));
  });
}

let buscaAtual = 0;
async function buscarPictos(termos) {
  const numero = estado.selecionado;
  const minhaBusca = ++buscaAtual;
  estado.buscaPicto = { numero };
  const status = $('#status-busca-picto');
  const grade = $('#resultados-picto');
  if (!termos.length) {
    grade.innerHTML = '';
    status.textContent = 'Digite uma palavra para buscar um pictograma.';
    return;
  }
  status.textContent = 'Buscando pictogramas…';
  try {
    const { termo, resultados } = await buscarPictogramas(termos);
    if (minhaBusca !== buscaAtual) return;   // outra busca começou depois desta
    estado.buscaPicto = { numero, termo };
    if (!$('#campo-busca-picto').value) $('#campo-busca-picto').value = termo;
    status.textContent = resultados.length
      ? `${resultados.length} pictogramas para “${termo}”. Toque em um para usar.`
      : `Nenhum pictograma para “${termos[0]}”. Tente outra palavra.`;
    grade.innerHTML = resultados.map((p) => `
      <button type="button" role="option" data-id="${p.id}" title="${escapar(p.nome)}">
        <img src="${urlPictograma(p.id)}" alt="${escapar(p.nome)}" loading="lazy" width="64" height="64">
      </button>`).join('');
    marcarPictoEscolhido();
  } catch (err) {
    if (minhaBusca !== buscaAtual) return;
    grade.innerHTML = '';
    status.textContent = `${err.message} Os pictogramas já escolhidos continuam funcionando.`;
  }
}

function configurarBuscaPictogramas() {
  $$('.abas-picto [data-fonte]').forEach((el) => el.addEventListener('click', () => {
    estado.fontePicto = el.dataset.fonte;
    renderPictogramas();
  }));
  $('#form-busca-picto').addEventListener('submit', (e) => {
    e.preventDefault();
    const termo = $('#campo-busca-picto').value.trim();
    buscarPictos(termo ? [termo] : termosDaFrase(botao(estado.selecionado).texto));
  });
  $('#resultados-picto').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-id]');
    if (!el) return;
    const b = botao(estado.selecionado);
    const id = Number(el.dataset.id);
    b.picto = { id, termo: estado.buscaPicto?.termo };
    salvarPlaca();
    marcarPictoEscolhido();
    // Baixa e guarda no aparelho, para funcionar offline e na impressão das etiquetas.
    if (!(await garantirPictograma(id))) avisar('Não foi possível baixar o pictograma. Verifique a internet.', 'erro');
    atualizarAssento(b.numero);
    if (estado.selecionado === b.numero) $('#previa-icone').innerHTML = pictoHTML(b);
  });
}

function configurarEditor() {
  const grade = $('#grade-icones');
  grade.innerHTML = ICONES.map((ic) =>
    `<button type="button" role="option" data-pictograma="${ic}" aria-label="Pictograma ${ic}">${ic}</button>`).join('');
  grade.addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    const b = botao(estado.selecionado);
    b.icone = el.dataset.pictograma;
    b.picto = null;                       // emoji escolhido no lugar do pictograma ARASAAC
    salvarPlaca();
    atualizarAssento(estado.selecionado);
    renderEditor();
  });

  configurarBuscaPictogramas();

  const blocos = $('#grade-blocos');
  blocos.innerHTML = BLOCOS.map((bl, i) =>
    `<button type="button" role="radio" data-bloco="${i}" style="--cor-bloco:${bl.cor}"><span></span>${bl.nome}</button>`).join('');
  blocos.addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    botao(estado.selecionado).bloco = Number(el.dataset.bloco);
    salvarPlaca();
    atualizarAssento(estado.selecionado);
    renderEditor();
  });

  $('#campo-texto').addEventListener('input', (e) => {
    const b = botao(estado.selecionado);
    b.texto = e.target.value.slice(0, TEXTO_MAXIMO);
    salvarPlaca();
    atualizarAssento(b.numero);
    atualizarProgresso();
    renderEditor();
  });

  const navegar = (passo) => {
    const total = estado.placa.botoes.length;
    selecionar(((estado.selecionado - 1 + passo + total) % total) + 1);
  };
  $('#btn-anterior').addEventListener('click', () => navegar(-1));
  $('#btn-proximo').addEventListener('click', () => navegar(1));
  $('#btn-fechar-editor').addEventListener('click', fecharEditor);
  $('#fundo-editor').addEventListener('click', fecharEditor);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#editor').classList.contains('aberto')) fecharEditor();
  });

  $('#btn-gravar').addEventListener('click', alternarGravacao);
  $('#entrada-arquivo').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (arquivo) await aplicarAudio(estado.selecionado, arquivo, 'arquivo');
  });
  $('#btn-ouvir').addEventListener('click', () => ouvir(estado.selecionado));
  $('#btn-remover-audio').addEventListener('click', removerAudio);
  $('#btn-voz').addEventListener('click', falarTexto);
  $('#btn-tocar-placa').addEventListener('click', () => {
    acenderLed(estado.selecionado);
    estado.dispositivo?.tocar(estado.selecionado).catch((err) => avisar(err.message, 'erro'));
  });

  window.addEventListener('resize', () => {
    if (telaLarga()) fecharEditor();
    if (estado.selecionado) desenharOnda(botao(estado.selecionado).audio?.picos);
  });
}

// ---------------------------------------------------------------- áudio

async function alternarGravacao() {
  if (estado.gravacao) return pararGravacao();
  const numero = estado.selecionado;
  const gravador = new Gravador();
  try {
    await gravador.iniciar();
  } catch (err) {
    const negado = err.name === 'NotAllowedError';
    avisar(negado ? 'Permita o uso do microfone para gravar.' : err.message, 'erro');
    return;
  }
  estado.gravacao = { gravador, numero, inicio: performance.now() };
  $('#btn-gravar').classList.add('gravando');
  renderAudio();
  acompanharGravacao();
}

function acompanharGravacao() {
  const g = estado.gravacao;
  if (!g) return;
  const segundos = (performance.now() - g.inicio) / 1000;
  const botaoGravar = $('#btn-gravar');
  botaoGravar.style.setProperty('--nivel', g.gravador.nivel().toFixed(2));
  $('.gravar-texto', botaoGravar).textContent = `Parar · 0:0${Math.floor(segundos)}`;
  $('#audio-info').textContent = `Gravando… máx. ${GRAVACAO_MAXIMA_S} s`;
  if (segundos >= GRAVACAO_MAXIMA_S) return pararGravacao();
  requestAnimationFrame(acompanharGravacao);
}

async function pararGravacao() {
  const g = estado.gravacao;
  if (!g) return;
  estado.gravacao = null;
  const botaoGravar = $('#btn-gravar');
  botaoGravar.classList.remove('gravando');
  botaoGravar.style.setProperty('--nivel', 0);
  $('.gravar-texto', botaoGravar).textContent = 'Gravar';
  const blob = await g.gravador.parar();
  await aplicarAudio(g.numero, blob, 'gravação');
}

async function aplicarAudio(numero, blob, origem) {
  const botaoGravar = $('#btn-gravar');
  botaoGravar.classList.add('processando');
  $('.gravar-texto', botaoGravar).textContent = 'Preparando…';
  try {
    const { wav, duracao, picos } = await prepararAudio(blob);
    estado.audios.set(numero, wav);
    botao(numero).audio = { duracao, picos, origem, atualizadoEm: Date.now() };
    await banco.salvarAudio(numero, wav).catch(() => avisar('Áudio mantido só até fechar o app.', 'erro'));
    salvarPlaca();
    atualizarAssento(numero);
    atualizarProgresso();
    avisar(`Voz salva no botão ${botao(numero).assento}.`, 'ok');
  } catch (err) {
    avisar(err.message, 'erro');
  } finally {
    botaoGravar.classList.remove('processando');
    $('.gravar-texto', botaoGravar).textContent = 'Gravar';
    if (estado.selecionado) renderAudio();
  }
}

function ouvir(numero) {
  const blob = estado.audios.get(numero);
  if (!blob) return falarTexto();
  estado.reproducao?.pause();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  estado.reproducao = audio;
  audio.play().catch(() => avisar('Não foi possível tocar o áudio.', 'erro'));
  acenderLed(numero);
}

async function removerAudio() {
  const b = botao(estado.selecionado);
  if (!b.audio || !confirm(`Remover a voz do botão ${b.assento}?`)) return;
  b.audio = null;
  estado.audios.delete(b.numero);
  await banco.removerAudio(b.numero).catch(() => {});
  salvarPlaca();
  atualizarAssento(b.numero);
  atualizarProgresso();
  renderAudio();
}

function falarTexto() {
  const b = botao(estado.selecionado);
  if (!('speechSynthesis' in window) || !b.texto) return;
  speechSynthesis.cancel();
  const fala = new SpeechSynthesisUtterance(b.texto);
  fala.lang = 'pt-BR';
  fala.voice = speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-') === 'pt-BR') ?? null;
  speechSynthesis.speak(fala);
  acenderLed(b.numero);
}

// ---------------------------------------------------------------- envio para a placa

function abrirEnvio(aba) {
  const dialogo = $('#dlg-envio');
  trocarAba(aba);
  $('#lista-envio').innerHTML = '';
  atualizarConexao();
  if (!dialogo.open) dialogo.showModal();
}

function trocarAba(aba) {
  $$('#dlg-envio [data-aba]').forEach((el) => el.setAttribute('aria-selected', String(el.dataset.aba === aba)));
  $$('#dlg-envio [data-painel]').forEach((el) => { el.hidden = el.dataset.painel !== aba; });
  $('#lista-envio').innerHTML = '';
  if (aba === 'cartao') renderListaCartao();
}

function linhaEnvio(b, detalhe, classe = '') {
  return `<li data-numero="${b.numero}" style="--cor:${BLOCOS[b.bloco].cor}">
    <span class="tag">${b.assento}</span>
    <span class="nome"><b>${pictoHTML(b, 'picto-mini')} ${escapar(b.texto || 'Sem frase')}</b><small>${detalhe}</small></span>
    <span class="estado ${classe}"></span>
  </li>`;
}

const escapar = (texto) => texto.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderListaCartao() {
  const lista = arquivosDoCartao(estado.placa, estado.audios);
  $('#lista-envio').innerHTML = lista.map((a) =>
    linhaEnvio(a.botao, a.caminho ? `/${a.caminho}` : 'sem áudio — o botão ficará mudo', a.caminho ? 'ok' : 'falta')).join('');
  $$('#lista-envio .estado').forEach((el) => { el.textContent = el.classList.contains('ok') ? 'pronto' : 'falta'; });
}

function marcarLinha(numero, texto, classe = '', fracao) {
  const linha = $(`#lista-envio li[data-numero="${numero}"]`);
  if (!linha) return;
  const estadoEl = $('.estado', linha);
  estadoEl.textContent = texto;
  estadoEl.className = `estado ${classe}`;
  let barra = $('.barra span', linha);
  if (fracao !== undefined && !barra) {
    $('.nome', linha).insertAdjacentHTML('beforeend', '<div class="barra"><span></span></div>');
    barra = $('.barra span', linha);
  }
  if (barra && classe === 'falta') barra.parentElement.remove();
  else if (barra) barra.style.width = `${Math.round((fracao ?? 1) * 100)}%`;
}

async function travarEnvio(botaoAcao, tarefa) {
  if (estado.enviando) return;
  estado.enviando = true;
  botaoAcao.disabled = true;
  try {
    await tarefa();
  } catch (err) {
    if (err.name !== 'AbortError' && err.name !== 'NotFoundError') avisar(err.message, 'erro');
  } finally {
    estado.enviando = false;
    botaoAcao.disabled = false;
  }
}

function configurarEnvio() {
  const dialogo = $('#dlg-envio');
  $('#btn-abrir-bluetooth').addEventListener('click', () => abrirEnvio('bluetooth'));
  $('#btn-abrir-cartao').addEventListener('click', () => abrirEnvio('cartao'));
  $('#chip-conexao').addEventListener('click', () => abrirEnvio('bluetooth'));
  $$('#dlg-envio [data-aba]').forEach((el) => el.addEventListener('click', () => trocarAba(el.dataset.aba)));
  $('[data-fechar]', dialogo).addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => {
    // clique no fundo escurecido (fora da caixa do diálogo) fecha
    const r = dialogo.getBoundingClientRect();
    const fora = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (e.target === dialogo && fora) dialogo.close();
  });

  // Cartão SD
  if (!podeGravarDireto()) {
    $('#sd-gravar').hidden = true;
    $('#passo-gravar').innerHTML = 'Toque em <strong>Baixar arquivos</strong> e copie a pasta <code>01</code> do .zip para a raiz do cartão.';
  }
  $('#sd-gravar').addEventListener('click', (e) => travarEnvio(e.currentTarget, async () => {
    renderListaCartao();
    const nome = await gravarNoCartao(estado.placa, estado.audios, (numero) => {
      marcarLinha(numero, botao(numero).audio ? 'gravado' : 'sem áudio', botao(numero).audio ? 'ok' : 'falta');
    });
    avisar(`Cartão “${nome}” pronto! Coloque-o de volta na FalaPlaca.`, 'ok');
  }));
  $('#sd-zip').addEventListener('click', (e) => travarEnvio(e.currentTarget, async () => {
    await baixarZip(estado.placa, estado.audios);
    avisar('Arquivo .zip baixado.', 'ok');
  }));

  // Conexão direta com a placa (Bluetooth BLE, HC-05 ou cabo USB, escolhidos automaticamente)
  $('#bt-conectar').addEventListener('click', (e) => travarEnvio(e.currentTarget, procurarPlaca));
  $('#bt-demo').addEventListener('click', (e) => travarEnvio(e.currentTarget, conectarDemonstracao));
  $('#bt-desconectar').addEventListener('click', () => estado.dispositivo?.desconectar());

  const volume = $('#campo-volume');
  volume.addEventListener('input', () => { $('#volume-valor').textContent = volume.value; });
  volume.addEventListener('change', () => {
    estado.placa.volume = Number(volume.value);
    salvarPlaca();
    estado.dispositivo?.definirVolume(estado.placa.volume).catch((err) => avisar(err.message, 'erro'));
  });

  configurarAjustes();

  $('#bt-enviar').addEventListener('click', (e) => travarEnvio(e.currentTarget, async () => {
    const lista = $('#lista-envio');
    const detalhe = (b) => {
      if (estado.dispositivo.audioPeloCartao) return `voz: 01/${nomeArquivo(b.numero)} no cartão SD`;
      return b.audio ? `${b.audio.duracao.toFixed(1)} s de áudio` : 'sem áudio';
    };
    lista.innerHTML = estado.placa.botoes.map((b) => linhaEnvio(b, detalhe(b))).join('');
    await estado.dispositivo.enviar(estado.placa, estado.audios, (numero, etapa, fracao) => {
      if (etapa === 'enviando') marcarLinha(numero, `${Math.round(fracao * 100)}%`, '', fracao);
      if (etapa === 'ok') marcarLinha(numero, 'enviado', 'ok', 1);
      if (etapa === 'sem-audio') marcarLinha(numero, 'só texto', 'falta');
      if (etapa === 'cartao') marcarLinha(numero, 'frase enviada', 'ok', 1);
    });
    avisar(estado.dispositivo.audioPeloCartao
      ? 'Frases e ajustes enviados! As vozes vão pelo cartão SD.'
      : 'Placa atualizada! Já pode testar os botões.', 'ok');
  }));

  const formas = formasDisponiveis();
  $('#bt-conectar').disabled = !formas.length;
  if (!formas.length) {
    dicaBusca('Este navegador não consegue se conectar à placa (iPhone, iPad, Safari e Firefox ainda não permitem). Use o Chrome ou o Edge — ou teste sem placa.');
  }
}

// ---------------------------------------------------------------- ajustes para tremor

const formatarSegundos = (ms) => `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s`;

function renderAjustes() {
  const { pressaoMs, repeticaoMs } = estado.placa.ajustes;
  $('#campo-pressao').value = pressaoMs;
  $('#campo-repeticao').value = repeticaoMs;
  $('#pressao-valor').textContent = formatarSegundos(pressaoMs);
  $('#repeticao-valor').textContent = repeticaoMs ? formatarSegundos(repeticaoMs) : 'sem espera';
  $$('#perfis-tremor button').forEach((el) => {
    const perfil = PERFIS_TREMOR[el.dataset.perfil];
    const ativo = perfil.pressaoMs === pressaoMs && perfil.repeticaoMs === repeticaoMs;
    el.setAttribute('aria-checked', String(ativo));
  });
}

let timerAjustes;
function aplicarAjustes(novos) {
  Object.assign(estado.placa.ajustes, novos);
  salvarPlaca();
  renderAjustes();
  // Espera a pessoa parar de mexer para enviar uma vez só.
  clearTimeout(timerAjustes);
  timerAjustes = setTimeout(() => {
    const d = estado.dispositivo;
    if (d?.aceitaAjustes) d.definirAjustes(estado.placa.ajustes).catch((err) => avisar(err.message, 'erro'));
  }, 300);
}

function configurarAjustes() {
  $('#perfis-tremor').innerHTML = PERFIS_TREMOR.map((p, i) =>
    `<button type="button" role="radio" data-perfil="${i}">${p.nome}</button>`).join('');
  $('#perfis-tremor').addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    const { pressaoMs, repeticaoMs } = PERFIS_TREMOR[el.dataset.perfil];
    aplicarAjustes({ pressaoMs, repeticaoMs });
  });
  $('#campo-pressao').addEventListener('input', (e) => aplicarAjustes({ pressaoMs: Number(e.target.value) }));
  $('#campo-repeticao').addEventListener('input', (e) => aplicarAjustes({ repeticaoMs: Number(e.target.value) }));
}

const DICAS_BUSCA = {
  bluetooth: 'Não apareceu? Toque em Procurar de novo: vamos procurar pelo Bluetooth (módulos BLE).',
  serial: 'Não apareceu? Toque em Procurar de novo: vamos procurar placas ligadas por Bluetooth HC-05 (na lista, aparece como "Dev B" ou "HC-05") ou cabo USB.',
};

function dicaBusca(texto) {
  $('#bt-suporte').textContent = texto;
}

// Um só botão para todas as formas de conexão (ver js/conexao.js).
async function procurarPlaca() {
  if (!estado.buscaManual) {
    dicaBusca('Procurando placas já conectadas antes…');
    const conhecida = await reconectarConhecida();
    if (conhecida) return conectar(conhecida);
    estado.buscaManual = true;
    // A janela de escolha do navegador só abre logo após um toque: se demorou, pede outro.
    if (navigator.userActivation && !navigator.userActivation.isActive) {
      return dicaBusca('Nenhuma placa conhecida respondeu. Toque em Procurar FalaPlaca de novo para escolher a placa.');
    }
  }
  dicaBusca('');
  try {
    conectar(await procurarFalaPlaca(estado.tentativasBusca));
  } catch (err) {
    if (err.name !== 'NotFoundError' && err.name !== 'AbortError') throw err;
    // Cancelou ou não achou: o próximo toque tenta a outra forma de conexão.
    estado.tentativasBusca += 1;
    const formas = formasDisponiveis();
    if (formas.length > 1) dicaBusca(DICAS_BUSCA[formas[estado.tentativasBusca % formas.length]]);
  }
}

async function conectarDemonstracao() {
  const d = new DispositivoSimulado();
  await d.conectar();
  conectar(d);
}

function conectar(dispositivo) {
  estado.buscaManual = false;
  estado.tentativasBusca = 0;
  dicaBusca('');
  dispositivo.aoDesconectar(() => {
    if (estado.dispositivo !== dispositivo) return;
    estado.dispositivo = null;
    atualizarConexao();
    avisar('Placa desconectada.');
  });
  dispositivo.aoAcionarBotao(acenderLed);
  estado.dispositivo = dispositivo;
  atualizarConexao();
  avisar(`Conectado a ${dispositivo.nome}.`, 'ok');
}

function atualizarConexao() {
  const d = estado.dispositivo;
  const chip = $('#chip-conexao');
  chip.dataset.estado = d ? (d.simulado ? 'demo' : 'conectada') : 'desconectada';
  $('.chip-texto', chip).textContent = d ? d.nome : 'Placa desconectada';

  $('#bt-desconectado').hidden = Boolean(d);
  $('#bt-conectado').hidden = !d;
  if (d) {
    $('#bt-nome').textContent = d.nome;
    const livre = Number(d.info?.livre);
    const tipo = d.audioPeloCartao ? `Arduino ${d.info?.placa === 'uno' ? 'UNO' : 'Mega'} · áudios pelo cartão SD` : '';
    $('#bt-detalhe').textContent = d.simulado
      ? `Simulação: nada é gravado de verdade.${tipo ? ` ${tipo}.` : ''}`
      : tipo || `${d.info?.botoes ?? 10} botões${livre ? ` · ${Math.round(livre / 1024)} KB livres` : ''}`;
    $('#bt-enviar-texto').textContent = d.audioPeloCartao ? 'Enviar frases e ajustes' : 'Enviar os 10 botões';
    $('#bt-aviso-cartao').hidden = !d.audioPeloCartao;
    $('#campo-volume').value = estado.placa.volume;
    $('#volume-valor').textContent = estado.placa.volume;
    renderAjustes();
    $('#ajustes-aviso').hidden = d.aceitaAjustes;
    $('#perfis-tremor').closest('fieldset').disabled = !d.aceitaAjustes;
  }
  if (estado.selecionado) renderAudio();
}

// ---------------------------------------------------------------- PWA

function configurarPwa() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  let pedido;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pedido = e;
    $('#btn-instalar').hidden = false;
  });
  $('#btn-instalar').addEventListener('click', async () => {
    if (!pedido) return;
    pedido.prompt();
    await pedido.userChoice;
    pedido = null;
    $('#btn-instalar').hidden = true;
  });
}

// ---------------------------------------------------------------- início

async function iniciar() {
  preencherIcones();
  configurarPwa();
  configurarEntrada();
  configurarMapa();
  configurarEditor();
  configurarEnvio();
  configurarModoTeste({
    estado, botao, pictoHTML, avisar, banco, conectarDemonstracao,
    abrirConexao: () => abrirEnvio('bluetooth'),
  });

  const usuario = lerUsuario();
  if (usuario) await abrirPainel(usuario);
  else mostrarTela('tela-entrada');
}

iniciar();
