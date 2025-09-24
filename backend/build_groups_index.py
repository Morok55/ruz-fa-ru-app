# backend/build_groups_index.py
# Собирает компактный индекс групп из https://ruz.fa.ru/api/dictionary/groups
# Формат: {"updated_at": "...Z", "source": ".../api/dictionary/groups", "count": N, "items":[{"id":..., "label":"..."}]}
# Если указать --validate, то среди дублей (один label -> несколько id) выбирается "живой" id по наличию пар в расписании.

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import requests


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def monday_of(date: datetime) -> datetime:
    # Понедельник той же недели (UTC)
    d = date.astimezone(timezone.utc)
    return (d - timedelta(days=(d.weekday()))).replace(hour=0, minute=0, second=0, microsecond=0)


def fmt_dot(d: datetime) -> str:
    # YYYY.MM.DD
    return f"{d.year:04d}.{d.month:02d}.{d.day:02d}"


def http_get_json(url: str, timeout: int = 30, retries: int = 3, backoff: float = 1.5, headers: Optional[dict] = None):
    last_err = None
    hdrs = {
        "User-Agent": "ruz-indexer/1.0",
        "Accept": "application/json, text/plain, */*",
    }
    if headers:
        hdrs.update(headers)
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, timeout=timeout, headers=hdrs)
            if r.status_code == 200:
                try:
                    return r.json()
                except ValueError as e:
                    last_err = RuntimeError(f"Invalid JSON: {e}")
            else:
                last_err = RuntimeError(f"HTTP {r.status_code}")
        except requests.RequestException as e:
            last_err = e
        if attempt < retries:
            time.sleep(backoff ** attempt)
    raise last_err or RuntimeError("GET failed")


def fetch_dictionary_groups(ruz_base: str, timeout: int, retries: int) -> List[dict]:
    url = ruz_base.rstrip("/") + "/api/dictionary/groups"
    headers = {
        "Referer": ruz_base.rstrip("/") + "/ruz/",
        "Origin": ruz_base.split("/ruz", 1)[0],
    }
    data = http_get_json(url, timeout=timeout, retries=retries, headers=headers)
    if not isinstance(data, list):
        return []
    return data


def build_raw_pairs(raw: Iterable[dict]) -> List[Tuple[int, str]]:
    """
    Берём только (groupOid, number) => (id, label).
    Отбрасываем пустые и нечисловые id.
    """
    out: List[Tuple[int, str]] = []
    for it in raw:
        if not isinstance(it, dict):
            continue
        gid = it.get("groupOid") or it.get("groupId") or it.get("oid")
        number = (it.get("number") or "").strip()
        if not gid or not number:
            continue
        try:
            gid_int = int(gid)
        except (TypeError, ValueError):
            continue
        out.append((gid_int, number))
    return out


def group_by_label(pairs: Iterable[Tuple[int, str]]) -> Dict[str, List[int]]:
    groups: Dict[str, List[int]] = defaultdict(list)
    for gid, label in pairs:
        groups[label].append(gid)
    return groups


def fetch_schedule_has_lessons(ruz_base: str, group_id: int, start: datetime, finish: datetime,
                               timeout: int, retries: int) -> int:
    """
    Возвращает количество занятий в окне [start, finish], 0 — если пусто/ошибка.
    """
    start_s = fmt_dot(start)
    finish_s = fmt_dot(finish)
    url = ruz_base.rstrip("/") + f"/api/schedule/group/{group_id}?start={start_s}&finish={finish_s}&lng=1"
    try:
        data = http_get_json(url, timeout=timeout, retries=retries)
    except Exception:
        return 0

    # Распространённый формат — список занятий
    if isinstance(data, list):
        return len(data)

    # Иногда приходит словарь с ключом result/items
    if isinstance(data, dict):
        for key in ("result", "items", "lessons"):
            v = data.get(key)
            if isinstance(v, list):
                return len(v)

    return 0


