"""Baixador do YouTube do LouvorFlow.

O LouvorFlow (Skip) pede um download, este serviço baixa com o yt-dlp e o LouvorFlow
busca o arquivo pronto para guardar na mídia do culto. Se o YouTube bloquear este
servidor, o LouvorFlow passa o pedido para o computador do Holyrics.

Rotas (todas sob /youtube, atrás do Caddy):
  POST   /youtube/jobs                     {url, format: VIDEO|AUDIO}  -> {job_id, token}
  GET    /youtube/jobs/<id>                estado do pedido
  GET    /youtube/files/<id>/<token>/<nome> o arquivo pronto (só com o token do pedido)
  DELETE /youtube/jobs/<id>                apaga o pedido e o arquivo
As rotas de jobs exigem o cabeçalho x-api-key (YOUTUBE_API_KEY ou WHATSAPP_API_KEY).
"""

import hmac
import json
import os
import queue
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

API_KEY = (os.environ.get("YOUTUBE_API_KEY") or os.environ.get("WHATSAPP_API_KEY") or "").strip()
DATA_DIR = os.environ.get("YT_DIR", "/data")
PORT = int(os.environ.get("PORT", "8090"))
# O campo de arquivo da mídia no LouvorFlow aceita até 100 MB. Maior que isso vai para o PC.
MAX_FILESIZE = os.environ.get("YOUTUBE_MAX_FILESIZE", "95M")
PROXY = (os.environ.get("YOUTUBE_PROXY") or "").strip()
JOB_TIMEOUT = 25 * 60
KEEP_SECONDS = 24 * 3600
UPDATE_EVERY = 24 * 3600

YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}

jobs = {}
jobs_lock = threading.Lock()
work = queue.Queue()
last_update = [0.0]


def video_id(raw):
    text = str(raw or "").strip()
    if not re.match(r"^https?://", text, re.I):
        text = "https://" + text
    try:
        u = urlparse(text)
    except ValueError:
        return None
    host = (u.hostname or "").lower()
    vid = ""
    if host == "youtu.be":
        vid = u.path.strip("/").split("/")[0]
    elif host in YT_HOSTS:
        if u.path == "/watch":
            vid = (parse_qs(u.query).get("v") or [""])[0]
        else:
            m = re.match(r"^/(?:shorts|live|embed|v)/([^/?#]+)", u.path)
            if m:
                vid = m.group(1)
    return vid if YT_ID.match(vid) else None


def explain(stderr):
    s = stderr or ""
    if re.search(r"Sign in to confirm|not a bot|HTTP Error 429|HTTP Error 403", s, re.I):
        return "YOUTUBE_BLOCKED", "O YouTube bloqueou o servidor."
    if re.search(r"Private video|Video unavailable|This video is unavailable|has been removed", s, re.I):
        return "YOUTUBE_UNAVAILABLE", "O vídeo é privado ou não está mais disponível."
    if re.search(r"max-filesize|larger than max", s, re.I):
        return "YOUTUBE_TOO_LARGE", "O arquivo passa de 100 MB."
    if re.search(r"confirm your age|age-restricted", s, re.I):
        return "YOUTUBE_AGE_RESTRICTED", "O vídeo tem restrição de idade."
    if re.search(r"live event|is live|premieres in", s, re.I):
        return "YOUTUBE_LIVE", "Transmissão ao vivo ou estreia ainda não pode ser baixada."
    lines = [l.strip() for l in s.splitlines() if "ERROR" in l]
    return "YOUTUBE_DOWNLOAD_FAILED", (lines[-1] if lines else "O yt-dlp não conseguiu baixar.")[:300]


def update_ytdlp():
    if time.time() - last_update[0] < UPDATE_EVERY:
        return
    last_update[0] = time.time()
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--user", "-q", "-U", "yt-dlp"],
            timeout=180,
            check=False,
            capture_output=True,
        )
    except Exception as err:  # noqa: BLE001
        print("Falha ao atualizar o yt-dlp:", err)


def ytdlp_args(fmt, out_template):
    args = [
        sys.executable, "-m", "yt_dlp",
        "--no-playlist", "--no-progress", "--newline", "--no-mtime", "--no-part", "--no-config",
        "--max-filesize", MAX_FILESIZE,
        "-o", out_template,
        "--print", "after_move:%(title)j",
    ]
    if PROXY:
        args += ["--proxy", PROXY]
    if fmt == "AUDIO":
        args += ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0"]
    else:
        # Até 720p em H.264 para caber nos 100 MB e o Holyrics tocar sem surpresa.
        args += [
            "-f",
            "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]/b",
            "--merge-output-format", "mp4",
        ]
    return args


