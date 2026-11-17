import { FILEIRAS, COLUNAS, POSICOES, ICONES, TEXTO_MAXIMO, VERSAO_PLACA, placaPadrao, nomeArquivo } from './layout.js';
import * as banco from './store.js';
import { prepararAudio, Gravador, GRAVACAO_MAXIMA_S } from './audio.js';
import { arquivosDoCartao, podeGravarDireto, gravarNoCartao, baixarZip } from './sdcard.js';
import { bluetoothDisponivel, conectarBluetooth, DispositivoSimulado } from './bluetooth.js';
import { icone, preencherIcones } from './icones.js';
import { googleConfigurado, prepararBotaoGoogle, sairDoGoogle } from './google.js';

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
}

async function carregarDados() {
  if (estado.placa) return;
  let salva = null;
  try { salva = await banco.carregarPlaca(); } catch { /* sem IndexedDB: usa padrão em memória */ }
  estado.placa = salva?.versao === VERSAO_PLACA ? salva : placaPadrao();
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
  FILEIRAS.forEach((fileira, i) => {
    const el = document.createElement('div');
    el.className = 'fileira';
    el.style.setProperty('--cor', fileira.cor);
    el.style.setProperty('--clara', fileira.clara);
    el.innerHTML = `
      <button type="button" class="fileira-rotulo" data-fileira="${i}" title="Renomear bloco">
        <span class="fileira-num">${i + 1}</span><span class="fileira-nome"></span>${icone('lapis')}
      </button>
      <div class="fileira-assentos" data-fileira="${i + 1}"></div>`;
    $('.fileira-nome', el).textContent = estado.placa.fileiras[i].nome;

    const assentos = $('.fileira-assentos', el);
    COLUNAS.forEach((_, coluna) => {
      const posicao = POSICOES.find((p) => p.fileira === i && p.coluna === coluna);
      if (!posicao) {
        assentos.insertAdjacentHTML('beforeend', '<div class="corredor" aria-hidden="true"></div>');
        return;
      }
      assentos.insertAdjacentHTML('beforeend', `
        <button type="button" class="assento" data-numero="${posicao.numero}">
          <span class="assento-botao"><span class="assento-icone"></span></span>
          <span class="assento-texto"></span>
          <span class="assento-status">${icone('ok')}</span>
        </button>`);
    });
    destino.append(el);
  });
  estado.placa.botoes.forEach((b) => atualizarAssento(b.numero));
  atualizarProgresso();
}