def pick_live_ids_for_duplicates(ruz_base: str,
                                 by_label: Dict[str, List[int]],
                                 weeks: int,
                                 timeout: int,
                                 retries: int,
                                 sleep_between: float) -> Dict[str, int]:
    """
    Для label с несколькими id выбираем «живой» id (с макс. количеством занятий в окне).
    Для уникальных label (1 id) — используем его как есть.
    """
    result: Dict[str, int] = {}
    today = datetime.now(timezone.utc)
    start = monday_of(today)
    finish = start + timedelta(days=7 * max(1, weeks))

    for label, ids in by_label.items():
        if not ids:
            continue
        if len(ids) == 1:
            result[label] = ids[0]
            continue

        best_id = ids[0]
        best_score = -1

        for gid in ids:
            score = fetch_schedule_has_lessons(ruz_base, gid, start, finish, timeout, retries)
            if score > best_score:
                best_score = score
                best_id = gid
            if sleep_between > 0:
                time.sleep(sleep_between)

        result[label] = best_id

    return result


def main():
    p = argparse.ArgumentParser(description="Build groups_index.json from RUZ dictionary (with optional validation).")
    p.add_argument("--ruz-base", default="https://ruz.fa.ru", help="RUZ base, default: https://ruz.fa.ru")
    p.add_argument("--out", default=str(Path(__file__).with_name("groups_index.json")), help="Output JSON file")
    p.add_argument("--timeout", type=int, default=20, help="HTTP timeout seconds")
    p.add_argument("--retries", type=int, default=3, help="HTTP retries per request")
    p.add_argument("--validate", action="store_true",
                   help="Validate duplicates by checking schedule in next weeks and keep the 'live' id")
    p.add_argument("--weeks", type=int, default=2,
                   help="Validation window length in weeks (used with --validate), default: 2")
    p.add_argument("--throttle", type=float, default=0.1,
                   help="Sleep seconds between validation requests to RUZ, default: 0.1")
    args = p.parse_args()

    # 1) тянем словарь групп
    try:
        raw = fetch_dictionary_groups(args.ruz_base, timeout=args.timeout, retries=args.retries)
    except Exception as e:
        print(f"[build] fetch groups failed: {e}", file=sys.stderr)
        sys.exit(2)

    # 2) строим пары (id, label)
    pairs = build_raw_pairs(raw)
    if not pairs:
        print("[build] no groups found in dictionary", file=sys.stderr)

    # 3) уникализируем (id,label) → сначала уберём точные дубликаты
    pairs = list({(gid, label) for (gid, label) in pairs})

    # 4) если валидация включена — выбираем «живой» id среди дублей одного label
    if args.validate:
        by_label = group_by_label(pairs)
        chosen = pick_live_ids_for_duplicates(
            ruz_base=args.ruz_base,
            by_label=by_label,
            weeks=args.weeks,
            timeout=args.timeout,
            retries=args.retries,
            sleep_between=args.throttle,
        )
        # формируем итоговые элементы (label уникален)
        items = [{"id": gid, "label": label} for label, gid in chosen.items()]
    else:
        # без валидации оставляем все пары (но можно свести к одному id на label — выбрав, например, минимальный)
        # чтобы не перегружать фронт дубликатами, сведём к одному id на label по минимальному id:
        by_label = group_by_label(pairs)
        items = [{"id": min(ids), "label": label} for label, ids in by_label.items()]

    # 5) сортировка и запись
    items.sort(key=lambda x: x["label"].lower())
    out_obj = {
        "updated_at": now_utc_iso(),
        "source": args.ruz_base.rstrip("/") + "/api/dictionary/groups",
        "count": len(items),
        "items": items,
    }

    out_path = Path(args.out).resolve()
    out_path.write_text(json.dumps(out_obj, ensure_ascii=False), encoding="utf-8")
    print(f"✅ saved {out_obj['count']} groups -> {out_path}")
    if args.validate:
        dup_total = sum(max(0, len(v) - 1) for v in group_by_label(pairs).values())
        print(f"ℹ️ validation: resolved duplicates (pairs -> unique labels): {len(pairs)} -> {len(items)}; "
              f"duplicates encountered: {dup_total}")


if __name__ == "__main__":
    main()
