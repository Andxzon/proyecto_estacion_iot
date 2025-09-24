#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <BH1750.h>
#include <MPU6050.h>


//toca definir esto porque sino el sensor de lux se pone fastidioso
#define SDA_PIN 21
#define SCL_PIN 22
// ================== CONFIG WIFI ==================
const char* ssid = "ANDREA";       // Cambia por tu WiFi
const char* password = "Morales2609";

// ================== CONFIG MQTT ==================
const char* mqtt_server = "broker.emqx.io";  
const int mqtt_port = 1883; // Puerto TCP
//esta monda es lo que pide el MQTT broker 
const char* clientID = "mqttx_180026b9";

WiFiClient espClient;
PubSubClient client(espClient);

// ================== SENSORES ==================
// BME280
Adafruit_BME280 bme;

// BH1750 (Lux)
BH1750 lightMeter;

// MPU6050
MPU6050 mpu;

// Humedad de suelo
#define SOIL_PIN 34   // Pin analógico del ESP32
int soilValue = 0;

// ================== FUNCIONES ==================
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Conectando a ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi conectado");
  Serial.println("IP: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Conectando MQTT...");
    if (client.connect(clientID)) {
      Serial.println("Conectado!");
    } else {
      Serial.print("Falló, rc=");
      Serial.print(client.state());
      Serial.println(" intentando en 5s");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  Wire.begin(SDA_PIN, SCL_PIN);

  // Inicializar MPU6050
  mpu.initialize();
  if (!mpu.testConnection()) {
    Serial.println("No se encontró MPU6050, revisa conexiones!");
    while (1);
  }


  // Inicializar BME280
  if (!bme.begin(0x76)) {
    Serial.println("No se encontró BME280, revisa conexiones!");
    while (1);
  }

  // Inicializar BH1750
  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("No se encontró BH1750, revisa conexiones!");
    while (1);
  }

  Serial.println("Sensores inicializados correctamente");
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Leer BME280
  float temperatura = bme.readTemperature();
  float humedad = bme.readHumidity();
  float presion = bme.readPressure() / 100.0F;

  // Leer BH1750 (lux)
  float lux = lightMeter.readLightLevel();

  // Leer humedad de suelo
  soilValue = analogRead(SOIL_PIN);
  // Normalizar a porcentaje (0-100%)
  int humedadSuelo = map(soilValue, 4095, 0, 0, 100); 

  // Publicar en MQTT
  char buffer[16];

  dtostrf(temperatura, 6, 2, buffer);
  client.publish("clima/temperatura", buffer);

  dtostrf(humedad, 6, 2, buffer);
  client.publish("clima/humedad", buffer);

  dtostrf(presion, 6, 2, buffer);
  client.publish("clima/presion", buffer);

  dtostrf(lux, 6, 2, buffer);
  client.publish("clima/luz", buffer);

  dtostrf(humedadSuelo, 6, 2, buffer);
  client.publish("clima/humedad_suelo", buffer);

  // Debug Serial
  Serial.print("====Lecturas====");
  Serial.print("Temp: "); Serial.print(temperatura); Serial.println(" °C");
  Serial.print("Hum: "); Serial.print(humedad); Serial.println(" %");
  Serial.print("Pres: "); Serial.print(presion); Serial.println(" hPa");
  Serial.print("Lux: "); Serial.print(lux); Serial.println(" lx");
  Serial.print("Humedad Suelo: "); Serial.print(humedadSuelo); Serial.println(" %");
  
  //-----------------ACELEROMETRO-------------------//
  // Leer acelerómetro (MPU6050)
  int16_t ax, ay, az;
  mpu.getAcceleration(&ax, &ay, &az);

  // Convertir a g
  float axg = ax / 16384.0;
  float ayg = ay / 16384.0;
  float azg = az / 16384.0;

  // Calcular magnitud de aceleración
  float magnitud = sqrt(axg * axg + ayg * ayg + azg * azg);

  // Detectar vibración (umbral configurable)
  bool vibracion = fabs(magnitud - 1.0) > 0.3; // 1.0g es gravedad aprox.

  if (vibracion) {
    client.publish("clima/vibracion", "1");
    Serial.println("Vibración detectada!");
  } else {
    client.publish("clima/vibracion", "0");
  }

  delay(5000);
}