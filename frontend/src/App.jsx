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
function parseWeekKey(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
}

function isSameDay(a, b) {
    return a && b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
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
const CURRENT_WEEK_TIME = CURRENT_WEEK_START.getTime();
const LAST_ENTITY_KEY = "tg-schedule::last-entity";

function normalizeEntity(raw, fallbackType = "group") {
    if (!raw) return null;
    const type = raw.type === "person" ? "person" : fallbackType;
    const id = raw.id ?? raw.groupOid ?? raw.oid;
    const label = raw.label || raw.text || raw.number || "";
    if (!id || !label) return null;
    return {
        id,
        label,
        type,
        description: raw.description || ""
    };
}

function entityKey(entity) {
    return entity ? `${entity.type || "group"}:${entity.id}` : "";
}

function scheduleCacheKey(entity, weekKey) {
    return `${entityKey(entity)}::${weekKey}`;
}

function legacyGroupScheduleCacheKey(entity, weekKey) {
    return entity?.type === "group" ? `${entity.id}::${weekKey}` : null;
}

function readLastEntity() {
    try {
        const raw = localStorage.getItem(LAST_ENTITY_KEY);
        const parsed = raw ? normalizeEntity(JSON.parse(raw)) : null;
        if (parsed) return parsed;
    } catch {
        // fall through to legacy keys
    }

    const lbl = localStorage.getItem("lastGroup");
    const idRaw = localStorage.getItem("lastGroupId");
    if (!lbl || !idRaw) return null;
    const id = isNaN(Number(idRaw)) ? idRaw : Number(idRaw);
    return normalizeEntity({ id, label: lbl, type: "group" });
}

function writeLastEntity(entity) {
    try {
        localStorage.setItem(LAST_ENTITY_KEY, JSON.stringify(entity));
        // Legacy keys keep older builds and already-saved users on the happy path.
        if (entity.type === "group") {
            localStorage.setItem("lastGroup", entity.label);
            localStorage.setItem("lastGroupId", String(entity.id));
        }
    } catch (e) {
        console.warn("Could not write selected schedule to localStorage:", e);
    }
}

function lsSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (e) {
        console.warn("Could not write schedule to localStorage:", e);
    }
}
function lsPeek(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}
function unpackStoredWeek(pack) {
    return pack?.v ?? (pack && pack.byDate ? pack : null);
}
function canUsePersistentWeek(date) {
    return startOfWeek(date).getTime() <= CURRENT_WEEK_TIME;
}
function readStoredWeek(cacheKey, weekStartDate) {
    if (!canUsePersistentWeek(weekStartDate)) return null;
    const cached = unpackStoredWeek(lsPeek(cacheKey));
    return cached?.byDate ? cached : null;
}

function readStoredWeekForEntity(entity, weekKey, weekStartDate) {
    if (entity?.type === "person") {
        return { cached: null, key: scheduleCacheKey(entity, weekKey) };
    }

    const primary = scheduleCacheKey(entity, weekKey);
    const cached = readStoredWeek(primary, weekStartDate);
    if (cached?.byDate) return { cached, key: primary };

    const legacy = legacyGroupScheduleCacheKey(entity, weekKey);
    if (legacy) {
        const legacyCached = readStoredWeek(legacy, weekStartDate);
        if (legacyCached?.byDate) return { cached: legacyCached, key: legacy };
    }
    return { cached: null, key: primary };
}

