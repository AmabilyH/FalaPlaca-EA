# Contexto do projeto

O FalaPlaca é uma prancheta física de Comunicação Aumentativa e Alternativa (CAA) para estudantes não-verbais em salas de AEE de escolas públicas. Cada botão tátil reproduz uma frase pré-gravada, por meio de um módulo DFPlayer Mini. O dispositivo deve:

- funcionar 100% offline, sem tela;
- ter baixo custo (limite de R$ 160);
- permitir que a professora troque as frases sem reprogramar a placa.

Os dados técnicos completos do artigo submetido à MNR 2026 estão em [artigo-mnr2026.md](artigo-mnr2026.md): equipe, componentes, vocabulário original de 12 frases, custos, plano de testes e evoluções.

## Requisitos do dispositivo

| Item | Requisito |
| :-- | :-- |
| Entrada | 10 botões arcade em 2 fileiras × 5, uma cor por coluna, sobre formas gravadas a laser |
| Mapeamento | Botão *n* → arquivo *n* no cartão MicroSD (`/01/00n`) |
| Áudio | DFPlayer Mini + alto-falante 0,5 W |
| Feedback | LED aceso por 2 s após cada acionamento |
| Alimentação | Bateria 9 V ou USB |
| Estrutura | MDF 3 mm cortado a laser |
| Personalização | Trocar frases sem alterar o firmware, pelo app em `software/` |
| Métricas de teste | Tempo de resposta (pressionar → início do áudio) e acerto ≥ 90% |

## Vocabulário: de 12 para 10 botões

Saíram as duas frases menos ligadas a necessidades imediatas:

- **"Foi um prazer."**: fórmula social de despedida, de uso raro na rotina do AEE;
- **"Terminei a atividade."**: pode ser comunicado pela entrega da atividade ou por "Preciso de ajuda.".

As necessidades fisiológicas, as emoções, o pedido de ajuda, a sinalização de não entendimento, a saudação e o agradecimento foram mantidos.

## Layout do protótipo físico

A placa construída é de MDF claro na horizontal. A gravação a laser traz "MNR" à esquerda, "FalaPlaca" no centro e o logo "Engenheiras do Amanhã" à direita, com dois furos de fixação nos cantos superiores. Os 10 botões arcade ficam em 2 fileiras de 5:

- **cor por coluna:** A vermelho, B laranja, C branco, D verde, E azul;
- **forma gravada atrás do botão:** na fileira 1, coração, estrela, triângulo, quadrado e cruz; na fileira 2, losangos;
- **etiqueta:** um retângulo gravado acima de cada botão recebe a etiqueta com pictograma e frase (o app imprime as etiquetas).

| Botão | Posição | Cor | Forma | Bloco | Frase | Pino |
| :-: | :-: | :-- | :-- | :-- | :-- | :-: |
| 1 | 1A | vermelho | coração | Saúde | "Estou com dor." | D2 |
| 2 | 1B | laranja | estrela | Saúde | "Preciso ir ao banheiro." | D3 |
| 3 | 1C | branco | triângulo | Saúde | "Preciso de água." | D4 |
| 4 | 1D | verde | quadrado | Emoções | "Estou feliz." | D5 |
| 5 | 1E | azul | cruz | Emoções | "Estou triste." | D6 |
| 6 | 2A | vermelho | losango | Emoções | "Estou com medo." | D7 |
| 7 | 2B | laranja | losango | Escola | "Preciso de ajuda." | D8 |
| 8 | 2C | branco | losango | Escola | "Não entendi." | D9 |
| 9 | 2D | verde | losango | Social | "Olá." | A0 |
| 10 | 2E | azul | losango | Social | "Obrigado(a)." | A1 |

Os blocos temáticos agora são uma propriedade de cada botão, escolhida no app; a cor do botão é física e fixa por coluna. A numeração e a ordem dos pinos não mudaram em relação à versão anterior. **Confirmar na fiação** que cada pino está ligado ao botão da posição indicada.

## Ligações (sketch principal)

