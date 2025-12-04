import React from "react";
import LessonModal from "./LessonModal";

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
        setActiveLesson(lesson);
    };

    const closeLessonSheet = () => {
        setActiveLesson(null);
    };

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

            {/* Модалка в отдельном компоненте */}
            <LessonModal lesson={activeLesson} onClose={closeLessonSheet} />
        </section>
    );
}
