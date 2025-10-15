// ---------------- CONFIG ----------------
const WINDOW_MINUTES = 10;       // ventana de 10 minutos
const now = () => Date.now();

// Definición de sensores y sus topics MQTT
const SENSORS = [
  { id: 'tempChart',  label: 'Temperatura',    unit: '°C',   topic: 'clima/temperatura',    suggestedMin: 10,  suggestedMax: 50,   color: 'rgba(255,99,71,0.95)' },
  { id: 'presChart',  label: 'Presión',        unit: 'hPa',  topic: 'clima/presion',        suggestedMin: 0,   suggestedMax: 1100, color: 'rgba(54,162,235,0.95)' },
  { id: 'humChart',   label: 'Humedad',        unit: '%',    topic: 'clima/humedad',        suggestedMin: 0,   suggestedMax: 85,  color: 'rgba(75,192,192,0.95)' },
  { id: 'soilChart',  label: 'Humedad suelo',  unit: '%',    topic: 'clima/humedad_suelo',  suggestedMin: 0,   suggestedMax: 100,  color: 'rgba(153,102,255,0.95)' },
  { id: 'lightChart', label: 'Luz',            unit: 'lux',  topic: 'clima/luz',            suggestedMin: 0,   suggestedMax: 5000, color: 'rgba(255,206,86,0.95)' }
];

const charts = {}; // guardará instancias de Chart.js

// ---------------- Funciones de almacenamiento ----------------
function saveData(sensorId, dataset) {
  localStorage.setItem(sensorId, JSON.stringify(dataset));
}

function loadData(sensorId) {
  const raw = localStorage.getItem(sensorId);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ---------------- Inicializar gráficas ----------------
SENSORS.forEach(sensor => {
  const ctx = document.getElementById(sensor.id).getContext('2d');

  const cfg = {
    type: 'line',
    data: {
      datasets: [{
        label: `${sensor.label} (${sensor.unit})`,
        data: loadData(sensor.id), // ← cargamos los datos guardados
        tension: 0.3,
        borderColor: sensor.color,
        backgroundColor: sensor.color.replace('0.95', '0.12') || 'rgba(0,0,0,0.08)',
        pointRadius: 0,
        fill: true,
      }]
    },
    options: {
      maintainAspectRatio: false,
      animation: false,
      plugins: { 
        legend: { display: true, labels: { color: "white" } },
        title: {
          display: true,
          text: sensor.label,
          color: "white",
          font: { size: 14 }
        }

    },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'minute', displayFormats: { minute: 'HH:mm:ss' } },
          ticks: { maxTicksLimit: 6 },
          grid: { color: 'rgba(255,255,255,0.03)' }
        },
        y: {
          min: sensor.suggestedMin,
          max: sensor.suggestedMax,
          grid: { color: 'rgba(255,255,255,0.03)' }
        }
      }
    }
  };

  charts[sensor.id] = new Chart(ctx, cfg);
});

// ---------------- Conexión MQTT ----------------
const client = mqtt.connect("ws://broker.emqx.io:8083/mqtt");

client.on("connect", () => {
  console.log("✅ Conectado al broker MQTT");
  // Suscribirse a todos los topics de sensores
  SENSORS.forEach(sensor => client.subscribe(sensor.topic));
});

client.on("message", (topic, message) => {
  const value = parseFloat(message.toString());
  const t = Date.now();
  const windowStart = t - WINDOW_MINUTES * 60 * 1000;

  // Buscar el sensor asociado al topic
  const sensor = SENSORS.find(s => s.topic === topic);
  if (!sensor) return;

  const chart = charts[sensor.id];
  const dataset = chart.data.datasets[0].data;

  // Añadir nuevo dato
  dataset.push({ x: t, y: value });

  // Eliminar puntos fuera de la ventana
  while (dataset.length && dataset[0].x < windowStart) dataset.shift();

  // Limitar a 300 puntos máximo
  const MAX_POINTS = 300;
  if (dataset.length > MAX_POINTS) {
  dataset.splice(0, dataset.length - MAX_POINTS);
  }

  // Refrescar gráfico
  chart.update('none');
  
  // Guardar en cache/localStorage
  saveData(sensor.id, dataset);
});

// ---------------- INFORME INTELIGENTE ----------------

document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-new-report-btn');
    const reportLoader = document.getElementById('report-loader');
    const reportError = document.getElementById('report-error');

    async function fetchAndShowReport(url, options, button) {
        console.log('Loading report...');
        reportLoader.style.display = 'block';
        reportError.style.display = 'none';
        button.disabled = true;
        const originalButtonText = button.textContent;
        button.textContent = 'Cargando...';

        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error del servidor: ${response.status}`);
            }
            const data = await response.json();
            
            // Guardar en localStorage y abrir nueva pestaña
            localStorage.setItem('reportData', JSON.stringify(data));
            window.open('report.html', '_blank');

        } catch (error) {
            console.error("Error al cargar el informe:", error);
            reportError.textContent = `Error: ${error.message}. Asegúrate de que el servidor de Python esté en ejecución.`;
            reportError.style.display = 'block';
        } finally {
            reportLoader.style.display = 'none';
            button.disabled = false;
            button.textContent = originalButtonText;
        }
    }

    generateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fetchAndShowReport('http://127.0.0.1:5000/generate-report', { method: 'POST' }, generateBtn);
    });
});

// ---------------- SUSCRIPCIÓN Y NOTIFICACIONES ----------------
let notificationInterval;

function checkSubscriptionStatus() {
    const subscribeBtn = document.getElementById('subscribe-btn');
    if (localStorage.getItem('isSubscribed') === 'true') {
        subscribeBtn.textContent = 'Suscrito';
        startNotifications();
    }
}

function toggleSubscription() {
    const subscribeBtn = document.getElementById('subscribe-btn');
    if (localStorage.getItem('isSubscribed') === 'true') {
        localStorage.setItem('isSubscribed', 'false');
        subscribeBtn.textContent = 'Suscribirse';
        stopNotifications();
    } else {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                localStorage.setItem('isSubscribed', 'true');
                subscribeBtn.textContent = 'Suscrito';
                startNotifications();
            }
        });
    }
}

function startNotifications() {
    sendNotification();
    notificationInterval = setInterval(sendNotification, 10000); // 1 hora
}

function stopNotifications() {
    clearInterval(notificationInterval);
}

async function sendNotification() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const reportFile = `reports/informe_${year}-${month}-${day}.json`;

    try {
        const response = await fetch(reportFile);
        if (!response.ok) {
            throw new Error('No se pudo obtener el informe de hoy.');
        }
        const report = await response.json();
        
        const temp = report.variables.temperatura.promedio.toFixed(1);
        const hum = report.variables.humedad_relativa.promedio.toFixed(1);
        const summary = report.resumen.replace(/<br>/g, ' ');

        const notification = new Notification('Reporte Meteorológico', {
            body: `Temperatura: ${temp}°C, Humedad: ${hum}%. ${summary}`,
            icon: 'images/logo_noti.png' 
        });
    } catch (error) {
        console.error('Error al enviar la notificación:', error);
    }
}

document.addEventListener('DOMContentLoaded', checkSubscriptionStatus);
document.getElementById('subscribe-btn').addEventListener('click', toggleSubscription);