// FalaPlaca - prancheta de CAA com 10 botões e DFPlayer Mini.
// Botão n toca /01/00n.mp3 (ou .wav) do cartão MicroSD e acende o LED por 2 s.
// Funciona no Arduino UNO (DFPlayer via SoftwareSerial) e no Mega (via Serial1).
// O app configura a placa (volume, frases, ajustes, teste dos botões, aviso dos botões apertados e
// tempo de resposta medido pelo BUSY do DFPlayer no D12) por:
//   - cabo USB (UNO e Mega);
//   - no Mega, módulo Bluetooth na Serial2: BLE (HM-10, AT-09, HC-08) ou clássico (HC-05, HC-06).

#include <DFRobotDFPlayerMini.h>
#include <EEPROM.h>

#if defined(HAVE_HWSERIAL1)
  #define moduloMP3 Serial1            // Mega: TX1 = 18, RX1 = 19
#else
  #include <SoftwareSerial.h>
  SoftwareSerial moduloMP3(10, 11);    // UNO: RX = 10 (TX do DFPlayer), TX = 11 (RX do DFPlayer via 1 kΩ)
#endif

#if defined(HAVE_HWSERIAL2)
  #define TEM_BLUETOOTH
  #define moduloBT Serial2             // Mega: TX2 = 16 (-> RXD do módulo, via divisor), RX2 = 17 (<- TXD)
#endif

#if defined(__AVR_ATmega2560__)
  #define NOME_PLACA "mega"
#else
  #define NOME_PLACA "uno"
#endif

DFRobotDFPlayerMini mp3;

// Ordem física da placa (2 fileiras × 5; cores por coluna: vermelho, laranja, branco, verde, azul):
//   Fileira 1:  1 dor       2 banheiro   3 água         4 feliz   5 triste
//   Fileira 2:  6 medo      7 ajuda      8 não entendi  9 olá    10 obrigado(a)
const uint8_t PINOS_BOTOES[] = {2, 3, 4, 5, 6, 7, 8, 9, A0, A1};
const uint8_t TOTAL_BOTOES = sizeof(PINOS_BOTOES) / sizeof(PINOS_BOTOES[0]);

const uint8_t PINO_LED = 13;               // também acende o LED da própria placa
const uint8_t PINO_BUSY = 12;              // BUSY do DFPlayer (LOW enquanto toca); opcional, para medir a latência
const unsigned long ESPERA_AUDIO_MS = 3000; // sem início de áudio nesse tempo, desiste da medição
const uint8_t PASTA_AUDIOS = 1;            // pasta /01 do cartão
const uint8_t VOLUME_PADRAO = 22;          // 0 (mudo) a 30 (máximo)
const unsigned long DEBOUNCE_MS = 50;      // tempo de estabilização da leitura (ao soltar e mínimo ao apertar)
const unsigned long LED_ACESO_MS = 2000;   // confirmação visual após cada acionamento

// Ajustes anti-tremor, configuráveis pelo app (comando AJUSTE) e guardados na EEPROM.
// Os padrões reproduzem o comportamento original: toca com 50 ms de pressão, sem espera para repetir.
const uint16_t PRESSAO_PADRAO_MS = DEBOUNCE_MS;  // tempo mínimo segurando o botão para tocar
const uint16_t PRESSAO_MAX_MS = 1500;
const uint16_t REPETICAO_PADRAO_MS = 0;          // espera antes de aceitar de novo a mesma frase (0 = sem espera)
const uint16_t REPETICAO_MAX_MS = 10000;

// EEPROM: assinatura + volume + ajustes + frase de cada botão (referência para o app; o áudio fica no cartão)
const int END_ASSINATURA = 0;
const int END_VOLUME = 1;
const int END_PRESSAO = 2;                 // uint16_t
const int END_REPETICAO = 4;               // uint16_t
const int END_FRASES = 8;
const uint8_t ASSINATURA = 0xFA;
const uint8_t FRASE_MAX = 64;              // bytes UTF-8 (40 caracteres com acentos)

struct Botao {
  bool pressionando;            // contato fechado; falhas menores que DEBOUNCE_MS não contam como soltar
  bool disparado;               // a frase desta pressão já tocou
  unsigned long inicioPressao;  // quando a pressão começou
  unsigned long ultimoContato;  // última leitura com o contato fechado
  unsigned long ultimoToque;    // quando a frase deste botão tocou pela última vez
  bool jaTocou;
};

// Canal de comandos do app: cada porta serial tem sua própria linha em montagem.
const uint8_t LINHA_MAX = 96;
struct Canal {
  Stream &porta;
  char linha[LINHA_MAX];
  uint8_t tamanho;
};

Botao botoes[TOTAL_BOTOES];
unsigned long ledAcesoDesde = 0;
bool ledAceso = false;
uint8_t volume = VOLUME_PADRAO;
uint16_t pressaoMs = PRESSAO_PADRAO_MS;
uint16_t repeticaoMs = REPETICAO_PADRAO_MS;

