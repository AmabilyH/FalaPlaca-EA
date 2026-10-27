// FalaPlaca - prancheta de CAA com 10 botões e DFPlayer Mini.
// Botão n toca /01/00n.mp3 (ou .wav) do cartão MicroSD e acende o LED por 2 s.
// Funciona no Arduino UNO (DFPlayer via SoftwareSerial) e no Mega (via Serial1).

#include <DFRobotDFPlayerMini.h>

#if defined(HAVE_HWSERIAL1)
  #define moduloMP3 Serial1            // Mega: TX1 = 18, RX1 = 19
#else
  #include <SoftwareSerial.h>
  SoftwareSerial moduloMP3(10, 11);    // UNO: RX = 10 (TX do DFPlayer), TX = 11 (RX do DFPlayer via 1 kΩ)
#endif

DFRobotDFPlayerMini mp3;

// Ordem física da placa (fileiras = blocos temáticos):
//   Saúde:   1 dor          2 banheiro    3 água
//   Emoções: 4 feliz        5 triste      6 medo
//   Escola:  7 ajuda        8 não entendi
//   Social:  9 olá         10 obrigado(a)
const uint8_t PINOS_BOTOES[] = {2, 3, 4, 5, 6, 7, 8, 9, A0, A1};
const uint8_t TOTAL_BOTOES = sizeof(PINOS_BOTOES) / sizeof(PINOS_BOTOES[0]);

const uint8_t PINO_LED = 13;               // também acende o LED da própria placa
const uint8_t PASTA_AUDIOS = 1;            // pasta /01 do cartão
const uint8_t VOLUME = 22;                 // 0 (mudo) a 30 (máximo)
const unsigned long DEBOUNCE_MS = 50;      // tempo de estabilização da leitura
const unsigned long LED_ACESO_MS = 2000;   // confirmação visual após cada acionamento

struct Botao {
  uint8_t estado;            // estado estável confirmado (depois do debounce)
  uint8_t ultimaLeitura;     // última leitura crua (pode estar "chiando")
  unsigned long ultimaMudanca;
};

Botao botoes[TOTAL_BOTOES];
unsigned long ledAcesoDesde = 0;
bool ledAceso = false;

void tocarFrase(uint8_t numero) {
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

void setup() {
  Serial.begin(9600);
  moduloMP3.begin(9600);

  pinMode(PINO_LED, OUTPUT);
  for (uint8_t i = 0; i < TOTAL_BOTOES; i++) {
    pinMode(PINOS_BOTOES[i], INPUT_PULLUP);   // botão ligado entre o pino e o GND
    botoes[i] = {HIGH, HIGH, 0};
  }

  // isACK = false: necessário para módulos clone que não respondem ACK
  // corretamente, o que travava o begin() esperando confirmação que nunca chegava.
  if (!mp3.begin(moduloMP3, /*isACK=*/false, /*doReset=*/true)) {
    sinalizarErroFatal();
  }

  mp3.volume(VOLUME);
  Serial.println(F("FalaPlaca pronta!"));
}

void loop() {
  unsigned long agora = millis();

  for (uint8_t i = 0; i < TOTAL_BOTOES; i++) {
    Botao &b = botoes[i];
    uint8_t leitura = digitalRead(PINOS_BOTOES[i]);

    if (leitura != b.ultimaLeitura) {
      b.ultimaMudanca = agora;   // leitura mudou: reinicia o timer de estabilização
      b.ultimaLeitura = leitura;
    }

    // só aceita a leitura depois que ela ficou estável por DEBOUNCE_MS
    if ((agora - b.ultimaMudanca) > DEBOUNCE_MS && leitura != b.estado) {
      b.estado = leitura;
      if (b.estado == LOW) {     // dispara só ao pressionar, não ao soltar
        tocarFrase(i + 1);
      }
    }
  }

  if (ledAceso && (agora - ledAcesoDesde) >= LED_ACESO_MS) {
    digitalWrite(PINO_LED, LOW);
    ledAceso = false;
  }
}
