import serial
import requests
import time
import json

# Configuration
SERIAL_PORT = 'COM5'  # Update to your ESP32's COM port
BAUD_RATE = 115200
VERCEL_API_URL = 'https://iot-weather-phi.vercel.app/api/ingest' # Update this

try:
    # Open the serial port
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    print(f"Listening on {SERIAL_PORT}...")
except Exception as e:
    print(f"Failed to connect to {SERIAL_PORT}: {e}")
    exit()

while True:
    try:
        if ser.in_waiting > 0:
            # Read a line from the ESP32
            line = ser.readline().decode('utf-8').strip()
            
            # Check if it looks like our JSON payload
            if line.startswith('{') and line.endswith('}'):
                data = json.loads(line)
                print(f"Received from ESP32: {data}")
                
                # Forward the JSON payload to Vercel
                response = requests.post(VERCEL_API_URL, json=data)
                print(f"Vercel Response: {response.status_code}")
                
    except json.JSONDecodeError:
        pass # Ignore malformed serial lines (like ESP32 boot text)
    except Exception as e:
        print(f"Error sending to Vercel: {e}")
        time.sleep(2) # Wait briefly before continuing