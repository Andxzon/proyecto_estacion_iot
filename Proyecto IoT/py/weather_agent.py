import os
import json
from datetime import date, datetime, timedelta
import openai
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import schedule
import time
import threading

# Cargar variables de entorno desde el archivo .env
load_dotenv()

# --- CONFIGURACIÓN ---
HISTORY_FILE_PATH = "../history.txt"
# La clave de API de OpenAI se carga desde el archivo .env
# Asegúrate de tener tu clave de API de OpenAI como una variable de entorno llamada OPENAI_API_KEY

# --- INICIALIZACIÓN DE FLASK ---
app = Flask(__name__)
CORS(app)  # Habilita CORS para permitir peticiones desde el frontend

# --- FUNCIONES MODULARES (sin cambios) ---

def read_history_file(file_path: str) -> str | None:
    print(f"Leyendo datos de '{file_path}'...")
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            if not content.strip():
                print("Advertencia: El archivo de historial está vacío.")
                return None
            return content
    except FileNotFoundError:
        print(f"Error: No se encontró el archivo '{file_path}'.")
        return None
    except Exception as e:
        print(f"Error inesperado al leer el archivo: {e}")
        return None

def analyze_data_with_llm(data: str) -> dict | None:
    print("Enviando datos al LLM para análisis...")
    prompt = f'''
    Analiza los siguientes datos meteorológicos de las últimas 24 horas. Cada línea contiene una marca de tiempo en formato ISO (UTC).

    Datos:
    ---
    {data}
    ---

    Tu tarea es generar un informe en formato JSON que contenga:
    1.  `fecha`: La fecha de hoy en formato YYYY-MM-DD (zona horaria UTC).
    2.  `resumen`: Un texto corto y legible que describa el clima del día.
    3.  `condicion_general`: Una única palabra que resuma la condición climática del día (ej. "Dia Soleado", "Dia Lluvioso", "Dia Nublado", "Dia Parcialmente Nublado").
    4.  `variables`: Un objeto con una entrada para "temperatura", "presion", "humedad_relativa", "luminosidad", "humedad_suelo" y "vibracion". Para cada variable, calcula:
        - `promedio`: El valor medio.
        - `max`: El valor máximo.
        - `min`: El valor mínimo.
        - `tendencia`: Describe si la tendencia general fue "en aumento", "en descenso" o "estable".
    5.  `anomalias`: Una lista de strings describiendo cualquier cambio brusco o evento inusual (ej. "Caída abrupta de luminosidad a las 18:01").
    6.  `observaciones`: Una interpretación final sobre las condiciones generales (ej. "Condiciones favorables para precipitaciones nocturnas.").

    Responde únicamente con el objeto JSON, sin texto adicional.
    '''
    try:
        print("Enviando solicitud a la API de OpenAI...")
        # La API Key se lee automáticamente de la variable de entorno OPENAI_AI_KEY
        client = openai.OpenAI()
        response = client.chat.completions.create(
            model="gpt-5-mini",
            messages=[
                {"role": "system", "content": "Eres un experto meteorólogo que responde en formato JSON."},
                {"role": "user", "content": prompt}
            ],
        )
        analysis_json = response.choices[0].message.content
        return json.loads(analysis_json)
    except Exception as e:
        print(f"Error al contactar o procesar la respuesta del LLM: {e}")
        return None

def generate_report_file(analysis: dict):
    # Get the current date in UTC-5 timezone
    utc_minus_5 = datetime.utcnow() + timedelta(hours=-5)
    report_date = utc_minus_5.strftime('%Y-%m-%d')

    if not os.path.exists('../reports'):
        os.makedirs('../reports')
    file_name = f"../reports/informe_{report_date}.json"
    print(f"Generando archivo de informe '{file_name}'...")
    try:
        # Also update the 'fecha' field in the analysis data
        analysis['fecha'] = report_date
        with open(file_name, 'w', encoding='utf-8') as f:
            json.dump(analysis, f, ensure_ascii=False, indent=4)
        print(f"Informe '{file_name}' generado con éxito.")
    except Exception as e:
        print(f"Error al generar el archivo de informe: {e}")

def reset_history_file(file_path: str):
    print(f"Reiniciando el archivo de historial '{file_path}'...")
    try:
        with open(file_path, 'w') as f:
            pass
        print("Archivo de historial reiniciado.")
    except Exception as e:
        print(f"Error al reiniciar el archivo de historial: {e}")

# --- LÓGICA CENTRAL Y PROGRAMACIÓN ---

def run_report_generation():
    """
    Ejecuta el flujo completo de generación de informes.
    """
    print("\n--- Iniciando generación de informe programada ---")
    
    history_data = read_history_file(HISTORY_FILE_PATH)
    
    if not history_data:
        print("Error: No se pudieron leer los datos del historial.")
        return

    analysis_result = analyze_data_with_llm(history_data)
    
    if not analysis_result:
        print("Error: No se pudo obtener el análisis del LLM.")
        return

    generate_report_file(analysis_result)
    
    # Opcional: Reiniciar el archivo de historial después de un informe exitoso
    # reset_history_file(HISTORY_FILE_PATH)
    
    print("--- Generación de informe programada completada. ---")
    return analysis_result

def run_scheduler():
    """
    Bucle infinito para ejecutar tareas programadas.
    """
    print("Iniciando el programador de tareas...")
    while True:
        schedule.run_pending()
        time.sleep(60)  # Comprueba cada 60 segundos

# --- ENDPOINTS DE LA API ---

@app.route('/generate-report', methods=['POST'])
def handle_generate_report():
    """
    Endpoint para solicitar manualmente la generación de un informe.
    """
    print("\n--- Petición recibida en /generate-report ---")
    analysis_result = run_report_generation()
    
    if analysis_result:
        print("--- Proceso completado. Enviando informe al frontend. ---")
        return jsonify(analysis_result)
    else:
        return jsonify({"error": "No se pudo generar el informe."}), 500

# --- EJECUCIÓN DEL SERVIDOR ---

if __name__ == '__main__':
    # Programar la tarea para que se ejecute todos los días a las 00:00
    schedule.every().day.at("00:00").do(run_report_generation)
    print("Tarea de generación de informes programada para ejecutarse todos los días a las 00:00.")

    # Iniciar el programador en un hilo separado para que no bloquee Flask
    scheduler_thread = threading.Thread(target=run_scheduler)
    scheduler_thread.daemon = True  # El hilo se cerrará cuando el programa principal termine
    scheduler_thread.start()

    # Iniciar el servidor Flask
    print("Iniciando servidor Flask en http://127.0.0.1:5000")
    print("Presiona CTRL+C para detener el servidor.")
    # Se deshabilita el modo debug para evitar que el programador se ejecute dos veces
    app.run(host='0.0.0.0', port=5000, debug=False)
