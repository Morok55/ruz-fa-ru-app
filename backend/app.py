import os
from datetime import datetime, timedelta
from urllib.parse import urlencode
import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from cachetools import TTLCache
from dotenv import load_dotenv

load_dotenv()

RUZ_BASE = os.getenv("RUZ_BASE", "https://ruz.fa.ru")
PORT = int(os.getenv("PORT", "8000"))
CACHE_TTL = int(os.getenv("CACHE_TTL_SECONDS", "60"))

app = Flask(__name__)
# Разрешаем фронт с localhost:5173 (Vite)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}})

# Простой кэш: ключ -> ответ, TTL секунд
cache = TTLCache(maxsize=512, ttl=CACHE_TTL)

def cached_get(key: str, url: str):
    if key in cache:
        return cache[key]
    r = requests.get(url, timeout=15)
    if not r.ok:
        return None, r.status_code
    data = r.json()
    cache[key] = (data, 200)
    return data, 200

@app.get("/api/health")
def health():
    return {"ok": True}

@app.get("/api/search")
def search():
    term = request.args.get("term", "").strip()
    if not term:
        return jsonify({"error": "term required"}), 400
    q = urlencode({"term": term})
    url = f"{RUZ_BASE}/api/search?{q}"
    key = f"search:{term}"
    data, status = cached_get(key, url)
    if status != 200:
        return jsonify({"error": f"RUZ search {status}"}), status
    return jsonify(data)

@app.get("/api/schedule/group/<group_id>")
def schedule_group(group_id):
    start = request.args.get("start")
    finish = request.args.get("finish")
    lng = request.args.get("lng", "1")
    if not start or not finish:
        return jsonify({"error": "start & finish required (YYYY.MM.DD)"}), 400
    params = urlencode({"start": start, "finish": finish, "lng": lng})
    url = f"{RUZ_BASE}/api/schedule/group/{group_id}?{params}"
    key = f"grp:{group_id}:{start}:{finish}:{lng}"
    data, status = cached_get(key, url)
    if status != 200:
        return jsonify({"error": f"RUZ schedule {status}"}), status
    return jsonify(data)

# Папка со статикой после билда фронтенда
app.static_folder = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
app.static_url_path = ""

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    """
    Раздаём React-приложение.
    Если путь существует в dist — отдать его.
    Если нет — всегда index.html (для SPA-роутов).
    """
    full_path = os.path.join(app.static_folder, path)
    if path != "" and os.path.exists(full_path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)
