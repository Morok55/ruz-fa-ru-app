import React from "react";
import { createPortal } from "react-dom";
import { FaCopy } from "react-icons/fa6";

function fmtDateHeader(d) {
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
function toPairUpper(s) {
    if (!s) return "";
    return s.toLocaleUpperCase("ru-RU");
}
function isoKey(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
}

export default function DaySection({ date, lessons, loading = false, nowMinutes = null }) {
    const [activeLesson, setActiveLesson] = React.useState(null);
    const [isSheetClosing, setIsSheetClosing] = React.useState(false);
    const [isSheetOpen, setIsSheetOpen] = React.useState(false);
    const [copyStatus, setCopyStatus] = React.useState("");

    const closeTimerRef = React.useRef(null);
    const copyTimerRef = React.useRef(null);

    function parseHMToMinutes(str) {
        if (!str) return null;
        const t = String(str).trim().replace(/\./g, ":");
        const [h, m] = t.split(":");
        const hh = Number(h);
        const mm = Number(m);
        if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
        return hh * 60 + mm;
    }

    const key = isoKey(date);

    const openLessonSheet = (lesson) => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
        setActiveLesson(lesson);
        setIsSheetClosing(false);
        setIsSheetOpen(false); // анимация открытия — класс добавим на следующем кадре
        setCopyStatus("");
    };

    const startCloseSheet = () => {
        if (!activeLesson) return;
        setIsSheetClosing(true);
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
        }
        closeTimerRef.current = setTimeout(() => {
            setActiveLesson(null);
            setIsSheetClosing(false);
            setIsSheetOpen(false);
            closeTimerRef.current = null;
        }, 260); // под анимацию
    };

    const handleCopyEmail = async (email) => {
        if (!email) return;
        let ok = false;

        if (navigator?.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(email);
                ok = true;
            } catch {
                ok = false;
            }
        }

        if (!ok) {
            window.prompt("Скопируйте почту:", email);
        }

        if (copyTimerRef.current) {
            clearTimeout(copyTimerRef.current);
        }
        setCopyStatus("Почта скопирована!");
        copyTimerRef.current = setTimeout(() => {
            setCopyStatus("");
            copyTimerRefRef = null;
        }, 2000);
    };

    // анимация открытия: после монтирования модалки вешаем is-open
    React.useEffect(() => {
        if (activeLesson) {
            requestAnimationFrame(() => setIsSheetOpen(true));
        } else {
            setIsSheetOpen(false);
        }
    }, [activeLesson]);

    React.useEffect(() => {
        return () => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        };
    }, []);

    return (
        <section className="day-section" data-day={key}>
            <div className="date-title">{fmtDateHeader(date)}</div>

            {(loading && (!lessons || lessons.length === 0)) ? (
                <div className="status loading-dots" aria-label="Загружаю" aria-live="polite">
                    <span></span><span></span><span></span>
                </div>
            ) : (!lessons || lessons.length === 0) ? (
                <div className="status">Нет занятий</div>
            ) : (
                lessons.map((l, idx) => {
                    const kindRaw = l.kindOfWork || l.lessonType || "Занятие";
                    const lower = String(kindRaw).toLowerCase();
                    const isSeminar = lower.includes("семинар") || lower.includes("практичес");
                    const kindLabel = isSeminar ? "СЕМИНАР" : toPairUpper(kindRaw);

                    const isForeign = l._isForeign ?? /иностран/i.test(l.discipline || "");

                    let minsLeft = null;
                    let isCurrent = false;
                    if (nowMinutes != null) {
                        const b = parseHMToMinutes(l.beginLesson);
                        const e = parseHMToMinutes(l.endLesson);
                        if (b != null && e != null && nowMinutes >= b && nowMinutes < e) {
                            isCurrent = true;
                            minsLeft = e - nowMinutes;
                        }
                    }

                    return (
                        <article
                            key={idx}
                            className={`card ${isCurrent ? "card--current" : ""}`}
                            data-left={isCurrent && minsLeft != null ? `до конца: ${minsLeft} мин.` : ""}
                            onClick={() => openLessonSheet(l)}
                        >
                            <div className="badge">
                                <span className={`dot ${isSeminar ? "dot-square" : ""}`} />
                                <span>{kindLabel}</span>
                                <span>•</span>
                                <span>{l._pairNo ?? (idx + 1)} пара</span>
                            </div>

                            <div className="subject">{l.discipline || "Дисциплина"}</div>

                            {Array.isArray(l._lines) && l._lines.length > 0 ? (
                                (l._isForeign ?? /иностран/i.test(l.discipline || "")) ? (
                                    l._lines.map(({ teacher, room }, i2) => (
                                        <div key={i2} className="subline">
                                            {[teacher, room].filter(Boolean).join(" — ")}
                                        </div>
                                    ))
                                ) : (
                                    l._lines.map(({ teacher, room }, i2) => (
                                        <React.Fragment key={i2}>
                                            {teacher ? <div className="subline">{teacher}</div> : null}
                                            {room ? <div className="subline">{room}</div> : null}
                                        </React.Fragment>
                                    ))
                                )
                            ) : (
                                (l._isForeign ?? /иностран/i.test(l.discipline || "")) ? (
                                    <div className="subline">
                                        {[
                                            (l.lecturer_title || l.lecturer_name || "").trim(),
                                            (l.auditorium || l.room || "").trim()
                                        ].filter(Boolean).join(" — ")}
                                    </div>
                                ) : (
                                    <>
                                        <div className="subline">{(l.lecturer_title || l.lecturer_name || "").trim()}</div>
                                        <div className="subline">{(l.auditorium || l.room || "").trim()}</div>
                                    </>
                                )
                            )}

                            <div className="time">
                                {[(l.beginLesson || "").trim(), (l.endLesson || "").trim()]
                                    .filter(Boolean)
                                    .join(" – ")}
                            </div>
                        </article>
                    );
                })
            )}

            {activeLesson && createPortal(
                (() => {
                    const isForeign = activeLesson._isForeign ?? /иностран/i.test(activeLesson.discipline || "");
                    const overlayClass = `teacher-sheet-overlay ${
                        isSheetClosing ? "is-closing" : (isSheetOpen ? "is-open" : "")
                    }`;

                    // ====== ОТДЕЛЬНОЕ МЕНЮ ДЛЯ ИНОСТРАННОГО ======
                    if (isForeign) {
                        const originalsRaw = Array.isArray(activeLesson._originals) && activeLesson._originals.length > 0
                            ? activeLesson._originals
                            : [activeLesson];

                        const seen = new Set();
                        const teachers = [];
                        for (const o of originalsRaw) {
                            const name = (o.lecturer_title || o.lecturer_name || "").trim();
                            let email = (o.lecturerEmail || o.lecturer_email || "").trim();

                            // иногда прилетает строка "null" — считаем это отсутствующей почтой
                            if (email.toLowerCase() === "null") email = "";

                            if (!name && !email) continue;

                            const key = `${name}|${email}`;
                            if (seen.has(key)) continue;
                            seen.add(key);

                            teachers.push({
                                name: name || "Преподаватель",
                                email,
                            });
                        }

                        const overlayClass = `teacher-sheet-overlay ${
                            isSheetClosing ? "is-closing" : (isSheetOpen ? "is-open" : "")
                        }`;

                        return (
                            <div
                                className={overlayClass}
                                onClick={startCloseSheet}
                            >
                                <div
                                    className="teacher-sheet"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="teacher-sheet-grabber" />
                                    <div className="teacher-sheet-body">
                                        <div className="teacher-sheet-name">
                                            {activeLesson.discipline || "Иностранный язык"}
                                        </div>

                                        <div className="teacher-sheet-foreign-list">
                                            {teachers.length === 0 ? (
                                                <div className="teacher-row-empty">
                                                    Нет информации о преподавателях
                                                </div>
                                            ) : teachers.map((t, idx) => (
                                                <div key={idx} className="teacher-row-card">
                                                    <div className="teacher-row-main">
                                                        <div className="teacher-row-name">
                                                            {t.name}
                                                        </div>
                                                        <div className="teacher-row-email">
                                                            {t.email || "Почта не указана"}
                                                        </div>
                                                    </div>

                                                    {t.email && (
                                                        <button
                                                            type="button"
                                                            className="teacher-copy-btn"
                                                            onClick={() => handleCopyEmail(t.email)}
                                                        >
                                                            <FaCopy />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {/* если хочешь оставить общий текст "Почта скопирована!" под списком */}
                                        {copyStatus && (
                                            <div className="sheet-copy-hint">
                                                {copyStatus}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // ====== Обычный предмет (один препод) ======
                    const name = (activeLesson.lecturer_title || activeLesson.lecturer_name || "").trim() || "Преподаватель";
                    const email = (activeLesson.lecturerEmail || activeLesson.lecturer_email || "").trim();

                    return (
                        <div
                            className={overlayClass}
                            onClick={startCloseSheet}
                        >
                            <div
                                className="teacher-sheet"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="teacher-sheet-grabber" />
                                <div className="teacher-sheet-body">
                                    <div className="teacher-sheet-name">{name}</div>
                                    <div className="teacher-sheet-email">
                                        {email || "Почта не указана"}
                                    </div>

                                    {email && (
                                        <button
                                            type="button"
                                            className="sheet-btn"
                                            onClick={() => handleCopyEmail(email)}
                                        >
                                            <FaCopy />
                                            <span>{copyStatus || "Скопировать почту"}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })(),
                document.body
            )}
        </section>
    );
}