// Medição do tempo de resposta (aperto -> início do áudio) pelo pino BUSY, para o modo de teste do app.
uint8_t audioMedido = 0;                   // botão cuja frase está para começar (0 = nenhuma medição)
unsigned long inicioMedicao = 0;

Canal canalUsb = {Serial, {}, 0};
#ifdef TEM_BLUETOOTH
Canal canalBt = {moduloBT, {}, 0};
#endif

// desde: instante do aperto (ou do comando do app), base da medição do tempo de resposta.
void tocarFrase(uint8_t numero, unsigned long desde) {
  // Só mede se o DFPlayer estava parado: tocando, o BUSY já está em LOW e a medição sairia errada.
  // Sem o fio do BUSY ligado, o pino fica em HIGH (pull-up) e a medição apenas expira.
  audioMedido = digitalRead(PINO_BUSY) == HIGH ? numero : 0;
  inicioMedicao = desde;
  mp3.playFolder(PASTA_AUDIOS, numero);
  digitalWrite(PINO_LED, HIGH);
  ledAceso = true;
  ledAcesoDesde = millis();
  Serial.print(F("Tocando botao "));
  Serial.println(numero);
}

// Sem áudio a placa não tem utilidade: pisca o LED rápido para sinalizar o erro.
void sinalizarErroFatal() {
  Serial.println(F("Erro ao iniciar o modulo MP3. Verifique fios e cartao."));
  while (true) {
    digitalWrite(PINO_LED, !digitalRead(PINO_LED));
    delay(150);
  }
}

// ---- Protocolo de texto, uma linha por comando (ver software/README.md) ----

void responder(Stream &porta, const __FlashStringHelper *texto) {
  porta.print(texto);
  porta.print('\n');
}

// Lê "n" no início de args; devolve 0 se não for um botão válido.
uint8_t lerBotao(const char *args) {
  int numero = atoi(args);
  return (numero >= 1 && numero <= TOTAL_BOTOES) ? numero : 0;
}

void guardarFrase(uint8_t numero, const char *texto) {
  int endereco = END_FRASES + (numero - 1) * FRASE_MAX;
  for (uint8_t i = 0; i < FRASE_MAX; i++) {
    char c = (texto[i] && i < FRASE_MAX - 1) ? texto[i] : '\0';
    EEPROM.update(endereco + i, c);
    if (!c) break;
  }
}

void processarComando(char *comando, Stream &porta) {
  char *args = strchr(comando, ' ');
  if (args) *args++ = '\0';
  else args = comando + strlen(comando);

  if (!strcmp(comando, "HELLO")) {
    porta.print(F("FALAPLACA v1 placa=" NOME_PLACA " audio=sd botoes=10 pressao="));
    porta.print(pressaoMs);
    porta.print(F(" repeticao="));
    porta.print(repeticaoMs);
    porta.print('\n');
  } else if (!strcmp(comando, "AJUSTE")) {
    // AJUSTE <pressão mínima ms> <espera para repetir ms>
    char *segundo = strchr(args, ' ');
    if (!*args || !segundo) return responder(porta, F("ERR ajuste"));
    pressaoMs = constrain(atol(args), (long)DEBOUNCE_MS, (long)PRESSAO_MAX_MS);
    repeticaoMs = constrain(atol(segundo + 1), 0L, (long)REPETICAO_MAX_MS);
    EEPROM.put(END_PRESSAO, pressaoMs);
    EEPROM.put(END_REPETICAO, repeticaoMs);
    responder(porta, F("OK"));
  } else if (!strcmp(comando, "VOL")) {
    volume = constrain(atoi(args), 0, 30);
    mp3.volume(volume);
    EEPROM.update(END_VOLUME, volume);
    responder(porta, F("OK"));
  } else if (!strcmp(comando, "PLAY")) {
    uint8_t numero = lerBotao(args);
    if (!numero) return responder(porta, F("ERR botao"));
    tocarFrase(numero, millis());
    responder(porta, F("OK"));
  } else if (!strcmp(comando, "TXT")) {
    uint8_t numero = lerBotao(args);
    char *texto = strchr(args, ' ');
    if (!numero) return responder(porta, F("ERR botao"));
    guardarFrase(numero, texto ? texto + 1 : "");
    responder(porta, F("OK"));
  } else if (!strcmp(comando, "DEL") || !strcmp(comando, "SALVAR")) {
    responder(porta, F("OK"));              // áudios ficam no cartão; nada a apagar ou confirmar
  } else if (!strcmp(comando, "AUD")) {
    responder(porta, F("ERR audio pelo cartao SD"));
  } else if (!strncmp(comando, "OK+", 3)) {
    // avisos do próprio módulo BLE (ex.: OK+CONN): ignorar
  } else {
    responder(porta, F("ERR comando"));
  }
}

void lerCanal(Canal &canal) {
  while (canal.porta.available()) {
    char c = canal.porta.read();
    if (c == '\n' || c == '\r') {
      if (canal.tamanho) {
        canal.linha[canal.tamanho] = '\0';
        processarComando(canal.linha, canal.porta);
        canal.tamanho = 0;
      }
    } else if (canal.tamanho < LINHA_MAX - 1) {
      canal.linha[canal.tamanho++] = c;
    }
  }
}

