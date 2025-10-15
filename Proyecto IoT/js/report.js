document.addEventListener('DOMContentLoaded', () => {
    const reportsContainer = document.getElementById('reports-container');

    // Función para obtener la fecha en formato YYYY-MM-DD
    const getFormattedDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Cargar los informes de los últimos 7 días
    for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const formattedDate = getFormattedDate(date);
        const reportPath = `reports/informe_${formattedDate}.json`;

        fetch(reportPath)
            .then(response => {
                if (!response.ok) {
                    throw new Error('No encontrado');
                }
                return response.json();
            })
            .then(data => {
                const reportElement = createReportElement(data, formattedDate);
                reportsContainer.appendChild(reportElement);
            })
            .catch(() => {
                const noReportElement = createNoReportElement(formattedDate);
                reportsContainer.appendChild(noReportElement);
            });
    }

    // Función para crear el HTML de un informe encontrado
    const createReportElement = (data, date) => {
        const div = document.createElement('div');
        div.className = 'report-item';
        div.innerHTML = `
            <h2>Informe del ${date}</h2>
            <h3>Condición General</h3>
            <p>${data.condicion_general || 'No disponible.'}</p>
            <h3>Resumen del Día</h3>
            <p>${data.resumen || 'No disponible.'}</p>
            <h3>Anomalías Detectadas</h3>
            <ul>
                ${data.anomalias && data.anomalias.length > 0 ? 
                    data.anomalias.map(item => `<li>${item}</li>`).join('') : 
                    '<li>No se detectaron anomalías.</li>'
                }
            </ul>
            <h3>Observaciones</h3>
            <p>${data.observaciones || 'No disponible.'}</p>
        `;
        return div;
    };

    // Función para crear el HTML de un informe no encontrado
    const createNoReportElement = (date) => {
        const div = document.createElement('div');
        div.className = 'report-item not-found';
        div.innerHTML = `<h2>Informe del ${date}</h2><p>No se encontró el informe para este día.</p>`;
        return div;
    };
});