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
- **Mapa da placa:** reprodução do protótipo físico: MDF claro na horizontal, gravações "MNR", "FalaPlaca" e "Engenheiras do Amanhã", e 2 fileiras de 5 botões arcade, com uma cor por coluna (vermelho, laranja, branco, verde, azul).
  - Cada botão aparece sobre a forma gravada a laser: coração, estrela, triângulo, quadrado e cruz na fileira 1, losangos na fileira 2.
  - Acima de cada botão fica a etiqueta com o pictograma e a frase, e uma faixa colorida indica o bloco temático.
  - No estilo de um mapa de assentos de avião, as fileiras são 1–2 e as colunas A–E; cada botão tem um código (1A, 2C…).
  - A legenda mostra com áudio, falta gravar, selecionado e tocando. Ao tocar uma frase, o botão e o LED acendem por 2 s, como na placa real.
- **Editor do botão:** prévia do botão com sua cor e forma, frase de até 40 caracteres, bloco temático (Saúde, Emoções, Escola, Social), seção de voz e pictograma.
  - **Pictogramas ARASAAC** (padrão): o app sugere pictogramas a partir da frase ("Preciso de água" → "água") e permite buscar outra palavra. O escolhido é baixado uma vez e guardado no aparelho, então aparece offline e nas etiquetas impressas. Aba **Emoji** como alternativa.
  - gravar pelo microfone (até 8 s), enviar um arquivo de áudio, ouvir e remover;
  - prévia com voz sintética do navegador;
  - setas para ir de botão em botão, como quem percorre os assentos.
- **Preparo do áudio:** todo áudio vira WAV mono 16 bits a 22.050 Hz (formato aceito pelo DFPlayer). O silêncio do começo e do fim é cortado e o volume é normalizado. Cortar o silêncio inicial reduz o tempo entre apertar o botão e ouvir a frase.
- **Salvar no cartão SD:**
  - no Chrome/Edge do computador, grava direto no cartão (`/01/001.wav` … `/01/010.wav` + `falaplaca.json`) e remove versões antigas com o mesmo número;
  - nos demais navegadores, baixa um `.zip` com a mesma estrutura.
- **Conectar à placa:** um único botão, **Procurar FalaPlaca**, para qualquer forma de ligação (ver abaixo). Com a placa conectada, o app envia frases e volume, toca qualquer botão e acende no mapa o botão apertado na placa. No Arduino, os áudios continuam indo pelo cartão SD; na futura FalaPlaca ESP32, vão junto, **sem cartão**. O link **Testar sem placa** abre uma demonstração.
- **Modo de teste:** sessões de validação como as do artigo (ver abaixo), com resultado por bloco e planilha CSV.
- **Imprimir etiquetas:** imprime só a placa, para recortar os pictogramas e as frases, com o crédito da ARASAAC.
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

## Conexão com a placa

O app tem um único botão, **Procurar FalaPlaca**, e descobre sozinho como a placa está ligada:

| Ligação | Placa | API do navegador | Onde funciona |
| :-- | :-- | :-- | :-- |
| Módulo **BLE** (HM-10, AT-09/BT05, HC-08, JDY-08) | Mega (`Serial2`) | Web Bluetooth | Chrome/Edge no Android, Windows, macOS e Linux |
| Módulo **HC-05 / HC-06** (Bluetooth clássico) | Mega (`Serial2`) | Web Serial | Chrome/Edge no computador; no Android, depende da versão do Chrome (a confirmar) |
| **Cabo USB** | UNO ou Mega | Web Serial | Chrome/Edge no computador |

iPhone, iPad, Safari e Firefox não têm nenhuma das duas APIs; nesses aparelhos, use o cartão SD.

Como o botão funciona:

1. **Placa já usada antes:** o app tenta as conexões já autorizadas e reconecta sem abrir janela nenhuma. Pelo cabo USB, abrir a porta reinicia o Arduino, então o app repete o `HELLO` a cada segundo até a placa responder.
2. **Primeira vez:** o navegador mostra Bluetooth BLE e portas seriais em janelas de escolha separadas. O toque abre a janela do Bluetooth; se a professora cancelar porque a placa não apareceu, o próximo toque no mesmo botão abre a das portas seriais (HC-05 e cabo USB), com uma dica curta. Se a reconexão automática demorar mais que a janela de tempo que o navegador dá a um toque (cerca de 5 s), o app pede mais um toque.

O código está em [app/js/conexao.js](app/js/conexao.js) (busca), [app/js/bluetooth.js](app/js/bluetooth.js), [app/js/serial.js](app/js/serial.js) e [app/js/protocolo.js](app/js/protocolo.js) (comandos comuns).

**Preparo do módulo Bluetooth (uma vez):**

