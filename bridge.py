import serial
import requests
import time
import json

# Configuration
SERIAL_PORT = 'COM5'  # Update to your ESP32's COM port
BAUD_RATE = 115200
VERCEL_API_URL = 'https://iot-weather-phi.vercel.app/api/ingest'
API_KEY = 'local-device-token'  # Provided by your friend

headers = {
    "x-device-token": API_KEY,
    "Content-Type": "application/json"
}

try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    print(f"Listening on {SERIAL_PORT}...")
except Exception as e:
    print(f"Failed to connect to {SERIAL_PORT}: {e}")
    exit()

while True:
    try:
        if ser.in_waiting > 0:
            line = ser.readline().decode('utf-8').strip()
            
            if line.startswith('{') and line.endswith('}'):
                raw_data = json.loads(line)
                
                # Safely parse and cast types to match the exact runbook specification
                rain_pct = int(raw_data.get("rain_percent", 0))
                
                mapped_data = {
                    "temperature_c": float(raw_data.get("temperature", 0.0)),
                    "humidity_pct": float(raw_data.get("humidity", 0.0)),
                    "pressure_hpa": float(raw_data.get("pressure", 1013.25)),
                    "rain_pct": rain_pct,
                    "is_wet": bool(rain_pct > 35)
                }
                
                print(f"Forwarding to Vercel: {mapped_data}")
                
                response = requests.post(VERCEL_API_URL, json=mapped_data, headers=headers)
                print(f"Vercel Response: {response.status_code} - {response.text}")
                
    except json.JSONDecodeError:
        pass 
    except Exception as e:
        print(f"Error sending to Vercel: {e}")
        time.sleep(2)