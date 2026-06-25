#!/usr/bin/env python3
"""Tiny static dev server that disables caching, so edits to CSS/JS/JSON/images
always show up on reload. Usage: python scripts/serve.py [port]"""
import sys, os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4321

class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *a):
        pass  # quiet

if __name__ == "__main__":
    print(f"Serving {ROOT} at http://localhost:{PORT}  (no-cache, threaded)")
    ThreadingHTTPServer(("0.0.0.0", PORT), NoCacheHandler).serve_forever()