- **BLE (HM-10, AT-09…):** renomeie o módulo com o comando AT `AT+NAMEFalaPlaca` (alguns modelos pedem `AT+NAME=FalaPlaca`). Sem renomear, o app ainda encontra módulos com os nomes de fábrica `HMSoft`, `BT05`, `HC-08` e `JDY…`.
- **HC-05:** pareie o módulo nas configurações de Bluetooth do computador (senha padrão `1234` ou `0000`); ele passa a aparecer como porta serial ("Serial padrão por link Bluetooth" no Windows). Para trocar o nome, use `AT+NAME=FalaPlaca` no modo AT do módulo.

Os comandos AT podem ser enviados pelo Monitor Serial do Arduino IDE, com um sketch de passagem, ou por um adaptador USB-serial. O firmware fala com o módulo na `Serial2` do Mega, a 9600 baud, que é a velocidade padrão do HM-10 e do HC-05 (ligações em [docs/contexto](../docs/contexto/README.md#ligações-sketch-principal)). O UNO não tem uma segunda serial livre: nele, a conexão com o app é pelo cabo USB.

O que funciona por qualquer uma dessas ligações:

| Ação | Comando | Na placa |
| :-- | :-- | :-- |
| Identificar | `HELLO` → `FALAPLACA v1 placa=mega audio=sd botoes=10 pressao=50 repeticao=0` | O app passa a enviar só frases, volume e ajustes. Sem `pressao=` (firmware antigo), o app não envia ajustes e pede a atualização do firmware |
| Volume | `VOL <0-30>` → `OK` | Ajusta o DFPlayer e guarda na EEPROM (vale após religar) |
| Ajustes para tremor | `AJUSTE <pressão ms> <espera ms>` → `OK` | Tempo mínimo segurando o botão (50–1500 ms) e espera para repetir a mesma frase (0–10000 ms; 0 = sem espera). Guardados na EEPROM |
| Frase | `TXT <n> <frase>` → `OK` | Guarda a frase na EEPROM, como referência |
| Testar | `PLAY <n>` → `OK` | Toca o botão *n* e acende o LED |
| Botão apertado | a placa envia `BTN <n>` | O app acende o mesmo botão no mapa |
| Áudio começou | a placa envia `AUDIO <n> <ms>` | Tempo do aperto até o DFPlayer começar a tocar, medido pelo pino BUSY (D12). Usado pelo modo de teste; sem o fio do BUSY, não é enviado |
| Áudio | `AUD …` → `ERR audio pelo cartao SD` | Não suportado: use a aba Cartão SD |

**Ajustes para tremor** (aba Conectar, com a placa conectada): quatro perfis prontos e ajuste fino. São pontos de partida, para calibrar observando o estudante:

| Perfil | Segurar por pelo menos | Espera para repetir a mesma frase |
| :-- | :-: | :-: |
| Padrão (comportamento original) | 0,05 s | sem espera |
| Leve | 0,15 s | 1 s |
| Moderado | 0,3 s | 2 s |
| Intenso | 0,6 s | 3 s |

- **Tempo mínimo de pressão:** toques mais curtos (esbarrões, toques acidentais) não tocam. A frase toca assim que a pressão atinge o tempo, sem esperar soltar. Falhas curtas do contato durante a pressão (menos de 50 ms, comuns com tremor) não reiniciam a contagem.
- **Espera para repetir:** o mesmo botão só toca de novo depois do intervalo; outros botões tocam na hora. O comando `PLAY` do app não é afetado, para não atrapalhar os testes.

Os comandos são linhas de texto terminadas em `\n`. No módulo BLE, o app divide cada linha em pacotes de até 20 bytes (limite desses módulos). Em todas as ligações, junta as respostas que chegam em pedaços e ignora as linhas de diagnóstico da placa (ex.: `Tocando botao 3`, enviada pela USB).

## Modo de teste

Reproduz o protocolo de validação do artigo (seção 3): para cada tentativa, o app pede um botão, e a placa informa qual botão foi apertado e quando o áudio começou. Quem aplica o teste confirma se o áudio estava certo.

1. Conecte a placa (ou use a demonstração, em que o aperto é simulado tocando no mini-mapa).
2. Informe o(a) avaliador(a), as repetições por botão (1 a 10) e a ordem: aleatória, sem o mesmo botão duas vezes seguidas, ou em sequência.
3. A cada pedido, aperte o botão na placa e responda **Sim**, **Não** ou **Não tocou** (atalhos S, N e T). A confirmação pode ser desligada.

Medidas registradas em cada tentativa:

| Medida | Como é obtida |
| :-- | :-- |
| Botão certo | O botão apertado (`BTN`) é o pedido? |
| Acerto do áudio | Confirmação de quem aplica o teste: o áudio corresponde à frase do botão apertado? |
| Tempo de resposta | Do início da pressão no botão até o DFPlayer começar a tocar (`AUDIO`, pino BUSY). Exige o fio BUSY → D12 |
| Tempo de reação | Do pedido na tela até o aperto (desempenho de quem aperta) |

No fim aparecem: acerto do áudio, botão certo, tempo médio de resposta (com mediana e desvio padrão amostral) e uma tabela por bloco no formato da Tabela 1 do artigo. O app também indica se o critério da hipótese (acerto ≥ 90%) foi atingido. As sessões ficam salvas no aparelho (**Testes anteriores**) e cada uma pode ser baixada como planilha CSV, com uma linha por tentativa, `;` como separador e vírgula decimal, para abrir direto no Excel ou no LibreOffice.

O código está em [app/js/teste.js](app/js/teste.js) (sorteio, estatística e CSV) e [app/js/modo-teste.js](app/js/modo-teste.js) (tela).

## Pictogramas ARASAAC

Os pictogramas vêm da [ARASAAC](https://arasaac.org), o acervo de referência em Comunicação Aumentativa e Alternativa. A busca usa a API pública, primeiro em português do Brasil e depois em português de Portugal. A imagem escolhida é guardada no aparelho (IndexedDB), por isso o app continua funcionando sem internet; só a busca de novos pictogramas precisa de conexão.

Padrões de cada botão:

| Botão | Frase | Pictograma (ID) |
| :-: | :-- | :-: |
| 1 | Estou com dor. | 2367 |
| 2 | Preciso ir ao banheiro. | 2430 |
| 3 | Preciso de água. | 2248 |
| 4 | Estou feliz. | 32123 |
| 5 | Estou triste. | 2606 |
| 6 | Estou com medo. | 10261 |
| 7 | Preciso de ajuda. | 7171 |
| 8 | Não entendi. | 27363 |
| 9 | Olá. | 6009 |
| 10 | Obrigado(a). | 8128 |

**Licença:** CC BY-NC-SA 4.0. O uso educacional e não comercial é livre, desde que se dê o crédito, e obras derivadas devem manter a mesma licença. O crédito aparece no mapa da placa e nas etiquetas impressas: *"Pictogramas: Sergio Palao. Origem: ARASAAC (arasaac.org). Licença CC BY-NC-SA. Propriedade: Governo de Aragão (Espanha)."* Ao publicar o artigo ou fotos das etiquetas, inclua o mesmo crédito.

## Bluetooth sem cartão: requisito de hardware

A FalaPlaca atual (Arduino + DFPlayer Mini) **não consegue** receber áudio por nenhuma dessas conexões:

- o DFPlayer só toca o que está no cartão e não permite gravar nele pela serial;
- o Arduino UNO tem 32 KB de flash, pouco para guardar 10 frases.

O cadastro sem cartão pressupõe uma revisão da placa com **ESP32**:

- BLE embutido;
- 4 MB de flash, onde os áudios ficam numa partição LittleFS;
- saída de áudio por I2S com amplificador MAX98357A no alto-falante.

O app já implementa o lado do celular. O firmware ESP32 ainda precisa ser escrito, seguindo o protocolo abaixo.

Navegadores com Web Bluetooth: Chrome e Edge no Android, Windows, macOS e Linux. iPhone/iPad, Safari e Firefox ainda não suportam; nesses aparelhos, use o cartão SD.

### Protocolo BLE da FalaPlaca ESP32 (v1)

Os mesmos comandos de texto da tabela do Mega, num serviço próprio com características separadas para comandos, dados de áudio e respostas:

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
    index.html        telas: entrada, mapa da placa, editor, conexão e modo de teste
    manifest.webmanifest, sw.js, icons/
    css/styles.css
    js/
      app.js          interface e fluxo
      layout.js       posições dos 10 botões, frases e pictogramas padrão (espelha o firmware)
      audio.js        gravação, corte de silêncio, WAV e PCM 8 bits
      arasaac.js      busca e download de pictogramas ARASAAC
      store.js        persistência (IndexedDB): placa, áudios, pictogramas e testes
      sdcard.js       gravação no cartão / .zip
      zip.js          gerador de ZIP e CRC-32
      conexao.js      "Procurar FalaPlaca": escolhe Bluetooth BLE ou porta serial
      protocolo.js    comandos e eventos da placa + placa de demonstração
      bluetooth.js    Web Bluetooth (módulo BLE e futura ESP32)
      serial.js       Web Serial (HC-05 e cabo USB)
      teste.js        modo de teste: sorteio, estatística e CSV
      modo-teste.js   modo de teste: tela
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
