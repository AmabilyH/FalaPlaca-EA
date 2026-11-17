# Camada de software – app FalaPlaca (protótipo)

Aplicativo para a professora configurar cada botão da FalaPlaca: frase, pictograma e voz. É um PWA (Progressive Web App) em HTML, CSS e JavaScript puros, sem etapa de build. O mesmo código roda no navegador do computador e no celular, onde pode ser instalado como app.

O dispositivo continua funcionando 100% offline sem este app. Ele serve só para preparar o conteúdo da placa.

## Como rodar

Requer Node.js 18 ou superior. Não há dependências para instalar.

```bash
cd software
npm start            # ou: node servidor.mjs [porta]
```

Abra `http://localhost:5173`. O terminal também mostra o endereço na rede local, para abrir no celular.

> **Celular:** microfone, Bluetooth e instalação como app exigem HTTPS (ou `localhost`). Pelo IP da rede local (`http://192.168...`), o app abre, mas essas funções ficam bloqueadas. Para testar tudo no celular, publique a pasta `software/app/` num endereço HTTPS (ex.: GitHub Pages) ou use `chrome://inspect` com encaminhamento de porta via USB.

## Funcionalidades

- **Tela de entrada:**
  - **Continuar com o Google:** botão oficial do Google; o app usa o nome, o e-mail e a foto da conta (ver configuração abaixo);
  - **Entrar com nome:** nome, e-mail e senha, **ainda sem validação**; o nome é guardado só para a saudação.
- **Mapa da placa:** reprodução visual da prancheta de MDF, no estilo de um mapa de assentos de avião. As fileiras são os blocos temáticos (Saúde, Emoções, Escola, Social), as colunas são A–C e cada botão tem um código (1A, 3C…). A legenda mostra com áudio, falta gravar, selecionado e sem botão. O LED virtual acende por 2 s ao tocar uma frase, como na placa real.
- **Editor do botão:** frase de até 40 caracteres, grade de pictogramas e seção de voz.
  - gravar pelo microfone (até 8 s), enviar um arquivo de áudio, ouvir e remover;
  - prévia com voz sintética do navegador;
  - setas para ir de botão em botão, como quem percorre os assentos.
- **Preparo do áudio:** todo áudio vira WAV mono 16 bits a 22.050 Hz (formato aceito pelo DFPlayer). O silêncio do começo e do fim é cortado e o volume é normalizado. Cortar o silêncio inicial reduz o tempo entre apertar o botão e ouvir a frase.
- **Salvar no cartão SD:**
  - no Chrome/Edge do computador, grava direto no cartão (`/01/001.wav` … `/01/010.wav` + `falaplaca.json`) e remove versões antigas com o mesmo número;
  - nos demais navegadores, baixa um `.zip` com a mesma estrutura.
- **Enviar por Bluetooth:** grava frases, áudios e volume direto na memória da placa, **sem cartão** (ver requisito de hardware abaixo). Há uma **placa de demonstração** para testar o fluxo sem hardware.
- **Imprimir etiquetas:** imprime só a placa, para recortar os pictogramas e as frases.
- **Offline:** os dados ficam no próprio aparelho (IndexedDB), e o service worker guarda o app para abrir sem internet.

## Login com Google: configuração

