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
                lessons.map((l, idx) => {
                    // 1) нормализуем тип занятия: «Практические (семинарские) занятия» -> СЕМИНАР
                    const kindRaw = l.kindOfWork || l.lessonType || "Занятие";
                    const lower = String(kindRaw).toLowerCase();
                    const kindLabel = (lower.includes("практичес") && lower.includes("семинар"))
                        ? "СЕМИНАР"
                        : toPairUpper(kindRaw);

                    // 2) определяем foreign-флаг на случай, если не пришёл из merge
                    const isForeign = l._isForeign ?? /иностран/i.test(l.discipline || "");

                    return (
                        <article key={idx} className="card">
                            <div className="badge">
                                <span className="dot" />
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
                                            (l.lecturer || l.lecturer_name || "").trim(),
                                            (l.auditorium || l.room || "").trim()
                                        ].filter(Boolean).join(" — ")}
                                    </div>
                                ) : (
                                    <>
                                        <div className="subline">{(l.lecturer || l.lecturer_name || "").trim()}</div>
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