| Sinal | Arduino UNO | Arduino Mega |
| :-- | :-- | :-- |
| Botões 1–10 | D2–D9, A0, A1 (entre o pino e o GND, sem resistor: usa `INPUT_PULLUP`) | igual |
| DFPlayer TX → Arduino | D10 (SoftwareSerial) | RX1 (19) |
| Arduino → DFPlayer RX | D11 com resistor de 1 kΩ em série | TX1 (18) com 1 kΩ |
| LED de confirmação | D13 + resistor de 220 Ω (também acende o LED da placa) | igual |
| DFPlayer BUSY → Arduino (opcional) | D12 (mede o tempo até o áudio começar, para o modo de teste) | igual |
| Módulo Bluetooth TXD → Arduino | — (sem Bluetooth) | RX2 (17) |
| Arduino → módulo Bluetooth RXD | — | TX2 (16) por divisor de tensão: 1 kΩ em série e 2 kΩ para o GND (o RXD do módulo é 3,3 V) |
| Módulo Bluetooth VCC / GND | — | 5 V e GND (HM-10, AT-09 e HC-05 em placa com regulador) |
| Cabo USB | conexão com o app | conexão com o app |

O firmware escolhe as seriais na compilação: `Serial1` para o DFPlayer quando a placa a possui (`SoftwareSerial` caso contrário) e `Serial2` para o módulo Bluetooth quando ela existe. O mesmo sketch compila para UNO (7,3 KB de flash, conexão com o app só pelo cabo USB) e Mega (7,6 KB, cabo USB e Bluetooth).

