import React from "react";

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

export default function DaySection({ date, lessons }) {
    const key = isoKey(date);
    return (
        <section className="day-section" data-day={key}>
            <div className="date-title">{fmtDateHeader(date)}</div>

            {!lessons || lessons.length === 0 ? (
                <div className="status">Нет занятий</div>
            ) : (
                lessons.map((l, idx) => (
                    <article key={idx} className="card">
                        <div className="badge">
                            <span className="dot" />
                            <span>{toPairUpper(l.kindOfWork || l.lessonType || "Занятие")}</span>
                            <span>•</span>
                            {/* ВАЖНО: число пары берём из _pairNo, которое уже вычислено в App.js по времени */}
                            <span>{l._pairNo ?? (idx + 1)} пара</span>
                        </div>

                        <div className="subject">{l.discipline || "Дисциплина"}</div>

                        {/* Если есть склеенные строки с преподами/аудиториями — выводим их списком */}
                        {Array.isArray(l._lines) && l._lines.length > 0 ? (
                            l._lines.map((line, i2) => (
                                <div key={i2} className="subline">{line}</div>
                            ))
                        ) : (
                            <>
                                <div className="subline">{(l.lecturer || l.lecturer_name || "").trim()}</div>
                                <div className="subline">
                                    {[(l.building || "").trim(), (l.auditorium || l.room || "").trim()]
                                        .filter(Boolean)
                                        .join("/")}
                                </div>
                            </>
                        )}

                        <div className="time">
                            {[(l.beginLesson || "").trim(), (l.endLesson || "").trim()]
                                .filter(Boolean)
                                .join(" – ")}
                        </div>
                    </article>
                ))
            )}
        </section>
    );
}
