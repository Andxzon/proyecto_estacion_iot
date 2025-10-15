import http.server
import socketserver
import json
import datetime
import os

PORT = 8001

class ReportHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/report':
            try:
                # Get today's date to build the filename
                today = datetime.date.today().strftime('%Y-%m-%d')
                filename = os.path.join('..\', 'reports', f'informe_{today}.json')

                with open(filename, 'r') as f:
                    data = json.load(f)

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*') # Allow requests from any origin
                self.end_headers()
                self.wfile.write(json.dumps(data).encode())
            except FileNotFoundError:
                self.send_response(404)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Report not found for today"}).encode())
        else:
            # Serve files from the current directory
            super().do_GET()

# Change to the script's directory to serve files correctly
os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer(("", PORT), ReportHandler) as httpd:
    print(f"Serving at port {PORT}")
    httpd.serve_forever()