void enviarEvento(Stream &porta, const __FlashStringHelper *evento, uint8_t numero, long valor) {
  porta.print(evento);
  porta.print(numero);
  if (valor >= 0) {
    porta.print(' ');
    porta.print(valor);
  }
  porta.print('\n');
}

// Avisa o app, por todas as conexões: "BTN <n>" (botão apertado) ou "AUDIO <n> <ms>" (áudio começou).
void avisarApp(const __FlashStringHelper *evento, uint8_t numero, long valor = -1) {
  enviarEvento(Serial, evento, numero, valor);
#ifdef TEM_BLUETOOTH
  enviarEvento(moduloBT, evento, numero, valor);
#endif
}

void setup() {
  Serial.begin(9600);
  moduloMP3.begin(9600);
#ifdef TEM_BLUETOOTH
  moduloBT.begin(9600);                     // velocidade padrão dos módulos HM-10, AT-09 e HC-05
#endif

  pinMode(PINO_LED, OUTPUT);
  pinMode(PINO_BUSY, INPUT_PULLUP);
  for (uint8_t i = 0; i < TOTAL_BOTOES; i++) {
    pinMode(PINOS_BOTOES[i], INPUT_PULLUP);   // botão ligado entre o pino e o GND
    botoes[i] = {false, false, 0, 0, 0, false};
  }

  if (EEPROM.read(END_ASSINATURA) == ASSINATURA) {
    volume = constrain(EEPROM.read(END_VOLUME), 0, 30);
    // Placas gravadas antes dos ajustes têm 0xFFFF nesses endereços: valem os padrões.
    uint16_t salvo;
    EEPROM.get(END_PRESSAO, salvo);
    if (salvo >= DEBOUNCE_MS && salvo <= PRESSAO_MAX_MS) pressaoMs = salvo;
    EEPROM.get(END_REPETICAO, salvo);
    if (salvo <= REPETICAO_MAX_MS) repeticaoMs = salvo;
  } else {
    EEPROM.update(END_ASSINATURA, ASSINATURA);
    EEPROM.update(END_VOLUME, volume);
    EEPROM.put(END_PRESSAO, pressaoMs);
    EEPROM.put(END_REPETICAO, repeticaoMs);
  }

  // isACK = false: necessário para módulos clone que não respondem ACK
  // corretamente, o que travava o begin() esperando confirmação que nunca chegava.
  if (!mp3.begin(moduloMP3, /*isACK=*/false, /*doReset=*/true)) {
    sinalizarErroFatal();
  }

  mp3.volume(volume);
  Serial.println(F("FalaPlaca pronta!"));
}

void loop() {
  unsigned long agora = millis();

  for (uint8_t i = 0; i < TOTAL_BOTOES; i++) {
    Botao &b = botoes[i];
    bool contato = digitalRead(PINOS_BOTOES[i]) == LOW;   // botão ligado ao GND

    if (contato) {
      if (!b.pressionando) {
        b.pressionando = true;
        b.inicioPressao = agora;
      }
      b.ultimoContato = agora;
    } else if (b.pressionando && (agora - b.ultimoContato) > DEBOUNCE_MS) {
      b.pressionando = false;    // soltou de verdade: a próxima pressão pode tocar
      b.disparado = false;
    }

    // Toca uma vez por pressão, quando ela dura o tempo mínimo configurado: toques rápidos e
    // acidentais não tocam, e falhas curtas do contato por tremor não reiniciam a contagem.
    if (b.pressionando && !b.disparado && contato && (agora - b.inicioPressao) >= pressaoMs) {
      b.disparado = true;
      // Mesma frase de novo antes do intervalo (ex.: tremor repetindo o toque): ignora.
      bool cedoDemais = repeticaoMs && b.jaTocou && (agora - b.ultimoToque) < repeticaoMs;
      if (!cedoDemais) {
        b.ultimoToque = agora;
        b.jaTocou = true;
        tocarFrase(i + 1, b.inicioPressao);   // tempo de resposta conta desde o aperto
        avisarApp(F("BTN "), i + 1);          // o app acende o botão no mapa
      }
    }
  }

  // Tempo de resposta: do aperto até o DFPlayer começar a tocar (BUSY vai para LOW).
  if (audioMedido) {
    if (digitalRead(PINO_BUSY) == LOW) {
      avisarApp(F("AUDIO "), audioMedido, agora - inicioMedicao);
      audioMedido = 0;
    } else if (agora - inicioMedicao > ESPERA_AUDIO_MS) {
      audioMedido = 0;                   // BUSY não ligado ou áudio não tocou
    }
  }

  lerCanal(canalUsb);
#ifdef TEM_BLUETOOTH
  lerCanal(canalBt);
#endif

  if (ledAceso && (agora - ledAcesoDesde) >= LED_ACESO_MS) {
    digitalWrite(PINO_LED, LOW);
    ledAceso = false;
  }
}
