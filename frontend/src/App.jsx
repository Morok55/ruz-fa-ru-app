import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import AppShell from "./components/AppShell.jsx";
import WeekStrip from "./components/WeekStrip.jsx";
import Sections from "./components/Sections.jsx";
import DaySection from "./components/DaySection.jsx";
import GroupSearch from "./components/GroupSearch.jsx";
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

// Возвращает понедельник от выбранной пользователем даты (видимая неделя)
function getVisibleWeekStart(date) {
    return startOfWeek(date || new Date());
}

function getVisibleWeekKey(date) {
    return weekKeyOf(getVisibleWeekStart(date));
}

// --- текущая реальная неделя (первая, что видит пользователь) ---
const CURRENT_WEEK_START = startOfWeek(new Date());
const CURRENT_WEEK_KEY = weekKeyOf(CURRENT_WEEK_START);

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

function stableByDateString(bd) {
    // Стабильная строка для сравнения: сортируем ключи дней
    const res = {};
    Object.keys(bd || {}).sort().forEach(k => { res[k] = bd[k]; });
    return JSON.stringify(res);
}

export default function App() {
    const [term, setTerm] = useState(() => localStorage.getItem("lastGroup") || "");
    const [loading, setLoading] = useState(false);
    const [byDate, setByDate] = useState({});        // { "YYYY-MM-DD": Lesson[] }
    const [label, setLabel] = useState("");
    // триггер для перерисовки, когда обновляем RAM-кэш недель
    const [cacheTick, setCacheTick] = useState(0);

    const [anchorDate, setAnchorDate] = useState(startOfWeek(new Date())); // понедельник отображаемой недели
    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchorDate, i)), [anchorDate]);

    // показываем один день (сегодня) по умолчанию
    const [selectedDate, setSelectedDate] = useState(new Date());

    const [searchOpen, setSearchOpen] = useState(false);

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

    useEffect(() => {
        const lbl = localStorage.getItem("lastGroup");
        const idRaw = localStorage.getItem("lastGroupId");
        if (lbl && idRaw && !groupCacheRef.current.has(lbl)) {
            const id = isNaN(Number(idRaw)) ? idRaw : Number(idRaw);
            groupCacheRef.current.set(lbl, { id, label: lbl });
        }
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

    async function loadWeekCached({ force = false, weekStartDate = anchorDate, applyToView = false, termOverride = null } = {}) {
        // // 1) узнаём id группы (используем override, если передан)
        // const termKey = termOverride ?? term;
        // const { id, label: lbl } = await resolveGroupCached(termKey);
        const termKey = termOverride ?? term;
        if (!termKey) return;
        const { id, label: lbl } = await resolveGroupCached(termKey);
        setLabel(lbl);

        const wkKey = weekKeyOf(weekStartDate);
        const cacheKey = `${id}::${wkKey}`;

        const isCurrentWeek = wkKey === CURRENT_WEEK_KEY;
        const isPastWeek = new Date(weekStartDate) < CURRENT_WEEK_START;

        // 2) читаем из LocalStorage и сразу показываем, если есть
        const pack = lsPeek(cacheKey); // { t, v } | старый формат
        const cached = pack?.v ?? (pack && pack.byDate ? pack : null);
        if (cached?.byDate) {
            weekCacheRef.current.set(cacheKey, { data: cached, savedAt: Date.now() });
            // Если надо применить к текущему экрану — рисуем немедленно
            if (applyToView) {
                setByDate(cached.byDate);
            }
        }

        // 3) политика "прошлые недели": если есть в LS и не force — ничего не запрашиваем
        if (!force && isPastWeek && cached?.byDate) {
            return { id, cacheKey, from: "ls-past" };
        }

        // 4) защита от параллельных запросов одной и той же недели
        if (inflightRef.current.has(cacheKey)) {
            return inflightRef.current.get(cacheKey);
        }

        // 5) грузим из API и раскладываем по политике:
        //    - текущая неделя → обновляем состояние и ПИШЕМ в LS
        //    - будущие/прошлые (кроме случая 3) → только RAM (без LS)
        const p = (async () => {
            try {
                const fresh = await fetchWeekFromApi(id, weekStartDate);

                const prevHash = stableByDateString(cached?.byDate || {});
                const newHash  = stableByDateString(fresh.byDate || {});

                if (newHash !== prevHash) {
                    // если надо применить к текущему экрану — обновим
                    if (applyToView) {
                        setByDate(fresh.byDate);
                    }
                    // пишем в LS только текущую реальную неделю
                    if (isCurrentWeek) {
                        lsSet(cacheKey, fresh);
                    }
                }

                // всегда держим в RAM-кэше актуальную версию
                weekCacheRef.current.set(cacheKey, { data: fresh, savedAt: Date.now() });
                setCacheTick(t => t + 1);

                // 6) предзагрузка одной "недели назад" в RAM,
                //    но только когда грузим текущую реальную неделю
                if (isCurrentWeek) {
                    const prevStart = addDays(weekStartDate, -7);
                    const prevKey = `${id}::${weekKeyOf(prevStart)}`;

                    // если прошлой недели нет в LS и она ещё не в RAM/не грузится — предзагрузим в RAM
                    const prevInLs = lsPeek(prevKey);
                    if (!prevInLs && !weekCacheRef.current.get(prevKey) && !inflightRef.current.get(prevKey)) {
                        const prevPromise = (async () => {
                            try {
                                const prevFresh = await fetchWeekFromApi(id, prevStart);
                                weekCacheRef.current.set(prevKey, { data: prevFresh, savedAt: Date.now() });
                                setCacheTick(t => t + 1);
                            } catch (e) {
                                console.warn("Не удалось предзагрузить предыдущую неделю:", e);
                            } finally {
                                inflightRef.current.delete(prevKey);
                            }
                        })();
                        inflightRef.current.set(prevKey, prevPromise);
                    }
                }

                // предзагрузка одной "недели вперёд" в RAM (для быстрого листания)
                const nextStart = addDays(weekStartDate, 7);
                const nextKey = `${id}::${weekKeyOf(nextStart)}`;

                if (!weekCacheRef.current.get(nextKey) && !inflightRef.current.get(nextKey)) {
                    const nextPromise = (async () => {
                        try {
                            const nextFresh = await fetchWeekFromApi(id, nextStart);
                            weekCacheRef.current.set(nextKey, { data: nextFresh, savedAt: Date.now() });
                            setCacheTick(t => t + 1);
                        } catch (e) {
                            console.warn("Не удалось предзагрузить следующую неделю:", e);
                        } finally {
                            inflightRef.current.delete(nextKey);
                        }
                    })();
                    inflightRef.current.set(nextKey, nextPromise);
                }

                return { id, cacheKey, from: "network" };
            } finally {
                inflightRef.current.delete(cacheKey);
                setLoading(false);
            }
        })();
        setLoading(true);
        inflightRef.current.set(cacheKey, p);
        return p;
    }

    async function showDay(d) {
        if (!term || !(d instanceof Date)) return;

        const oldStart = startOfWeek(selectedDate);
        const newStart = startOfWeek(d);

        setSelectedDate(d);

        if (isoKey(oldStart) === isoKey(newStart)) {
            return; // та же неделя — ничего не грузим
        } else {
            // Переход в другую неделю → анимируем шапку (Swiper сам вызовет onPrevWeek/onNextWeek)
            const dir = newStart > oldStart ? "next" : "prev";
            const sw = weekSwiperRef.current;
            if (sw) sw.slideTo(dir === "next" ? 2 : 0, 100); // 0=предыдущая, 2=следующая
            // loadWeekCached запустится в onPrevWeek/onNextWeek
        }
    }

    async function goPrevWeek() {
        if (!term) return;
        const prevStart = addDays(anchorDate, -7);
        const nextSelected = sameWeekdayInWeek(prevStart, selectedDate);

        setAnchorDate(prevStart);
        setSelectedDate(nextSelected);

        // ВАЖНО: применяем загруженную неделю к экрану
        await loadWeekCached({ weekStartDate: prevStart, applyToView: true });
    }

    async function goNextWeek() {
        if (!term) return;
        const nextStart = addDays(anchorDate, 7);
        const nextSelected = sameWeekdayInWeek(nextStart, selectedDate);

        setAnchorDate(nextStart);
        setSelectedDate(nextSelected);

        // ВАЖНО: применяем загруженную неделю к экрану
        await loadWeekCached({ weekStartDate: nextStart, applyToView: true });
    }

    // принудительно обновить текущую видимую неделю (pull-to-refresh)
    async function refreshCurrentWeek() {
        if (!term) return;
        // принудительно заберём эту неделю и применим на экран
        try {
            await loadWeekCached({ force: true, weekStartDate: anchorDate, applyToView: true });
        } catch (e) {
            console.error("refreshCurrentWeek failed", e);
        }
    }

    const getLessonsFor = React.useCallback((d) => {
        // ключи дня: YYYY-MM-DD и YYYY.MM.DD
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const kDash = `${y}-${m}-${dd}`;
        const kDot  = `${y}.${m}.${dd}`;

        // если день в текущей (видимой) неделе — читаем из состояния byDate
        const sameWeek =
            startOfWeek(d).getTime() === startOfWeek(anchorDate).getTime();
        if (sameWeek) {
            const v = byDate?.[kDash] ?? byDate?.[kDot];
            // если день ещё не успел приехать — вернём undefined (покажет лоадер), а не []
            return v === undefined ? undefined : v;
        }

        // иначе — ищем в RAM-кэше недели
        const group = groupCacheRef.current.get(term);
        const id = group?.id;
        if (!id) return undefined;

        const wkKey = `${id}::${weekKeyOf(d)}`;
        const mem = weekCacheRef.current.get(wkKey);
        const memValue = mem?.data ?? mem; // на случай старого формата

        if (memValue?.byDate) {
            const v = memValue.byDate[kDash] ?? memValue.byDate[kDot];
            // если конкретный день ещё не подгружен — пусть будет undefined (покажет лоадер)
            return v === undefined ? undefined : v;
        }

        // нет в RAM — пробуем LocalStorage (могло быть сохранено ранее)
        const pack = lsPeek(wkKey);
        const cachedValue = pack?.v ?? (pack && pack.byDate ? pack : null);
        if (cachedValue?.byDate) {
            const v = cachedValue.byDate[kDash] ?? cachedValue.byDate[kDot];
            return v === undefined ? undefined : v;
        }

        // нигде нет — значит ещё грузится/будет грузиться
        return undefined; // важно: не [], чтобы DaySection показал «3 точки»
    }, [byDate, anchorDate, term, cacheTick]);

    const isLoadingFor = React.useCallback((d) => {
        const group = groupCacheRef.current.get(term);
        const id = group?.id;
        if (!id) return false;
        const wkKey = `${id}::${weekKeyOf(d)}`;
        return inflightRef.current.has(wkKey);
    }, [term, cacheTick]);

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
            // при возврате во вкладку — проверяем актуальность текущей недели и обновляем из API
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

    useEffect(() => {
        const vs = getVisibleWeekStart(selectedDate);
        loadWeekCached({ weekStartDate: vs, applyToView: true }).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getVisibleWeekKey(selectedDate)]);

    // ---------- РЕНДЕР ----------
    const header = (
        <header className="header">
            <div className="header-title">Расписание</div>
            <button
                type="button"
                className="group-form"
                onClick={() => setSearchOpen(true)}
                title="Поиск расписания"
            >
                <div className="group-search">
                    <FaSearch className="search-icon" />
                    <div className="input" style={{ cursor: "pointer" }}>
                        {label || (term ? term : "Введите группу")}
                    </div>
                </div>
            </button>

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
            <GroupSearch
                open={searchOpen}
                onClose={() => setSearchOpen(false)}
                onPick={async (g) => {
                    // 1) оптимистично чистим экран от старой группы
                    setByDate({});
                    setLabel(g.label);

                    // 2) фиксируем выбор
                    localStorage.setItem("lastGroup", g.label);
                    localStorage.setItem("lastGroupId", String(g.id));

                    groupCacheRef.current.set(g.label, { id: g.id, label: g.label }); // быстрый кэш
                    setTerm(g.label);

                    // 3) СРАЗУ грузим неделю именно для выбранной группы
                    await loadWeekCached({
                        termOverride: g.label,
                        force: true,
                        weekStartDate: anchorDate,
                        applyToView: true
                    });

                    // 4) сохранить выбранный день в пределах той же позиции недели
                    setSelectedDate(prev => sameWeekdayInWeek(anchorDate, prev));
                }}
            />
            <Sections
                selectedDate={selectedDate}
                weekDays={weekDays}
                onSelectDay={(d) => showDay(d)}
                onPrevDay={() => showDay(addDays(selectedDate, -1))}    // fallback (можно оставить)
                onNextDay={() => showDay(addDays(selectedDate,  1))}    // fallback (можно оставить)
                renderDay={(d) => (
                    <DaySection
                        date={d}
                        lessons={getLessonsFor(d)}
                        // лоадер показываем, когда:
                        // 1) идёт загрузка текущей (якорной) недели — глобальный loading === true;
                        // 2) идёт точечная загрузка нужной недели (inflightRef) — isLoadingFor(d) === true.
                        loading={
                            (loading && startOfWeek(d).getTime() === startOfWeek(anchorDate).getTime())
                            || isLoadingFor(d)
                        }
                    />
                )}
                onSwipeStart={onSwipeStart}
                onSwipeMove={onSwipeMove}
                onSwipeEnd={onSwipeEnd}
                onPullDownRefresh={refreshCurrentWeek}
                refreshing={loading}
            />
        </AppShell>
    );
}
