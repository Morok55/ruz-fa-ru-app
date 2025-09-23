import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import AppShell from "./components/AppShell.jsx";
import WeekStrip from "./components/WeekStrip.jsx";
import Sections from "./components/Sections.jsx";
import DaySection from "./components/DaySection.jsx";
import { FaSearch } from "react-icons/fa";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

/* ===== helpers ===== */
const pad = (n) => String(n).padStart(2, "0");
const fmtRuz = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
const daysRuShort = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function startOfWeek(date) {
    const d = new Date(date);
    const shift = (d.getDay() + 6) % 7; // 0=Mon
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - shift);
    return d;
}
function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}
function parseRuzDate(s) {
    if (!s) return null;
    const parts = s.split(".");
    if (parts.length === 3) {
        if (parts[0].length === 4) {
            return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        } else {
            return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
    }
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : new Date(t);
}
function isoKey(d) {
    // локальный ключ YYYY-MM-DD, без UTC-сдвигов
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}
function weekKeyOf(date) {
    const w = startOfWeek(date);
    // тот же локальный формат, что и для дней
    return isoKey(w);
}

// --- SWR (stale-while-revalidate) ---
const SWR_STALE  = 1000 * 60 * 5;   // 5 минут — мягкий TTL
const SWR_EXPIRE = 1000 * 60 * 60 * 10;  // 10 часов — жёсткий TTL

function lsSet(key, value) {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
}
function lsPeek(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

function mergeDayLessons(arr) {
    const byKey = new Map();
    for (const l of arr) {
        const kind = (l.kindOfWork || l.lessonType || "").trim();
        const key = `${(l.discipline || "").trim()}|${kind}|${(l.beginLesson || "").trim()}|${(l.endLesson || "").trim()}`;

        if (!byKey.has(key)) {
            byKey.set(key, {
                ...l,
                _lines: [],        // массив объектов { teacher, room }
                _isForeign: /иностран/i.test(l.discipline || ""), // флаг «иностр. язык»
                _originals: []
            });
        }
        const item = byKey.get(key);

        const teacher = (l.lecturer || l.lecturer_name || "").trim();
        const room = (l.auditorium || l.room || "").trim();

        // добавляем уникальные комбинации teacher+room
        if (teacher || room) {
            const exists = item._lines.some(x => x.teacher === teacher && x.room === room);
            if (!exists) item._lines.push({ teacher, room });
        }

        item._originals.push(l);
    }

    const merged = Array.from(byKey.values()).sort(
        (a, b) => (toHHMM(a.beginLesson)).localeCompare(toHHMM(b.beginLesson))
    );

    return merged.map((l, i) => {
        const no = pairNoByTime(l.beginLesson, l.endLesson);
        return { ...l, _pairNo: no ?? (i + 1) };
    });
}

function toHHMM(s) {
    if (!s) return "";
    const t = String(s).trim().replace(/\./g, ":");
    const [h = "", m = ""] = t.split(":");
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function pairNoByTime(begin, end) {
    const b = toHHMM(begin);
    const e = toHHMM(end);
    const key = `${b}-${e}`;
    const map = {
        "08:30-10:00": 1,
        "10:10-11:40": 2,
        "11:50-13:20": 3,
        "14:00-15:30": 4,
        "15:40-17:10": 5,
        "17:20-18:50": 6,
        "18:55-20:25": 7,
        "20:30-22:00": 8
    };
    return map[key]; // вернёт undefined, если нет в таблице
}

function sameWeekdayInWeek(weekStart, dateToKeep) {
    const idx = (dateToKeep.getDay() + 6) % 7; // 0=пн … 6=вс
    return addDays(weekStart, idx);
}

/* ===== API ===== */
async function fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    return r.json();
}

async function fetchWeekFromApi(id, weekStartDate) {
    const start = fmtRuz(weekStartDate);
    const finish = fmtRuz(addDays(weekStartDate, 6));
    const lessons = await fetchJSON(`${API_BASE}/schedule/group/${id}?start=${start}&finish=${finish}&lng=1`);

    const tmp = {};
    for (const l of lessons) {
        const d = parseRuzDate(l.date);
        if (!d) continue;
        const key = isoKey(d);
        (tmp[key] ||= []).push(l);
    }
    Object.keys(tmp).forEach((k) => (tmp[k] = mergeDayLessons(tmp[k])));
    return { byDate: tmp, fetchedAt: Date.now() };
}

export default function App() {
    const [term, setTerm] = useState(() => localStorage.getItem("lastGroup") || "");
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(false);
    const [byDate, setByDate] = useState({});        // { "YYYY-MM-DD": Lesson[] }
    const [label, setLabel] = useState("");

    const [anchorDate, setAnchorDate] = useState(startOfWeek(new Date())); // понедельник отображаемой недели
    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchorDate, i)), [anchorDate]);

    // показываем один день (сегодня) по умолчанию
    const [selectedDate, setSelectedDate] = useState(new Date());

    // ------ КЭШИ (память вкладки) ------
    const groupCacheRef = useRef(new Map());  // term -> { id, label }
    const weekCacheRef = useRef(new Map());   // cacheKey -> { byDate, fetchedAt }

    const weekSwiperRef = useRef(null);

    const inflightRef = useRef(new Map()); // cacheKey -> Promise

    const daySwipeProgressRef = useRef(null);

    const swipeHandlersRef = useRef(null);

    const bindDaySwipeProgress = useCallback((handlers) => {
        swipeHandlersRef.current = handlers; // { start, move, end }
    }, []);

    const onSwipeStart = useCallback(() => {
        swipeHandlersRef.current?.start?.();
    }, []);
    const onSwipeMove = useCallback((p) => {
        swipeHandlersRef.current?.move?.(p);
    }, []);
    const onSwipeEnd = useCallback((committed, dir) => {
        // dir: "prev" | "next" | undefined (при отмене)
        swipeHandlersRef.current?.end?.(committed, dir);
    }, []);

    // функция, которую будет звать Sections на движении пальца
    const handleDaySwipeProgress = useCallback((p) => {
        daySwipeProgressRef.current && daySwipeProgressRef.current(p);
    }, []);

    async function resolveGroupCached(termStr) {
        const hit = groupCacheRef.current.get(termStr);
        if (hit) return hit;
        const options = await fetchJSON(`${API_BASE}/search?term=${encodeURIComponent(termStr)}`);
        const group = options.find((v) => /group/i.test(v.type || v.kind || v.category || "") || v.group);
        if (!group) throw new Error("Группа не найдена");
        const id = group.id ?? group.groupOid ?? group.oid;
        const lbl = group.label || group.text || termStr;
        const val = { id, label: lbl };
        groupCacheRef.current.set(termStr, val);
        return val;
    }

    async function loadWeekCached({ force = false, weekStartDate = anchorDate } = {}) {
        // получим id группы (часто из кэша)
        const { id, label: lbl } = await resolveGroupCached(term);
        setLabel(lbl);

        const wkKey = weekKeyOf(weekStartDate);
        const cacheKey = `${id}::${wkKey}`;

        // --- SWR: сначала пробуем кэш из localStorage ---
        const pack = lsPeek(cacheKey);

        // поддержка старого формата: либо { t, v }, либо сразу { byDate, fetchedAt }
        const cachedValue = pack?.v ?? (pack && pack.byDate ? pack : null);
        const savedAt = (pack && pack.t) ?? (cachedValue && cachedValue.fetchedAt) ?? 0;

        if (!force && cachedValue && cachedValue.byDate) {
            const age = Date.now() - savedAt;

            if (age <= SWR_EXPIRE) {
                // покажем из LS мгновенно
                weekCacheRef.current.set(cacheKey, { data: cachedValue, savedAt }); // в RAM кладём вместе со временем
                setByDate(cachedValue.byDate);
                setStatus("");

                // если старше мягкого TTL — обновим в фоне
                if (age > SWR_STALE && !inflightRef.current.has(cacheKey)) {
                    inflightRef.current.set(cacheKey, (async () => {
                        try {
                            const fresh = await fetchWeekFromApi(id, weekStartDate);
                            const now = Date.now();
                            weekCacheRef.current.set(cacheKey, { data: fresh, savedAt: now });
                            lsSet(cacheKey, fresh);
                            setByDate(prev =>
                                weekKeyOf(weekDays[0]) === weekKeyOf(weekStartDate) ? fresh.byDate : prev
                            );
                        } catch {
                        } finally {
                            inflightRef.current.delete(cacheKey);
                        }
                    })());
                }
                return { id, cacheKey };
            }
            // если возраст > EXPIRE — не используем LS-данные (жёсткий TTL)
        }
        // --- конец блока SWR ---

        // 1) уже есть в RAM-кэше — мгновенно
        const mem = weekCacheRef.current.get(cacheKey);
        if (!force && mem) {
            const memValue = mem.data ?? mem;              // на случай старого содержимого
            const memSavedAt = mem.savedAt ?? memValue.fetchedAt ?? 0;
            const memAge = Date.now() - memSavedAt;

            if (memAge <= SWR_EXPIRE) {
                setByDate(memValue.byDate);
                setStatus("");

                // если RAM-кэш старше мягкого TTL — дернём фоновое обновление
                if (memAge > SWR_STALE && !inflightRef.current.has(cacheKey)) {
                    inflightRef.current.set(cacheKey, (async () => {
                        try {
                            const fresh = await fetchWeekFromApi(id, weekStartDate);
                            const now = Date.now();
                            weekCacheRef.current.set(cacheKey, { data: fresh, savedAt: now });
                            lsSet(cacheKey, fresh);
                            setByDate(prev =>
                                weekKeyOf(weekDays[0]) === weekKeyOf(weekStartDate) ? fresh.byDate : prev
                            );
                        } catch {
                        } finally {
                            inflightRef.current.delete(cacheKey);
                        }
                    })());
                }

                return { id, cacheKey };
            }
            // если memAge > EXPIRE — RAM-кэш тоже не используем, идём в сеть
        }

        // 2) уже грузим это же — подождём существующий промис
        if (inflightRef.current.has(cacheKey)) {
            setStatus("Загружаю неделю…");
            return inflightRef.current.get(cacheKey);
        }

        setLoading(true);
        // setStatus("Загружаю неделю…");
        const p = (async () => {
            try {
                const fresh = await fetchWeekFromApi(id, weekStartDate);

                const now = Date.now();
                weekCacheRef.current.set(cacheKey, { data: fresh, savedAt: now });
                lsSet(cacheKey, fresh);

                // предзагрузка +/- 1 неделя (без перерисовки)
                for (const delta of [-7, 7]) {
                    const sideStart = addDays(weekStartDate, delta);
                    const sideKey = `${id}::${weekKeyOf(sideStart)}`;
                    if (!weekCacheRef.current.has(sideKey) && !inflightRef.current.has(sideKey)) {
                        inflightRef.current.set(sideKey, (async () => {
                            try {
                                const side = await fetchWeekFromApi(id, sideStart);
                                const nowSide = Date.now();
                                weekCacheRef.current.set(sideKey, { data: side, savedAt: nowSide });
                                lsSet(sideKey, side);
                            } catch {}
                            finally { inflightRef.current.delete(sideKey); }
                        })());
                    }
                }

                setByDate(fresh.byDate);
                setStatus("");
                return { id, cacheKey };
            } catch (e) {
                setStatus("Ошибка: " + e.message);
                throw e;
            } finally {
                inflightRef.current.delete(cacheKey);
                setLoading(false);
            }
        })();

        inflightRef.current.set(cacheKey, p);
        return p;
    }

    async function showDay(dateObj) {
        if (!term) return;

        const oldStart = startOfWeek(selectedDate);
        const newStart = startOfWeek(dateObj);

        setSelectedDate(dateObj);

        if (isoKey(oldStart) === isoKey(newStart)) {
            // та же неделя — ничего не грузим
            return;
        } else {
            // Переход в другую неделю → анимируем шапку (Swiper сам вызовет onPrevWeek/onNextWeek)
            const dir = newStart > oldStart ? "next" : "prev";
            const sw = weekSwiperRef.current;
            if (sw) sw.slideTo(dir === "next" ? 2 : 0, 260); // 0=предыдущая, 2=следующая
            // loadWeekCached запустится в onPrevWeek/onNextWeek по окончании анимации шапки
        }
    }

    async function goPrevWeek() {
        if (!term) return;
        const prevStart = addDays(anchorDate, -7);
        setAnchorDate(prevStart);
        setSelectedDate(prev => sameWeekdayInWeek(prevStart, prev));
        await loadWeekCached({ weekStartDate: prevStart });
    }

    async function goNextWeek() {
        if (!term) return;
        const nextStart = addDays(anchorDate, 7);
        setAnchorDate(nextStart);
        setSelectedDate(prev => sameWeekdayInWeek(nextStart, prev));
        await loadWeekCached({ weekStartDate: nextStart });
    }

    const getLessonsFor = React.useCallback((d) => {
        // формируем локальный ключ вида YYYY-MM-DD
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const kDash = `${y}-${m}-${dd}`;
        const kDot  = `${y}.${m}.${dd}`;

        // пробуем оба варианта, чтобы покрыть текущее наполнение byDate
        return byDate[kDash] || byDate[kDot] || [];
    }, [byDate]);

    useEffect(() => {
        if (!term) return;
        (async () => {
            await loadWeekCached({ weekStartDate: anchorDate });
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [term]);

    useEffect(() => {
        function revalidate() {
            if (!term) return;
            // эта функция сама применит SWR-логику: если кэш свежий — не тронет сеть,
            // если устарел по мягкому TTL — проверит в фоне
            loadWeekCached({ weekStartDate: anchorDate });
        }
        const onVis = () => { if (document.visibilityState === "visible") revalidate(); };

        window.addEventListener("focus", revalidate);
        window.addEventListener("visibilitychange", onVis);
        return () => {
            window.removeEventListener("focus", revalidate);
            window.removeEventListener("visibilitychange", onVis);
        };
    }, [anchorDate, term]);

    // ---------- РЕНДЕР ----------
    const header = (
        <header className="header">
            <div className="header-title">Расписание</div>
            <form
                className="group-form"
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (!term) return;
                    await loadWeekCached({ force: true, weekStartDate: anchorDate });
                    localStorage.setItem("lastGroup", term);
                    setSelectedDate(prev => sameWeekdayInWeek(anchorDate, prev));
                }}
            >
                <div className="group-search">
                    <FaSearch className="search-icon" />
                    <input
                        className="input"
                        placeholder="Группа"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                    />
                    {/* <button className="button" disabled={loading}>
                        {loading ? "Загрузка…" : "Обновить"}
                    </button> */}
                </div>
            </form>

            <WeekStrip
                weekDays={weekDays}
                selectedDate={selectedDate}
                onSelectDay={showDay}
                dayLabels={daysRuShort}
                onPrevWeek={goPrevWeek}
                onNextWeek={goNextWeek}
                onReady={(sw) => (weekSwiperRef.current = sw)}
                bindDaySwipeProgress={bindDaySwipeProgress}
            />
        </header>
    );

    return (
        <AppShell header={header}>
            <Sections
                selectedDate={selectedDate}
                onPrevDay={() => showDay(addDays(selectedDate, -1))}
                onNextDay={() => showDay(addDays(selectedDate,  1))}
                renderDay={(d) => <DaySection date={d} lessons={getLessonsFor(d)} loading={loading} />}
                onSwipeStart={onSwipeStart}
                onSwipeMove={onSwipeMove}
                onSwipeEnd={onSwipeEnd}
            />
        </AppShell>
    );
}