def run_job(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return
        job["status"] = "running"
        job["started_at"] = time.time()
    update_ytdlp()
    folder = os.path.join(DATA_DIR, job_id)
    os.makedirs(folder, exist_ok=True)
    args = ytdlp_args(job["format"], os.path.join(folder, "media.%(ext)s"))
    args += ["--", job["url"]]
    try:
        res = subprocess.run(args, capture_output=True, text=True, timeout=JOB_TIMEOUT, check=False)
        stdout, stderr, code = res.stdout, res.stderr, res.returncode
    except subprocess.TimeoutExpired:
        stdout, stderr, code = "", "ERROR: tempo esgotado", -1
    files = [f for f in os.listdir(folder) if f.startswith("media.")]
    title = ""
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if line.startswith('"') and line.endswith('"'):
            try:
                title = json.loads(line)
                break
            except ValueError:
                pass
    with jobs_lock:
        if job_id not in jobs:
            shutil.rmtree(folder, ignore_errors=True)
            return
        if code == 0 and files:
            name = files[0]
            job.update(
                status="done",
                title=title,
                file=name,
                ext=name.rsplit(".", 1)[-1].lower(),
                size=os.path.getsize(os.path.join(folder, name)),
            )
        else:
            if code == 0 and not files:
                # yt-dlp pula sem erro quando o arquivo passa do limite
                err_code, msg = "YOUTUBE_TOO_LARGE", "O arquivo passa de 100 MB."
            else:
                err_code, msg = explain(stderr)
            job.update(status="failed", error_code=err_code, error=msg)
            shutil.rmtree(folder, ignore_errors=True)
        job["finished_at"] = time.time()
    print(json.dumps({"job": job_id, "status": job["status"], "error": job.get("error_code")}))


def worker():
    while True:
        job_id = work.get()
        try:
            run_job(job_id)
        except Exception as err:  # noqa: BLE001
            with jobs_lock:
                if job_id in jobs:
                    jobs[job_id].update(status="failed", error_code="SERVER_ERROR", error=str(err)[:300])


def cleaner():
    while True:
        time.sleep(600)
        limit = time.time() - KEEP_SECONDS
        with jobs_lock:
            old = [k for k, j in jobs.items() if j["created_at"] < limit]
            for k in old:
                jobs.pop(k, None)
        for k in old:
            shutil.rmtree(os.path.join(DATA_DIR, k), ignore_errors=True)


def public(job):
    out = {k: job.get(k) for k in ("job_id", "status", "format", "title", "ext", "size", "error", "error_code")}
    if job.get("status") == "done":
        out["file_path"] = "/youtube/files/%s/%s/%s" % (job["job_id"], job["token"], quote(job["file"]))
    with jobs_lock:
        if job.get("status") == "queued":
            out["queue_position"] = list(work.queue).index(job["job_id"]) + 1 if job["job_id"] in work.queue else 0
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "LouvorFlowYouTube/1"

    def log_message(self, fmt, *args):  # sem URLs com token nos logs
        pass

    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        got = self.headers.get("x-api-key", "")
        return bool(API_KEY) and hmac.compare_digest(got, API_KEY)

    def parts(self):
        return [p for p in urlparse(self.path).path.split("/") if p]

    def do_GET(self):
        p = self.parts()
        if p == ["youtube", "health"]:
            return self.send_json(200, {"ok": True})
        if len(p) == 3 and p[:2] == ["youtube", "jobs"]:
            if not self.authorized():
                return self.send_json(401, {"error": "unauthorized"})
            job = jobs.get(p[2])
            return self.send_json(200, public(job)) if job else self.send_json(404, {"error": "not_found"})
        if len(p) >= 4 and p[:2] == ["youtube", "files"]:
            job = jobs.get(p[2])
            if not job or job.get("status") != "done" or not hmac.compare_digest(p[3], job["token"]):
                return self.send_json(404, {"error": "not_found"})
            path = os.path.join(DATA_DIR, job["job_id"], job["file"])
            if not os.path.exists(path):
                return self.send_json(404, {"error": "not_found"})
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg" if job["ext"] == "mp3" else "application/octet-stream")
            self.send_header("Content-Length", str(os.path.getsize(path)))
            self.end_headers()
            with open(path, "rb") as fh:
                shutil.copyfileobj(fh, self.wfile, 1024 * 1024)
            return None
        return self.send_json(404, {"error": "not_found"})

    def do_POST(self):
        if self.parts() != ["youtube", "jobs"]:
            return self.send_json(404, {"error": "not_found"})
        if not self.authorized():
            return self.send_json(401, {"error": "unauthorized"})
        try:
            length = min(int(self.headers.get("Content-Length") or 0), 10000)
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return self.send_json(400, {"error": "invalid_json"})
        vid = video_id(body.get("url"))
        fmt = str(body.get("format") or "VIDEO").upper()
        if not vid or fmt not in ("VIDEO", "AUDIO"):
            return self.send_json(400, {"error": "invalid_url_or_format"})
        job_id = secrets.token_hex(8)
        job = {
            "job_id": job_id,
            "token": secrets.token_urlsafe(24),
            "url": "https://www.youtube.com/watch?v=" + vid,
            "format": fmt,
            "status": "queued",
            "created_at": time.time(),
        }
        with jobs_lock:
            jobs[job_id] = job
        work.put(job_id)
        return self.send_json(202, {"job_id": job_id, "status": "queued"})

    def do_DELETE(self):
        p = self.parts()
        if len(p) != 3 or p[:2] != ["youtube", "jobs"]:
            return self.send_json(404, {"error": "not_found"})
        if not self.authorized():
            return self.send_json(401, {"error": "unauthorized"})
        with jobs_lock:
            jobs.pop(p[2], None)
        if re.match(r"^[0-9a-f]{16}$", p[2]):
            shutil.rmtree(os.path.join(DATA_DIR, p[2]), ignore_errors=True)
        return self.send_json(200, {"ok": True})


def main():
    if not API_KEY:
        print("Defina YOUTUBE_API_KEY ou WHATSAPP_API_KEY no .env")
        sys.exit(1)
    os.makedirs(DATA_DIR, exist_ok=True)
    # Arquivos de antes de reiniciar não têm mais pedido: apaga
    for name in os.listdir(DATA_DIR):
        shutil.rmtree(os.path.join(DATA_DIR, name), ignore_errors=True)
    threading.Thread(target=worker, daemon=True).start()
    threading.Thread(target=cleaner, daemon=True).start()
    threading.Thread(target=update_ytdlp, daemon=True).start()
    print("Baixador do YouTube na porta", PORT)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
