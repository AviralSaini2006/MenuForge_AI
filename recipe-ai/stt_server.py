"""Local speech-to-text service using faster-whisper (open-source Whisper, multilingual).
Run:  python stt_server.py      (keep it running next to `node server.js`)
Env:  WHISPER_MODEL (default large-v3-turbo; use 'small' or 'medium' on weak machines), STT_PORT (default 8001)
"""
import io, json, os, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
PORT = int(os.environ.get("STT_PORT", "8001"))
print(f"Loading speech model '{MODEL}' (first run downloads it, ~1.6 GB for large-v3-turbo)...", flush=True)
model = WhisperModel(MODEL, device="auto", compute_type="auto")  # GPU if available, else fast int8 on CPU
print("Speech model ready.", flush=True)
LOCK = threading.Lock()

class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            return self._send(200, {"ok": True, "model": MODEL})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/transcribe":
            return self._send(404, {"error": "not found"})
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        lang = parse_qs(u.query).get("lang", [""])[0] or None   # None = auto-detect
        try:
            with LOCK:
                segments, info = model.transcribe(io.BytesIO(data), language=lang, beam_size=5,
                                                  vad_filter=True, condition_on_previous_text=False)
                text = " ".join(s.text.strip() for s in segments).strip()
            self._send(200, {"text": text, "language": info.language, "duration": round(info.duration, 1)})
        except Exception as e:
            self._send(500, {"error": f"Transcription failed: {e}"})

    def log_message(self, *a):
        pass

if __name__ == "__main__":
    print(f"Speech server on http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
