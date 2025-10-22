#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <BH1750.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_MPU6050.h>  // ← Librería Adafruit para acelerómetro

// ================== CONFIG PANTALLA OLED ==================
#define ANCHO_PANTALLA 128
#define ALTO_PANTALLA 64
#define OLED_RESET -1
#define SDA_OLED 17
#define SCL_OLED 16
TwoWire WireOLED = TwoWire(1);  // Segundo bus para OLED
Adafruit_SSD1306 display(ANCHO_PANTALLA, ALTO_PANTALLA, &WireOLED, OLED_RESET);

// ================== CONFIG WIFI ==================
const char* ssid = "ANDREA";
const char* password = "Morales2609";

// ================== CONFIG MQTT ==================
const char* mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;
const char* clientID = "esp32_meteo_01";

WiFiClient espClient;
PubSubClient client(espClient);

// ================== SENSORES ==================
#define SDA_SENSORES 21
#define SCL_SENSORES 22
#define SOIL_PIN 34

TwoWire WireSensores = TwoWire(0);  // Bus I2C principal para sensores
Adafruit_BME280 bme;                // Sensor BME280
BH1750 lightMeter;                  // Sensor BH1750
Adafruit_MPU6050 mpu;               // Sensor MPU6050

int soilValue = 0;
float magnitud = 0;  // ← Variable global para mostrar en OLED

// ================== FUNCIONES ==================
void mostrarMensajeConexion(const char* mensaje) {
  display.clearDisplay();
  display.fillRect(0, 0, 128, 16, SSD1306_WHITE);
  display.setTextSize(1);
  display.setTextColor(SSD1306_BLACK);
  display.setCursor(2, 4);
  display.print(mensaje);
  display.display();
}

void setup_wifi() {
  Serial.println();
  Serial.print("Conectando a ");
  Serial.println(ssid);
  mostrarMensajeConexion("Conectando WiFi...");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi conectado");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Conectando MQTT...");
    mostrarMensajeConexion("Conectando MQTT...");

    if (client.connect(clientID)) {
      Serial.println("Conectado!");
      mostrarMensajeConexion("MQTT Conectado!");
      delay(500);
    } else {
      Serial.print("Falló, rc=");
      Serial.print(client.state());
      Serial.println(" intentando en 5s");
      delay(5000);
    }
  }
}

void mostrarEnPantalla(String errores, float temp, float hum, float lux, float altitud, float vibracion) {
  display.clearDisplay();

  // Franja amarilla (parte superior)
  display.fillRect(0, 0, 128, 16, SSD1306_WHITE);
  display.setTextSize(1);
  display.setTextColor(SSD1306_BLACK);
  display.setCursor(2, 4);
  if (temp > 100.0) {
    display.print("BME: Algo esta mal");
  } else if (errores.length() > 0) {
    display.print(errores);
  } else {
    display.print("Sensores OK");
  }

  // Zona inferior (lecturas)
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 20);
  display.printf("Temp: %.2f C\n", temp);
  display.printf("Hum:  %.2f %%\n", hum);
  display.printf("Lux:  %.2f lx\n", lux);
  display.printf("Alt:  %.2f m\n", altitud);
  display.printf("Vib:  %.3f g\n", vibracion);  // ← NUEVO: vibración en g

  display.display();
}

void setup() {
  Serial.begin(115200);

  // Iniciar buses I2C
  WireSensores.begin(SDA_SENSORES, SCL_SENSORES, 100000);
  WireOLED.begin(SDA_OLED, SCL_OLED, 100000);

  // OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("No se encontró la pantalla OLED"));
    while (1);
  }
  display.clearDisplay();
  display.display();

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);

  String errores = "";

  // BME280
  if (!bme.begin(0x76, &WireSensores)) {
    errores += "BME ";
    Serial.println("No se encontró BME280!");
  }

  // BH1750
  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &WireSensores)) {
    errores += "BH1750 ";
    Serial.println("No se encontró BH1750!");
  }

  // MPU6050
  if (!mpu.begin(0x68, &WireSensores)) {
    errores += "MPU6050 ";
    Serial.println("No se encontró MPU6050!");
  } else {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    Serial.println("MPU6050 inicializado correctamente");
  }

  mostrarEnPantalla(errores, 0, 0, 0, 0, 0);
  delay(2000);
  Serial.println("Sensores inicializados correctamente");
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  String errores = "";

  // ================== Lectura de sensores ==================
  float temperatura = bme.readTemperature();
  if (isnan(temperatura)) { errores += "BME "; temperatura = 0; }

  float humedad = bme.readHumidity();
  if (isnan(humedad)) { errores += "BME "; humedad = 0; }

  float presion = bme.readPressure() / 100.0F;
  if (isnan(presion)) { errores += "BME "; presion = 0; }

  float altitud = bme.readAltitude(1013.25);

  float lux = lightMeter.readLightLevel();
  if (lux < 0) { errores += "BH1750 "; lux = 0; }

  soilValue = analogRead(SOIL_PIN);
  int humedadSuelo = map(soilValue, 4095, 0, 0, 100);

  // ================== MPU6050: Lectura de aceleración ==================
  sensors_event_t a, g, temp_event;
  mpu.getEvent(&a, &g, &temp_event);

  magnitud = sqrt(a.acceleration.x * a.acceleration.x +
                  a.acceleration.y * a.acceleration.y +
                  a.acceleration.z * a.acceleration.z) / 9.81;  // en g

  // ================== Publicar MQTT ==================
  char buffer[16];
  dtostrf(temperatura, 6, 2, buffer); client.publish("clima/temperatura", buffer);
  dtostrf(humedad, 6, 2, buffer); client.publish("clima/humedad", buffer);
  dtostrf(presion, 6, 2, buffer); client.publish("clima/presion", buffer);
  dtostrf(lux, 6, 2, buffer); client.publish("clima/lux", buffer);
  dtostrf(humedadSuelo, 6, 2, buffer); client.publish("clima/humedad_suelo", buffer);
  dtostrf(altitud, 6, 2, buffer); client.publish("clima/altitud", buffer);
  dtostrf(magnitud, 6, 3, buffer); client.publish("clima/vibracion", buffer);  // ← MQTT vibración

  // ================== Debug serial ==================
  Serial.println("==== Lecturas ====");
  Serial.printf("Temp: %.2f °C\n", temperatura);
  Serial.printf("Hum:  %.2f %%\n", humedad);
  Serial.printf("Pres: %.2f hPa\n", presion);
  Serial.printf("Alt:  %.2f m\n", altitud);
  Serial.printf("Lux:  %.2f lx\n", lux);
  Serial.printf("H. suelo: %d %%\n", humedadSuelo);
  Serial.printf("Vibracion: %.3f g\n", magnitud);
  Serial.println("=================");

  // ================== OLED ==================
  mostrarEnPantalla(errores, temperatura, humedad, lux, altitud, magnitud);

  delay(100);
}
