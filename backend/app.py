import os
import json
from pathlib import Path
from datetime import datetime, timedelta
from urllib.parse import urlencode
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from flask import Flask, jsonify, request, send_from_directory, make_response
from flask_cors import CORS
from flask_compress import Compress
from cachetools import TTLCache
from dotenv import load_dotenv

load_dotenv()

RUZ_BASE = os.getenv("RUZ_BASE", "https://ruz.fa.ru")
PORT = int(os.getenv("PORT", "8000"))
CACHE_TTL = int(os.getenv("CACHE_TTL_SECONDS", "60"))

# Путь к локальному индексу групп (создаётся скриптом build_groups_index.py)
GROUPS_INDEX_PATH = Path(__file__).with_name("groups_index.json")

# Простой кеш в памяти: перезагружаем файл только если изменился mtime
_groups_cache = {
    "mtime": 0,
    "items": [],
}

app = Flask(__name__)

Compress(app)

# Разрешаем фронт с localhost:5173 (Vite)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}})

# Простой кэш: ключ -> ответ, TTL секунд
cache = TTLCache(maxsize=512, ttl=CACHE_TTL)

session = requests.Session()
session.headers.update({"User-Agent": "ruz-proxy/1.0"})
adapter = HTTPAdapter(pool_connections=20, pool_maxsize=40, max_retries=Retry(
    total=2, backoff_factor=0.2, status_forcelist=(502, 503, 504)
))
session.mount("http://", adapter)
session.mount("https://", adapter)

def cached_get(key: str, url: str):
    if key in cache:
        return cache[key]
    r = session.get(url, timeout=10)
    if not r.ok:
        return None, r.status_code
    data = r.json()
    cache[key] = (data, 200)
    return data, 200

def ruz_items(data):
    """
    RUZ иногда возвращает список напрямую, а иногда объект {"value": [...], "Count": N}.
    Для фронта удобнее держать единый формат: list.
    """
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("value"), list):
        return data["value"]
    return []

def normalize_search_items(data, fallback_type=None, limit=50):
    result = []
    seen = set()
    for item in ruz_items(data):
        if not isinstance(item, dict):
            continue
        item_type = item.get("type") or fallback_type
        item_id = item.get("id") or item.get("groupOid") or item.get("oid")
        label = item.get("label") or item.get("text") or item.get("number") or ""
        if not item_type or not item_id or not label:
            continue
        key = f"{item_type}:{item_id}"
        if key in seen:
            continue
        seen.add(key)
        result.append({
            "id": item_id,
            "label": label,
            "type": item_type,
            "description": item.get("description") or "",
        })
        if len(result) >= limit:
            break
    return result

def load_groups_index():
    """
    Загружает backend/groups_index.json в память.
    Перечитывает файл только если изменился mtime (на случай ручного обновления).
    Возвращает list[{"id": int, "label": str}, ...]
    """
    try:
        st = GROUPS_INDEX_PATH.stat()
    except FileNotFoundError:
        return []

    mtime = int(st.st_mtime)
    if _groups_cache["mtime"] != mtime:
        try:
            data = json.loads(GROUPS_INDEX_PATH.read_text(encoding="utf-8"))
            items = data.get("items") or []
            if not isinstance(items, list):
                items = []
            _groups_cache["items"] = items
            _groups_cache["mtime"] = mtime
        except Exception:
            _groups_cache["items"] = []
            _groups_cache["mtime"] = mtime
    return _groups_cache["items"]

@app.get("/api/health")
def health():
    return {"ok": True}

@app.get("/api/groups")
def groups_suggest():
    """
    Подсказки групп из локального файла groups_index.json.
    Параметры:
      term: строка поиска (без регистра, ищем в label)
      limit: макс. количество результатов (по умолчанию 50)
    Ответ:
      200 OK -> JSON-массив [{ "id": 123, "label": "ТРПО-22-1" }, ...]
    """
    term = (request.args.get("term") or "").strip().lower()
    try:
        limit = int(request.args.get("limit") or 50)
    except ValueError:
        limit = 50
    limit = max(1, min(200, limit))

    items = load_groups_index()
    if not term:
        # ничего не вводили — пусто (или можно вернуть top-N популярных, если появится метрика)
        result = []
    else:
        # фильтрация по подстроке без регистра; поддержим также поиск по id (цифрами)
        result = []
        is_digit = term.isdigit()
        for it in items:
            lbl = str(it.get("label") or "")
            gid = str(it.get("id") or "")
            if (lbl and term in lbl.lower()) or (is_digit and gid.startswith(term)):
                result.append({"id": it.get("id"), "label": lbl, "type": "group"})
                if len(result) >= limit:
                    break

    resp = make_response(jsonify(result), 200)
    resp.headers["Cache-Control"] = "public, max-age=60"
    return resp

@app.get("/api/search")
def search():
    term = request.args.get("term", "").strip()
    if not term:
        return jsonify({"error": "term required"}), 400
    search_type = (request.args.get("type") or "").strip()
    try:
        limit = int(request.args.get("limit") or 50)
    except ValueError:
        limit = 50
    limit = max(1, min(200, limit))

    params = {"term": term}
    if search_type:
        params["type"] = search_type
    q = urlencode(params)
    url = f"{RUZ_BASE}/api/search?{q}"
    key = f"search:{search_type}:{term}"
    data, status = cached_get(key, url)
    if status != 200:
        return jsonify({"error": f"RUZ search {status}"}), status

    resp = make_response(jsonify(normalize_search_items(data, fallback_type=search_type, limit=limit)), 200)
    resp.headers["Cache-Control"] = "public, max-age=300"
    return resp

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

    resp = make_response(jsonify(ruz_items(data)), 200)
    resp.headers["Cache-Control"] = "public, max-age=300"
    return resp

@app.get("/api/schedule/person/<person_id>")
def schedule_person(person_id):
    start = request.args.get("start")
    finish = request.args.get("finish")
    lng = request.args.get("lng", "1")
    if not start or not finish:
        return jsonify({"error": "start & finish required (YYYY.MM.DD)"}), 400

    params = urlencode({"start": start, "finish": finish, "lng": lng})
    url = f"{RUZ_BASE}/api/schedule/person/{person_id}?{params}"
    key = f"person:{person_id}:{start}:{finish}:{lng}"
    data, status = cached_get(key, url)
    if status != 200:
        return jsonify({"error": f"RUZ schedule {status}"}), status

    resp = make_response(jsonify(ruz_items(data)), 200)
    resp.headers["Cache-Control"] = "public, max-age=300"
    return resp

@app.get("/api/schedule/auditorium/<auditorium_id>")
def schedule_auditorium(auditorium_id):
    start = request.args.get("start")
    finish = request.args.get("finish")
    lng = request.args.get("lng", "1")
    if not start or not finish:
        return jsonify({"error": "start & finish required (YYYY.MM.DD)"}), 400

    params = urlencode({"start": start, "finish": finish, "lng": lng})
    url = f"{RUZ_BASE}/api/schedule/auditorium/{auditorium_id}?{params}"
    key = f"auditorium:{auditorium_id}:{start}:{finish}:{lng}"
    data, status = cached_get(key, url)
    if status != 200:
        return jsonify({"error": f"RUZ schedule {status}"}), status

    resp = make_response(jsonify(ruz_items(data)), 200)
    resp.headers["Cache-Control"] = "public, max-age=300"
    return resp

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