function atualizarAssento(numero) {
  const b = botao(numero);
  const el = $(`.assento[data-numero="${numero}"]`);
  if (!el) return;
  $('.assento-icone', el).textContent = b.icone || '❔';
  $('.assento-texto', el).textContent = b.texto || 'Sem frase';
  el.classList.toggle('sem-audio', !b.audio);
  el.classList.toggle('sem-texto', !b.texto);
  el.setAttribute('aria-pressed', String(estado.selecionado === numero));
  el.setAttribute('aria-label',
    `Botão ${b.assento}: ${b.texto || 'sem frase'}. ${b.audio ? 'Com áudio' : 'Falta gravar o áudio'}.`);
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
    if (assento) return selecionar(Number(assento.dataset.numero));

    const rotulo = e.target.closest('.fileira-rotulo');
    if (rotulo) {
      const i = Number(rotulo.dataset.fileira);
      const nome = prompt('Nome do bloco temático:', estado.placa.fileiras[i].nome)?.trim();
      if (!nome) return;
      estado.placa.fileiras[i].nome = nome.slice(0, 20);
      salvarPlaca();
      renderPlaca();
      renderEditor();
    }
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
  setTimeout(() => assento?.classList.remove('tocando'), 180);
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
  const fileira = FILEIRAS[b.fileira];
  const editor = $('#editor');
  editor.style.setProperty('--cor', fileira.cor);
  editor.style.setProperty('--clara', fileira.clara);

  $('#editor-assento').textContent = b.assento;
  $('#editor-titulo').textContent = `Botão ${numero} · ${estado.placa.fileiras[b.fileira].nome}`;
  $('#editor-arquivo').textContent = `Arquivo no cartão: 01/${nomeArquivo(numero)}`;
  $('#previa-icone').textContent = b.icone || '❔';
  $('#previa-texto').textContent = b.texto || 'Sem frase';

  const campo = $('#campo-texto');
  if (document.activeElement !== campo) campo.value = b.texto;
  $('#contador-texto').textContent = `${campo.value.length}/${TEXTO_MAXIMO}`;

  $$('#grade-icones button').forEach((el) => {
    el.setAttribute('aria-selected', String(el.dataset.pictograma === b.icone));
  });

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
  $('#btn-tocar-placa').hidden = !(estado.dispositivo && b.audio);
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

function configurarEditor() {
  const grade = $('#grade-icones');
  grade.innerHTML = ICONES.map((ic) =>
    `<button type="button" role="option" data-pictograma="${ic}" aria-label="Pictograma ${ic}">${ic}</button>`).join('');
  grade.addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    botao(estado.selecionado).icone = el.dataset.pictograma;
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
  const fileira = FILEIRAS[b.fileira];
  return `<li data-numero="${b.numero}" style="--cor:${fileira.cor}">
    <span class="tag">${b.assento}</span>
    <span class="nome"><b>${b.icone} ${escapar(b.texto || 'Sem frase')}</b><small>${detalhe}</small></span>
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

  // Bluetooth
  $('#bt-conectar').addEventListener('click', (e) => travarEnvio(e.currentTarget, () => conectar(conectarBluetooth)));
  $('#bt-demo').addEventListener('click', (e) => travarEnvio(e.currentTarget, () => conectar(async () => {
    const d = new DispositivoSimulado();
    await d.conectar();
    return d;
  })));
  $('#bt-desconectar').addEventListener('click', () => estado.dispositivo?.desconectar());

  const volume = $('#campo-volume');
  volume.addEventListener('input', () => { $('#volume-valor').textContent = volume.value; });
  volume.addEventListener('change', () => {
    estado.placa.volume = Number(volume.value);
    salvarPlaca();
    estado.dispositivo?.definirVolume(estado.placa.volume).catch((err) => avisar(err.message, 'erro'));
  });

  $('#bt-enviar').addEventListener('click', (e) => travarEnvio(e.currentTarget, async () => {
    const lista = $('#lista-envio');
    lista.innerHTML = estado.placa.botoes.map((b) => linhaEnvio(b, b.audio ? `${b.audio.duracao.toFixed(1)} s de áudio` : 'sem áudio')).join('');
    await estado.dispositivo.enviar(estado.placa, estado.audios, (numero, etapa, fracao) => {
      if (etapa === 'enviando') marcarLinha(numero, `${Math.round(fracao * 100)}%`, '', fracao);
      if (etapa === 'ok') marcarLinha(numero, 'enviado', 'ok', 1);
      if (etapa === 'sem-audio') marcarLinha(numero, 'só texto', 'falta');
    });
    avisar('Placa atualizada! Já pode testar os botões.', 'ok');
  }));

  bluetoothDisponivel().then((ok) => {
    $('#bt-suporte').textContent = ok
      ? 'Requer a FalaPlaca com Bluetooth (versão ESP32). Funciona no Chrome/Edge para Android, Windows, macOS e Linux.'
      : 'Este navegador não oferece Bluetooth Web (iPhone/iPad, Firefox e Safari ainda não suportam). Use o Chrome no Android ou no computador — ou teste com a placa de demonstração.';
    $('#bt-conectar').disabled = !ok;
  });
}

async function conectar(criarDispositivo) {
  const dispositivo = await criarDispositivo();
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
    $('#bt-detalhe').textContent = d.simulado
      ? 'Simulação: nada é gravado de verdade.'
      : `${d.info?.botoes ?? 10} botões${livre ? ` · ${Math.round(livre / 1024)} KB livres` : ''}`;
    $('#campo-volume').value = estado.placa.volume;
    $('#volume-valor').textContent = estado.placa.volume;
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

  const usuario = lerUsuario();
  if (usuario) await abrirPainel(usuario);
  else mostrarTela('tela-entrada');
}

iniciar();