O módulo Bluetooth pode ser **BLE** (HM-10, AT-09, HC-08, JDY-08) ou **clássico** (HC-05, HC-06): a ligação é a mesma. O BLE funciona no computador e no Android; o HC-05 funciona com certeza no computador, pareado como porta serial, e no Android depende da versão do Chrome. Preparo do módulo e comandos em [software/README.md](../../software/README.md#conexão-com-a-placa).

## Estado atual do firmware

- `firmware/arduino/FalaPlaca/FalaPlaca.ino` implementa os 10 botões:
  - pinos guardados em vetor e lidos num laço, com debounce de 50 ms;
  - toca só ao pressionar, não ao soltar, e uma vez por pressão;
  - **ajustes para tremor** configuráveis pelo app e guardados na EEPROM: tempo mínimo de pressão (50–1500 ms; falhas de contato menores que 50 ms durante a pressão não reiniciam a contagem) e espera para repetir a mesma frase (0–10 s). O padrão (50 ms, sem espera) mantém o comportamento original;
  - LED de 2 s sem `delay()`;
  - `isACK=false` para módulos DFPlayer clone;
  - LED piscando rápido quando o DFPlayer não inicia;
  - comandos do app pelo cabo USB (UNO e Mega) e, no Mega, pelo módulo Bluetooth na `Serial2`: recebe volume, ajustes e frases (guardados na EEPROM), toca botões a pedido do app e avisa cada botão apertado;
  - **tempo de resposta medido**: com o BUSY do DFPlayer no D12, a placa envia ao app quanto tempo passou do início da pressão até o áudio começar (`AUDIO <n> <ms>`). Só mede quando o DFPlayer estava parado, para não confundir com um áudio anterior.
- `examples/PrimeiroTesteFuncional` e `examples/SegundoTesteCompleto` ficam como registro dos protótipos anteriores: 2 botões, e 12 botões nos pinos 22–33 do Mega.
- **Atenção:** um protótipo montado com o exemplo de 12 botões no Mega (pinos 22–33) precisa ser religado conforme a tabela acima.

## Camada de software

O app em [software/](../../software/README.md) é um PWA que roda no navegador e no celular. Nele, a professora:

- vê a placa como no protótipo físico, organizada como um mapa de assentos (fileiras 1–2, colunas A–E);
- define a frase e o pictograma de cada botão, com **pictogramas ARASAAC** (acervo de referência em CAA, licença CC BY-NC-SA, guardados no aparelho para uso offline) ou emoji;
- grava a voz pelo microfone ou envia um arquivo;
- exporta para o cartão SD (gravação direta ou `.zip`) ou se conecta à placa;
- aplica o **modo de teste**, que segue o protocolo de validação do artigo: pede botões, registra botão certo, acerto do áudio e tempo de resposta, e gera a tabela por bloco e a planilha CSV.

A conexão tem um único botão, **Procurar FalaPlaca**, que serve para módulo BLE, HC-05 ou cabo USB e reconecta sozinho às placas já usadas. Com a placa conectada, o app envia frases e volume, testa os botões e acompanha em tempo real os botões apertados; as vozes continuam indo pelo cartão SD. Isso também ajuda nos testes de validação, porque o app vê cada acionamento.

O envio dos **áudios** por Bluetooth, **sem cartão de memória**, não é possível com Arduino + DFPlayer: o DFPlayer só lê do cartão, e o Arduino não tem memória para os áudios. Ele pressupõe uma revisão da placa com ESP32 (BLE + 4 MB de flash + amplificador I2S). O protocolo está definido em `software/README.md`; o firmware ESP32 ainda não existe. Até lá, o app oferece uma placa de demonstração.

## Organização do cartão MicroSD

```text
/01/001.wav   botão 1  – "Estou com dor."
/01/002.wav   botão 2  – "Preciso ir ao banheiro."
...
/01/010.wav   botão 10 – "Obrigado(a)."
/falaplaca.json   frases, pictogramas e posições (referência do app)
```

O cartão deve estar em FAT32. O DFPlayer identifica o arquivo pelo número de três dígitos, então a extensão pode ser `.wav` ou `.mp3`. Não deixe dois arquivos com o mesmo número; o app remove os antigos ao gravar direto no cartão.

## Divergências entre o artigo e o projeto

| Tema | Artigo | Projeto atual | Encaminhamento |
| :-- | :-- | :-- | :-- |
| Número de botões | 12 (o resumo em inglês cita 16) | 10 | Atualizar texto, tabela de vocabulário e custo (2 botões a menos: −R$ 5,98) |
| Placa | Arduino UNO | UNO ou Mega (o sketch principal compila para os dois) | Resolvido no firmware |
| LED de 2 s | Previsto | Implementado | — |
| Arquivos de áudio | `001.mp3` na raiz | `/01/001.wav` (ou `.mp3`) | Ajustar o texto do artigo |
| Personalização | "sem reprogramação", gravação manual dos MP3 | App com gravação, tratamento do áudio e exportação para o cartão | Pode ser citado como evolução da "interface gráfica" prevista |
| Bluetooth | Não citado | App pronto; requer placa com ESP32 | Incluir nas perspectivas futuras, não nos resultados |
| Fabricação | Corte a laser (o resumo em inglês cita também impressão 3D) | — | Alinhar os resumos em português e inglês |
| Resultados | Tempos e eficiência projetados (1,8 s; 97,5%) | Modo de teste no app mede acerto e tempo de resposta (pelo BUSY do DFPlayer) e gera a Tabela 1 por bloco | Substituir as projeções pelas medições das sessões de teste |
| Pictogramas | Pictogramas impressos (futuro em 3D colorido); a discussão cita símbolos concretos e abstratos | Pictogramas ARASAAC nas etiquetas, com crédito | Citar a ARASAAC no artigo, com o crédito exigido pela licença |
| Custo | Texto cita "< R$ 120", "< R$ 130" e R$ 152,06 | — | A soma da tabela original dá R$ 152,31; com 10 botões, R$ 146,33 |

## Decisões e pontos a confirmar

- Manter firmware e aplicação de software em camadas e diretórios independentes; `software/app/js/layout.js` e `PINOS_BOTOES` do firmware devem mudar juntos.
- Confirmar a reprodução de WAV no módulo DFPlayer usado (alguns clones só aceitam MP3).
- A bateria 9 V tem baixa autonomia para Arduino + DFPlayer; a troca por Li-Po já está prevista.
- Os tempos de resposta e a eficiência citados no artigo (1,8 s; 97,5%) são **projeções**. Devem ser substituídos por medições com o protótipo físico, seguindo o protocolo de [artigo-mnr2026.md](artigo-mnr2026.md#plano-de-validação). O modo de teste do app automatiza esse protocolo; ligue o BUSY do DFPlayer ao D12 para medir o tempo de resposta.

Os sketches existentes são a fonte do comportamento implementado. Este documento registra o contexto conhecido e não substitui a validação do circuito.
