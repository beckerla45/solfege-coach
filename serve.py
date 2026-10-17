"""Serve Solfège Coach on http://localhost and open it in the browser.

Browsers only allow microphone access on secure origins, and localhost counts.
"""
import http.server
import os
import webbrowser

PORT = 8123

os.chdir(os.path.dirname(os.path.abspath(__file__)))
Handler = http.server.SimpleHTTPRequestHandler
# Windows' registry sometimes maps .js to text/plain, which breaks ES modules.
Handler.extensions_map.update({".js": "text/javascript", ".css": "text/css"})

with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
    url = f"http://localhost:{PORT}/"
    print(f"Solfège Coach running at {url}  (Ctrl+C to stop)")
    webbrowser.open(url)
    httpd.serve_forever()
