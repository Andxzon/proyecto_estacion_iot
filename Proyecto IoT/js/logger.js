const mqtt = require('mqtt');
const fs = require('fs');

// --- MODO DE RESETEO ---
// Revisa si el script fue ejecutado con el argumento --reset
const args = process.argv.slice(2);
if (args.includes('--reset')) {
  try {
    // Intenta borrar el archivo history.txt
    fs.unlinkSync('history.txt');
    console.log('✅ history.txt ha sido reiniciado.');
  } catch (err) {
    // Si el archivo no existe, no es un error, así que lo ignoramos.
    // Si es otro error, lo mostramos.
    if (err.code !== 'ENOENT') console.error('Error al reiniciar history.txt:', err);
  }
}

const SENSORS = [
  { id: 'tempChart',  label: 'Temperatura',    unit: '°C',   topic: 'clima/temperatura' },
  { id: 'presChart',  label: 'Presión',        unit: 'hPa',  topic: 'clima/presion' },
  { id: 'humChart',   label: 'Humedad',        unit: '%',    topic: 'clima/humedad' },
  { id: 'soilChart',  label: 'Humedad suelo',  unit: '%',    topic: 'clima/humedad_suelo' },
  { id: 'lightChart', label: 'Luz',            unit: 'lux',  topic: 'clima/lux' }
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

function getTimestampGmtMinus5() {
    const now = new Date();
    // Create a date object for a timezone 5 hours behind UTC
    const dateInGmtMinus5 = new Date(now.valueOf() - 5 * 60 * 60 * 1000);

    const year = dateInGmtMinus5.getUTCFullYear();
    const month = String(dateInGmtMinus5.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateInGmtMinus5.getUTCDate()).padStart(2, '0');
    const hours = String(dateInGmtMinus5.getUTCHours()).padStart(2, '0');
    const minutes = String(dateInGmtMinus5.getUTCMinutes()).padStart(2, '0');
    const seconds = String(dateInGmtMinus5.getUTCSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-05:00`;
}

function saveData() {
  const timestamp = getTimestampGmtMinus5();
  let dataString = `${timestamp}:\n`;
  SENSORS.forEach(sensor => {
    const value = lastValues[sensor.label];
    if (value !== undefined) {
      dataString += `  ${sensor.label}: ${value} ${sensor.unit}\n`;
    }
  });
  dataString += '\n';

  fs.appendFile('history.txt', dataString, (err) => {
    if (err) {
      console.error("Error escribiendo en history.txt", err);
    } else {
      console.log("Datos guardados en history.txt");
    }
  });
}

// Guardar datos cada 5 min
setInterval(saveData, 1000);

console.log("Logger iniciado. Guardando datos cada 5 minutos en history.txt");