O botão usa o [Google Identity Services](https://developers.google.com/identity/gsi/web) e precisa de um ID de cliente OAuth. Enquanto ele não for definido, o botão aparece desativado com um aviso e a entrada por nome continua funcionando.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie (ou escolha) um projeto.
2. Em **APIs e serviços > Tela de permissão OAuth**, configure o app como **Externo**, com nome e e-mail de suporte. Em modo de teste, cadastre os e-mails que poderão entrar.
3. Em **Credenciais > Criar credenciais > ID do cliente OAuth**, escolha **Aplicativo da Web**.
4. Em **Origens JavaScript autorizadas**, adicione cada endereço onde o app roda: `http://localhost`, `http://localhost:5173` e o endereço HTTPS publicado (ex.: `https://<usuario>.github.io`). Não é preciso URI de redirecionamento.
5. Copie o ID gerado (`…apps.googleusercontent.com`) para `GOOGLE_CLIENT_ID` em [app/js/config.js](app/js/config.js).

O ID do cliente não é segredo e pode ficar no repositório.

Para o login com Google funcionar no celular, o app precisa estar publicado em HTTPS. Endereços de rede local como `http://192.168…` não são aceitos pelo Google como origem.

**Segurança:** como o protótipo não tem servidor, o token do Google é apenas lido no navegador e **não é verificado**. Isso basta para personalizar a interface, mas não protege dados. Quando houver backend (por exemplo, para sincronizar placas entre aparelhos), ele deve validar o token do Google antes de aceitar qualquer pedido.

## Bluetooth sem cartão: requisito de hardware

A FalaPlaca atual (Arduino + DFPlayer Mini) **não consegue** receber áudio por Bluetooth:

- o DFPlayer só toca o que está no cartão e não permite gravar nele pela serial;
- o Arduino UNO tem 32 KB de flash, pouco para guardar 10 frases.

O cadastro sem cartão pressupõe uma revisão da placa com **ESP32**:

- BLE embutido;
- 4 MB de flash, onde os áudios ficam numa partição LittleFS;
- saída de áudio por I2S com amplificador MAX98357A no alto-falante.

O app já implementa o lado do celular. O firmware ESP32 ainda precisa ser escrito, seguindo o protocolo abaixo.

Navegadores com Web Bluetooth: Chrome e Edge no Android, Windows, macOS e Linux. iPhone/iPad, Safari e Firefox ainda não suportam; nesses aparelhos, use o cartão SD.

### Protocolo BLE (v1)

| Característica | UUID | Propriedades | Uso |
| :-- | :-- | :-- | :-- |
| Serviço | `f1a1a000-6c61-4e50-8d1a-46616c61506c` | — | Anunciado com nome iniciando em `FalaPlaca` |
| Controle | `f1a1a001-6c61-4e50-8d1a-46616c61506c` | write | Comandos em texto UTF-8 |
| Dados | `f1a1a002-6c61-4e50-8d1a-46616c61506c` | write | Pacotes binários de áudio (até 180 bytes) |
| Status | `f1a1a003-6c61-4e50-8d1a-46616c61506c` | notify | Respostas da placa |

| Comando (Controle) | Resposta (Status) | Efeito |
| :-- | :-- | :-- |
| `HELLO` | `FALAPLACA v1 botoes=10 livre=<bytes>` | Identifica a placa e a memória livre |
| `VOL <0-30>` | `OK` | Ajusta o volume |
| `TXT <n> <frase>` | `OK` | Guarda a frase do botão *n* |
| `AUD <n> <bytes> <taxa>` | `OK` | Começa a receber o áudio do botão *n* (PCM 8 bits sem sinal, mono, 8.000 Hz) |
| *pacotes em Dados* | — | Bytes do áudio, em ordem |
| `FIM <n> <crc32>` | `OK` ou `ERR <motivo>` | Confere o CRC-32 (hex) e grava o arquivo |
| `DEL <n>` | `OK` | Apaga o áudio do botão *n* |
| `PLAY <n>` | `OK` | Toca o botão *n* (teste a partir do app) |
| `SALVAR` | `OK` | Confirma a configuração na flash |

A placa também pode enviar `BTN <n>` por Status quando um botão físico for apertado. O app acende o botão correspondente no mapa.

Estimativa: frases de cerca de 3 s ocupam 24 KB cada, e os 10 botões cabem em cerca de 240 KB de flash. A transferência deve levar alguns segundos por botão. Esses valores precisam ser medidos com o hardware.

## Estrutura

```text
software/
  package.json        script "start"
  servidor.mjs        servidor estático local (sem dependências)
  app/
    index.html        telas: entrada, mapa da placa, editor e envio
    manifest.webmanifest, sw.js, icons/
    css/styles.css
    js/
      app.js          interface e fluxo
      layout.js       posições dos 10 botões e frases padrão (espelha o firmware)
      audio.js        gravação, corte de silêncio, WAV e PCM 8 bits
      store.js        persistência (IndexedDB)
      sdcard.js       gravação no cartão / .zip
      zip.js          gerador de ZIP e CRC-32
      bluetooth.js    Web Bluetooth + placa de demonstração
      config.js       GOOGLE_CLIENT_ID
      google.js       login com Google (Google Identity Services)
      icones.js       ícones SVG
```

Ao mudar a ordem ou a quantidade de botões, altere juntos `js/layout.js` e `PINOS_BOTOES` em `firmware/arduino/FalaPlaca/FalaPlaca.ino`.

## Limitações do protótipo

- O login (Google ou nome) só identifica quem está usando; não há contas no servidor. Os dados ficam só no aparelho e no navegador em que foram criados, mesmo entrando com a mesma conta Google em outro aparelho.
- O caminho Bluetooth depende da placa ESP32, ainda não construída. Até lá, use a placa de demonstração.
- Ainda não há importação de um cartão já gravado (o `falaplaca.json` é gerado para permitir isso no futuro).
- A reprodução de WAV pelo DFPlayer deve ser confirmada no módulo usado; o DFPlayer também aceita MP3.
