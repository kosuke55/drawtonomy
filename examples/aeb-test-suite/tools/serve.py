#!/usr/bin/env python3
"""Serve the repository root at http://localhost:8765/ (CORS * on every response).

  python3 tools/serve.py [--port 8765]

Lets drawtonomy (another origin) fetch xosc / xodr / csv via ?open=http://localhost:8765/testcases/...

GET /__files.json returns every file path in the repository ('/'-separated, logs included).
drawtonomy uses it for ?tests=http://localhost:8765/.
"""
import argparse
import functools
import http.server
import json
import os
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FILE_LIST = '/__files.json'
SKIP_DIRS = {'.git', '__pycache__', 'node_modules', '.venv'}


def list_files(root):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for f in filenames:
            if f == '.DS_Store':
                continue
            out.append(os.path.relpath(os.path.join(dirpath, f), root).replace(os.sep, '/'))
    return sorted(out)


class CORSHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.xosc': 'application/xml', '.xodr': 'application/xml', '.svg': 'image/svg+xml',
        '.csv': 'text/csv', '.json': 'application/json', '.js': 'text/javascript',
        '.yaml': 'text/yaml', '.md': 'text/markdown',
    }

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?', 1)[0] == FILE_LIST:
            body = json.dumps(list_files(self.directory), ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--bind', default='127.0.0.1')
    a = ap.parse_args()
    handler = functools.partial(CORSHandler, directory=str(REPO))
    with http.server.ThreadingHTTPServer((a.bind, a.port), handler) as httpd:
        print(f'serving {REPO} at http://localhost:{a.port}/')
        httpd.serve_forever()


if __name__ == '__main__':
    main()