function mergeDayLessons(arr, scheduleType = "group") {
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

        const teacher = scheduleType === "person"
            ? (l.group || l.groupName || l.subGroup || l.stream || "").trim()
            : (l.lecturer_title || l.lecturer_name || "").trim();
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

async function fetchWeekFromApi(entity, weekStartDate) {
    const start = fmtRuz(weekStartDate);
    const finish = fmtRuz(addDays(weekStartDate, 6));
    const scheduleType = entity.type === "person" ? "person" : "group";
    const lessonsRaw = await fetchJSON(`${API_BASE}/schedule/${scheduleType}/${entity.id}?start=${start}&finish=${finish}&lng=1`);
    const lessons = Array.isArray(lessonsRaw) ? lessonsRaw : (lessonsRaw?.value || []);

    const tmp = {};
    for (const l of lessons) {
        const d = parseRuzDate(l.date);
        if (!d) continue;
        const key = isoKey(d);
        (tmp[key] ||= []).push({ ...l, _scheduleType: scheduleType });
    }
    Object.keys(tmp).forEach((k) => (tmp[k] = mergeDayLessons(tmp[k], scheduleType)));
    return { byDate: tmp, fetchedAt: Date.now() };
}

export default function App() {
    const initialEntity = readLastEntity();
    const [term, setTerm] = useState(() => entityKey(initialEntity));
    const [loading, setLoading] = useState(false);
    const [byDate, setByDate] = useState({});        // { "YYYY-MM-DD": Lesson[] }
    const [label, setLabel] = useState(() => initialEntity?.label || "");
    const [now, setNow] = useState(() => new Date());
    // триггер для перерисовки, когда обновляем RAM-кэш недель
    const [cacheTick, setCacheTick] = useState(0);

    const [anchorDate, setAnchorDate] = useState(startOfWeek(new Date())); // понедельник отображаемой недели
    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchorDate, i)), [anchorDate]);

    // показываем один день (сегодня) по умолчанию
    const [selectedDate, setSelectedDate] = useState(new Date());

    const [searchOpen, setSearchOpen] = useState(false);

    // ------ КЭШИ (память вкладки) ------
    const groupCacheRef = useRef(new Map([[entityKey(initialEntity), initialEntity]].filter(([, v]) => !!v)));  // entityKey -> { id, label, type }
    const weekCacheRef = useRef(new Map());   // cacheKey -> { byDate, fetchedAt }
    const loadedWeekKeysRef = useRef(new Set());
    const failedWeekKeysRef = useRef(new Set());

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
        const stored = readLastEntity();
        const key = entityKey(stored);
        if (stored && key && !groupCacheRef.current.has(key)) {
            groupCacheRef.current.set(key, stored);
        }
    }, []);

    useEffect(() => {
        const id = setInterval(() => {
            setNow(new Date());
        }, 60_000); // раз в минуту достаточно
        return () => clearInterval(id);
    }, []);

    async function resolveGroupCached(termStr) {
        const hit = groupCacheRef.current.get(termStr);
        if (hit) return hit;

        const stored = readLastEntity();
        if (stored && (entityKey(stored) === termStr || stored.label === termStr)) {
            const val = normalizeEntity(stored);
            groupCacheRef.current.set(entityKey(val), val);
            return val;
        }

        const options = await fetchJSON(`${API_BASE}/search?term=${encodeURIComponent(termStr)}`);
        const picked = options.find((v) => v.type === "group" || v.type === "person") || options[0];
        const val = normalizeEntity(picked);
        if (!val) throw new Error("Расписание не найдено");
        groupCacheRef.current.set(entityKey(val), val);
        return val;
    }

    function markWeekLoaded(cacheKey) {
        loadedWeekKeysRef.current.add(cacheKey);
        failedWeekKeysRef.current.delete(cacheKey);
        setCacheTick(t => t + 1);
    }

    function markWeekFailed(cacheKey) {
        failedWeekKeysRef.current.add(cacheKey);
        setCacheTick(t => t + 1);
    }

    function hydrateStoredPastWeeks(entity) {
        let hydrated = 0;
        try {
            const prefixes = [scheduleCacheKey(entity, "")];
            const legacyPrefix = legacyGroupScheduleCacheKey(entity, "");
            if (legacyPrefix) prefixes.push(legacyPrefix);

            const entries = [];
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                const prefix = prefixes.find((p) => key?.startsWith(p));
                if (!prefix) continue;

                const weekKey = key.slice(prefix.length);
                const weekStart = parseWeekKey(weekKey);
                if (!weekStart || weekStart.getTime() >= CURRENT_WEEK_TIME) continue;

                const cached = readStoredWeek(key, weekStart);
                if (cached?.byDate) entries.push({ key, weekStart, cached });
            }

            entries
                .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())
                .forEach(({ key, cached }) => {
                    if (!weekCacheRef.current.has(key)) {
                        weekCacheRef.current.set(key, { data: cached, savedAt: Date.now() });
                        loadedWeekKeysRef.current.add(key);
                        hydrated += 1;
                    }
                });
        } catch (e) {
            console.warn("Could not hydrate past weeks from localStorage:", e);
        }

        if (hydrated > 0) setCacheTick(t => t + 1);
        return hydrated;
    }

    async function loadWeekCached({ force = false, weekStartDate = anchorDate, applyToView = false, termOverride = null, entityOverride = null } = {}) {
        // // 1) узнаём выбранную сущность расписания (группа или преподаватель)
        const termKey = termOverride ?? term;
        if (!entityOverride && !termKey) return;
        const entity = entityOverride ? normalizeEntity(entityOverride) : await resolveGroupCached(termKey);
        if (!entity) return;
        const entityCacheKey = entityKey(entity);
        groupCacheRef.current.set(entityCacheKey, entity);
        setLabel(entity.label);

        const normalizedWeekStart = startOfWeek(weekStartDate);
        const wkKey = weekKeyOf(normalizedWeekStart);
        const cacheKey = scheduleCacheKey(entity, wkKey);

        const isCurrentWeek = wkKey === CURRENT_WEEK_KEY;
        const isPastWeek = normalizedWeekStart.getTime() < CURRENT_WEEK_TIME;

        // 2) читаем из LocalStorage и сразу показываем, если есть
        const { cached, key: storedKey } = readStoredWeekForEntity(entity, wkKey, normalizedWeekStart);
        if (cached?.byDate) {
            weekCacheRef.current.set(storedKey, { data: cached, savedAt: Date.now() });
            if (storedKey !== cacheKey) {
                weekCacheRef.current.set(cacheKey, { data: cached, savedAt: Date.now() });
            }
            markWeekLoaded(cacheKey);
            // Если надо применить к текущему экрану — рисуем немедленно
            if (applyToView) {
                setByDate(cached.byDate);
            }
        }

        // 3) политика "прошлые недели": если есть в LS и не force — ничего не запрашиваем
        if (isCurrentWeek) {
            hydrateStoredPastWeeks(entity);
        }

        if (!force && isPastWeek && cached?.byDate) {
            return { id: entity.id, cacheKey, from: "ls-past" };
        }

        // 4) защита от параллельных запросов одной и той же недели
        if (inflightRef.current.has(cacheKey)) {
            return inflightRef.current.get(cacheKey);
        }

        // 5) грузим из API и раскладываем по политике:
        //    - текущая неделя → обновляем состояние и ПИШЕМ в LS
        //    - будущие/прошлые (кроме случая 3) → только RAM (без LS)
        failedWeekKeysRef.current.delete(cacheKey);
        setCacheTick(t => t + 1);

        const p = (async () => {
            try {
                const fresh = await fetchWeekFromApi(entity, normalizedWeekStart);

                // если надо применить к текущему экрану — всегда берем свежий ответ API
                if (applyToView) {
                    setByDate(fresh.byDate);
                }
                // текущую реальную неделю всегда сохраняем после успешного ответа API
                if (isCurrentWeek && entity.type !== "person") {
                    lsSet(cacheKey, fresh);
                }

                // всегда держим в RAM-кэше актуальную версию
                weekCacheRef.current.set(cacheKey, { data: fresh, savedAt: Date.now() });
                markWeekLoaded(cacheKey);

                // 6) предзагрузка одной "недели назад" в RAM,
                //    но только когда грузим текущую реальную неделю
                if (isCurrentWeek) {
                    const prevStart = addDays(normalizedWeekStart, -7);
                    const prevWeekKey = weekKeyOf(prevStart);
                    const prevKey = scheduleCacheKey(entity, prevWeekKey);

                    // если прошлой недели нет в LS и она ещё не в RAM/не грузится — предзагрузим в RAM
                    const prevInLs = readStoredWeekForEntity(entity, prevWeekKey, prevStart).cached;
                    if (!prevInLs && !weekCacheRef.current.get(prevKey) && !inflightRef.current.get(prevKey)) {
                        const prevPromise = (async () => {
                            try {
                                const prevFresh = await fetchWeekFromApi(entity, prevStart);
                                weekCacheRef.current.set(prevKey, { data: prevFresh, savedAt: Date.now() });
                                markWeekLoaded(prevKey);
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
                const nextStart = addDays(normalizedWeekStart, 7);
                const nextKey = scheduleCacheKey(entity, weekKeyOf(nextStart));

                if (!weekCacheRef.current.get(nextKey) && !inflightRef.current.get(nextKey)) {
                    const nextPromise = (async () => {
                        try {
                            const nextFresh = await fetchWeekFromApi(entity, nextStart);
                            weekCacheRef.current.set(nextKey, { data: nextFresh, savedAt: Date.now() });
                            markWeekLoaded(nextKey);
                        } catch (e) {
                            console.warn("Не удалось предзагрузить следующую неделю:", e);
                        } finally {
                            inflightRef.current.delete(nextKey);
                        }
                    })();
                    inflightRef.current.set(nextKey, nextPromise);
                }

                return { id: entity.id, cacheKey, from: "network" };
            } catch (e) {
                markWeekFailed(cacheKey);
                throw e;
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
            if (sw) sw.slideTo(dir === "next" ? 2 : 0, 200); // 0=предыдущая, 2=следующая
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

    async function openTeacherScheduleByName(name) {
        const teacherName = String(name || "").trim();
        if (!teacherName) throw new Error("Не удалось определить преподавателя");

        const options = await fetchJSON(`${API_BASE}/search?term=${encodeURIComponent(teacherName)}&type=person&limit=20`);
        const exact = options.find((x) => String(x.label || "").trim().toLowerCase() === teacherName.toLowerCase());
        const picked = exact || options[0];
        const entity = normalizeEntity(picked, "person");
        if (!entity || entity.type !== "person") {
            throw new Error("Преподаватель не найден");
        }

        setByDate({});
        setLabel(entity.label);
        writeLastEntity(entity);

        const key = entityKey(entity);
        groupCacheRef.current.set(key, entity);
        setTerm(key);

        await loadWeekCached({
            entityOverride: entity,
            force: true,
            weekStartDate: anchorDate,
            applyToView: true
        });

        setSelectedDate(prev => sameWeekdayInWeek(anchorDate, prev));
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
            const entity = groupCacheRef.current.get(term);
            const loadedKey = entity ? scheduleCacheKey(entity, weekKeyOf(d)) : null;
            if (v === undefined && loadedKey && loadedWeekKeysRef.current.has(loadedKey)) {
                return [];
            }
            // если день ещё не успел приехать — вернём undefined (покажет лоадер), а не []
            return v === undefined ? undefined : v;
        }

        // иначе — ищем в RAM-кэше недели
        const entity = groupCacheRef.current.get(term);
        if (!entity) return undefined;

        const weekKey = weekKeyOf(d);
        const wkKey = scheduleCacheKey(entity, weekKey);
        const mem = weekCacheRef.current.get(wkKey);
        const memValue = mem?.data ?? mem; // на случай старого формата

        if (memValue?.byDate) {
            const v = memValue.byDate[kDash] ?? memValue.byDate[kDot];
            // если конкретный день ещё не подгружен — пусть будет undefined (покажет лоадер)
            return v === undefined ? [] : v;
        }

        // нет в RAM — пробуем LocalStorage (могло быть сохранено ранее)
        const { cached: cachedValue, key: storedKey } = readStoredWeekForEntity(entity, weekKey, d);
        if (cachedValue?.byDate) {
            weekCacheRef.current.set(wkKey, { data: cachedValue, savedAt: Date.now() });
            if (storedKey !== wkKey) {
                weekCacheRef.current.set(storedKey, { data: cachedValue, savedAt: Date.now() });
            }
            loadedWeekKeysRef.current.add(wkKey);
            const v = cachedValue.byDate[kDash] ?? cachedValue.byDate[kDot];
            return v === undefined ? [] : v;
        }

        // нигде нет — значит ещё грузится/будет грузиться
        return undefined; // важно: не [], чтобы DaySection показал «3 точки»
    }, [byDate, anchorDate, term, cacheTick]);

    const isLoadingFor = React.useCallback((d) => {
        const entity = groupCacheRef.current.get(term);
        if (!entity) return false;
        const wkKey = scheduleCacheKey(entity, weekKeyOf(d));
        return inflightRef.current.has(wkKey);
    }, [term, cacheTick]);

    const isApiFailedFor = React.useCallback((d) => {
        const entity = groupCacheRef.current.get(term);
        if (!entity) return false;
        const wkKey = scheduleCacheKey(entity, weekKeyOf(d));
        return failedWeekKeysRef.current.has(wkKey);
    }, [term, cacheTick]);

    useEffect(() => {
        if (!term) return;
        const vs = getVisibleWeekStart(selectedDate);
        loadWeekCached({ weekStartDate: vs, applyToView: true }).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [term, getVisibleWeekKey(selectedDate)]);

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
                        {label || "Введите группу или преподавателя"}
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
                    const entity = normalizeEntity(g);
                    if (!entity) return;

                    // 1) оптимистично чистим экран от старого расписания
                    setByDate({});
                    setLabel(entity.label);

                    // 2) фиксируем выбор
                    writeLastEntity(entity);

                    const key = entityKey(entity);
                    groupCacheRef.current.set(key, entity); // быстрый кэш
                    setTerm(key);

                    // 3) СРАЗУ грузим неделю именно для выбранного расписания
                    await loadWeekCached({
                        entityOverride: entity,
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
                renderDay={(d) => {
                    const isToday = isSameDay(d, now);
                    const nowMinutes = isToday ? (now.getHours() * 60 + now.getMinutes()) : null;
                    const lessons = getLessonsFor(d);
                    const apiRefreshing = isLoadingFor(d) && lessons !== undefined;
                    const apiFailed = !apiRefreshing && isApiFailedFor(d) && lessons !== undefined;

                    return (
                        <DaySection
                            date={d}
                            lessons={lessons}
                            onOpenTeacherSchedule={openTeacherScheduleByName}
                            // лоадер показываем, когда:
                            // 1) идёт загрузка текущей (якорной) недели — глобальный loading === true;
                            // 2) идёт точечная загрузка нужной недели (inflightRef) — isLoadingFor(d) === true.
                            loading={
                                lessons === undefined && (
                                    (loading && startOfWeek(d).getTime() === startOfWeek(anchorDate).getTime())
                                    || isLoadingFor(d)
                                )
                            }
                            apiRefreshing={apiRefreshing}
                            apiFailed={apiFailed}
                            nowMinutes={nowMinutes}
                        />
                    );
                }}
                onSwipeStart={onSwipeStart}
                onSwipeMove={onSwipeMove}
                onSwipeEnd={onSwipeEnd}
                onPullDownRefresh={refreshCurrentWeek}
                refreshing={loading}
            />
        </AppShell>
    );
}
