#!/usr/bin/env python3
"""The Nano probe's study server (references/selection.md). 127.0.0.1 only.

  python3 -I .claude/skills/language-cycle/scripts/selection-server.py \
      --dir <cycle>/selection/nano

GET /               the batches and how many of each are answered
GET /run/<name>     the page the probe runs on, with its status
GET /batch/<name>   batches/<name>.json
GET, POST /result/<name>   results/<name>.json (only for a batch that exists)
Serves and writes nothing else. A page of another site cannot post: the Host must be
this server's and the body JSON, which such a page may not send without a preflight.
"""
import argparse
import html
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8766
NAME = re.compile(r"^[a-z0-9-]+$")
MAX_BODY = 20_000_000

p = argparse.ArgumentParser()
p.add_argument("--dir", required=True)
ROOT = os.path.abspath(p.parse_args().dir)


def file_of(folder, name):
    return os.path.join(ROOT, folder, f"{name}.json")


def index():
    rows = []
    folder = os.path.join(ROOT, "batches")
    for file in sorted(os.listdir(folder)):
        name = file.removesuffix(".json")
        if not file.endswith(".json") or not NAME.match(name):
            continue
        with open(file_of("batches", name), encoding="utf-8") as f:
            asked = len(json.load(f)["items"])
        answered = 0
        if os.path.exists(file_of("results", name)):
            with open(file_of("results", name), encoding="utf-8") as f:
                answered = sum("answer" in r for r in json.load(f)["results"])
        rows.append(f'<li><a href="/run/{name}">{name}</a> {answered} of {asked}</li>')
    return "<!doctype html><meta charset=utf-8><title>selection batches</title><ul>" + "".join(rows) + "</ul>"


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, body=b"", kind="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def route(self):
        if self.headers.get("Host") != f"127.0.0.1:{PORT}":
            return None
        parts = self.path.strip("/").split("/")
        if parts == [""]:
            return "index", ""
        if len(parts) != 2 or not NAME.match(parts[1]):
            return None
        if not os.path.exists(file_of("batches", parts[1])):
            return None
        return parts[0], parts[1]

    def do_GET(self):
        route = self.route()
        if not route:
            return self.reply(404)
        what, name = route
        if what == "index":
            return self.reply(200, index().encode(), "text/html; charset=utf-8")
        if what == "run":
            page = (
                f"<!doctype html><meta charset=utf-8><title>{name}</title><h1>{html.escape(name)}</h1>"
                '<pre id="langle-probe">no probe: load the probe build, then reload</pre>'
            )
            return self.reply(200, page.encode(), "text/html; charset=utf-8")
        folder = {"batch": "batches", "result": "results"}.get(what)
        if not folder or not os.path.exists(file_of(folder, name)):
            return self.reply(404)
        with open(file_of(folder, name), "rb") as f:
            return self.reply(200, f.read())

    def do_POST(self):
        route = self.route()
        if not route or route[0] != "result":
            return self.reply(404)
        if self.headers.get("Content-Type") != "application/json":
            return self.reply(415)
        size = int(self.headers.get("Content-Length") or 0)
        if not 0 < size <= MAX_BODY:
            return self.reply(413)
        body = self.rfile.read(size)
        try:
            if json.loads(body)["name"] != route[1]:
                return self.reply(400)
        except (ValueError, KeyError, TypeError):
            return self.reply(400)
        os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
        path = file_of("results", route[1])
        with open(f"{path}.part", "wb") as f:
            f.write(body)
        os.replace(f"{path}.part", path)
        return self.reply(200, b'{"ok":true}')

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
print(f"http://127.0.0.1:{PORT}/ over {ROOT}", flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
