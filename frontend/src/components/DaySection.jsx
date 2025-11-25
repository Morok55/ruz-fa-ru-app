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

export default function DaySection({ date, lessons, loading = false, nowMinutes = null }) {
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

    return (
        <section className="day-section" data-day={key}>
            <div className="date-title">{fmtDateHeader(date)}</div>

            {(loading && (!lessons || lessons.length === 0)) ? (
                // состояние загрузки: показываем 3 точки
                <div className="status loading-dots" aria-label="Загружаю" aria-live="polite">
                    <span></span><span></span><span></span>
                </div>
            ) : (!lessons || lessons.length === 0) ? (
                // не загружаем и пар нет — показываем пустое состояние
                <div className="status">Нет занятий</div>
            ) : (
                lessons.map((l, idx) => {
                    // 1) нормализуем тип занятия...
                    const kindRaw = l.kindOfWork || l.lessonType || "Занятие";
                    const lower = String(kindRaw).toLowerCase();
                    const isSeminar = lower.includes("семинар") || lower.includes("практичес");
                    const kindLabel = isSeminar
                        ? "СЕМИНАР"
                        : toPairUpper(kindRaw);

                    // 2) foreign-флаг
                    const isForeign = l._isForeign ?? /иностран/i.test(l.discipline || "");

                    // 3) текущая пара?
                    let isCurrent = false;
                    if (nowMinutes != null) {
                        const b = parseHMToMinutes(l.beginLesson);
                        const e = parseHMToMinutes(l.endLesson);
                        if (b != null && e != null && nowMinutes >= b && nowMinutes < e) {
                            isCurrent = true;
                        }
                    }

                    return (
                        <article key={idx} className={`card ${isCurrent ? "card--current" : ""}`}>
                            <div className="badge">
                                <span className={`dot ${isSeminar ? "dot-square" : ""}`} />
                                <span>{kindLabel}</span>
                                <span>•</span>
                                <span>{l._pairNo ?? (idx + 1)} пара</span>
                            </div>

                            <div className="subject">{l.discipline || "Дисциплина"}</div>

                            {/* 3) вывод строк: для «Иностранного» — teacher — room, иначе на разных строках */}
                            {Array.isArray(l._lines) && l._lines.length > 0 ? (
                                isForeign ? (
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
                                // fallback, если _lines нет
                                isForeign ? (
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
        </section>
    );
}
