import React, { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "./components/AppShell.jsx";
import WeekStrip from "./components/WeekStrip.jsx";
import Sections from "./components/Sections.jsx";
import DaySection from "./components/DaySection.jsx";

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
        setLoading(true);
        setStatus("Ищу группу…");
        try {
            const { id, label: lbl } = await resolveGroupCached(term);
            setLabel(lbl);

            const wkKey = weekKeyOf(weekStartDate);
            const cacheKey = `${id}::${wkKey}`;
            if (!force && weekCacheRef.current.has(cacheKey)) {
                const cached = weekCacheRef.current.get(cacheKey);
                setByDate(cached.byDate);
                setStatus("");
                return { id, cacheKey };
            }

            setStatus(`Загружаю неделю…`);
            const start = fmtRuz(weekStartDate);
            const finish = fmtRuz(addDays(weekStartDate, 6));
            const lessons = await fetchJSON(
                `${API_BASE}/schedule/group/${id}?start=${start}&finish=${finish}&lng=1`
            );
            console.log(lessons)  // УДАЛИТЬ

            const tmp = {};
            for (const l of lessons) {
                const d = parseRuzDate(l.date);
                if (!d) continue;
                const key = isoKey(d);
                if (!tmp[key]) tmp[key] = [];
                tmp[key].push(l);
            }
            Object.keys(tmp).forEach((k) => {
                tmp[k] = mergeDayLessons(tmp[k]);
            });

            weekCacheRef.current.set(cacheKey, { byDate: tmp, fetchedAt: Date.now() });
            setByDate(tmp);
            setStatus("");
            return { id, cacheKey };
        } catch (e) {
            console.error(e);
            setStatus("Ошибка: " + e.message);
            throw e;
        } finally {
            setLoading(false);
        }
    }

    async function showDay(dateObj) {
        if (!term) return;

        const oldStart = startOfWeek(selectedDate);
        const newStart = startOfWeek(dateObj);

        setSelectedDate(dateObj);

        if (isoKey(oldStart) === isoKey(newStart)) {
            // та же неделя — просто убедимся, что данные недели подгружены
            try { await loadWeekCached({ weekStartDate: newStart }); } catch {}
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
            setSelectedDate(new Date());
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [term]);

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
                <input
                    className="input"
                    placeholder="Группа"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                />
                <button className="button" disabled={loading}>
                    {loading ? "Загрузка…" : "Обновить"}
                </button>
            </form>

            <WeekStrip
                weekDays={weekDays}
                selectedDate={selectedDate}
                onSelectDay={showDay}
                dayLabels={daysRuShort}
                onPrevWeek={goPrevWeek}
                onNextWeek={goNextWeek}
                onReady={(sw) => (weekSwiperRef.current = sw)}
            />
        </header>
    );

    const datesToRender = [selectedDate];

    return (
        <AppShell header={header}>
            <Sections
                selectedDate={selectedDate}
                onPrevDay={() => showDay(addDays(selectedDate, -1))}
                onNextDay={() => showDay(addDays(selectedDate,  1))}
                renderDay={(d) => (
                    <DaySection date={d} lessons={getLessonsFor(d)} />
                )}
            />
        </AppShell>
    );
}
