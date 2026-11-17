// Login com Google (Google Identity Services).
// O app não tem servidor: o token do Google é só lido no navegador para obter nome, e-mail e foto.
// Ele NÃO é verificado; para proteger dados de verdade, um backend precisa validar o token.

import { GOOGLE_CLIENT_ID } from './config.js';

const SCRIPT_GIS = 'https://accounts.google.com/gsi/client';
let carregamento;

export const googleConfigurado = () => Boolean(GOOGLE_CLIENT_ID);

function carregarScript() {
  carregamento ??= new Promise((resolver, rejeitar) => {
    if (window.google?.accounts?.id) return resolver();
    const script = Object.assign(document.createElement('script'), { src: SCRIPT_GIS, async: true });
    script.onload = resolver;
    script.onerror = () => {
      carregamento = null;
      rejeitar(new Error('Não foi possível carregar o login do Google. Verifique a internet.'));
    };
    document.head.append(script);
  });
  return carregamento;
}

function lerToken(credencial) {
  const base64 = credencial.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Desenha o botão oficial em `elemento` e chama aoEntrar({ nome, email, foto, provedor }).
export async function prepararBotaoGoogle(elemento, aoEntrar) {
  await carregarScript();
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: ({ credential }) => {
      const dados = lerToken(credential);
      aoEntrar({
        nome: dados.name || dados.given_name || dados.email,
        email: dados.email,
        foto: dados.picture || '',
        provedor: 'google',
      });
    },
    ux_mode: 'popup',
    use_fedcm_for_prompt: true,
  });
  google.accounts.id.renderButton(elemento, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    logo_alignment: 'center',
    locale: 'pt-BR',
    width: Math.min(400, Math.max(200, Math.round(elemento.clientWidth))),
  });
}

// Evita que o Google entre de novo automaticamente depois de "Sair".
export function sairDoGoogle() {
  window.google?.accounts?.id?.disableAutoSelect();
}
