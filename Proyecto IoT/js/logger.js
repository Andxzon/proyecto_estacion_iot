const mqtt = require('mqtt');
const fs = require('fs');

const SENSORS = [
  { id: 'tempChart',  label: 'Temperatura',    unit: '°C',   topic: 'clima/temperatura' },
  { id: 'presChart',  label: 'Presión',        unit: 'hPa',  topic: 'clima/presion' },
  { id: 'humChart',   label: 'Humedad',        unit: '%',    topic: 'clima/humedad' },
  { id: 'soilChart',  label: 'Humedad suelo',  unit: '%',    topic: 'clima/humedad_suelo' },
  { id: 'lightChart', label: 'Luz',            unit: 'lux',  topic: 'clima/luz' }
];

const lastValues = {};

const client = mqtt.connect("ws://broker.emqx.io:8083/mqtt");

client.on("connect", () => {
  console.log("✅ Conectado al broker MQTT para logging");
  SENSORS.forEach(sensor => client.subscribe(sensor.topic));
});

client.on("message", (topic, message) => {
  const value = parseFloat(message.toString());
  const sensor = SENSORS.find(s => s.topic === topic);
  if (sensor) {
    lastValues[sensor.label] = value;
  }
});

function saveData() {
  const timestamp = new Date().toISOString();
  let dataString = `${timestamp}:
`;
  for (const label in lastValues) {
    const sensor = SENSORS.find(s => s.label === label);
    dataString += `  ${label}: ${lastValues[label]} ${sensor.unit}
`;
  }
  dataString += '\n';

  fs.appendFile('history.txt', dataString, (err) => {
    if (err) {
      console.error("Error escribiendo en history.txt", err);
    } else {
      console.log("Datos guardados en history.txt");
    }
  });
}

// Guardar datos cada 30 minutos
setInterval(saveData, 30 * 60 * 1000);

console.log("Logger iniciado. Guardando datos cada 30 minutos en history.txt");
