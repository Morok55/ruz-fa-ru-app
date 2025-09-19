import React, { useRef } from "react";

export default function WeekStrip({ weekDays, selectedDate, onSelectDay, dayLabels, onPrevWeek, onNextWeek }) {
    const touch = useRef({ x: 0, y: 0, t: 0, active: false });

    function onTouchStart(e) {
        const t = e.touches[0];
        touch.current = { x: t.clientX, y: t.clientY, t: Date.now(), active: true };
    }
    function onTouchEnd(e) {
        if (!touch.current.active) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touch.current.x;
        const dy = t.clientY - touch.current.y;
        const dt = Date.now() - touch.current.t;
        touch.current.active = false;

        // горизонтальный быстрый свайп
        const THRESHOLD = 40;   // px
        const MAX_ANGLE = 0.6;  // |dy/dx| — чтобы отсечь вертикальные жесты
        if (Math.abs(dx) > THRESHOLD && Math.abs(dy) / Math.abs(dx) < MAX_ANGLE && dt < 600) {
            if (dx < 0) onNextWeek?.(); else onPrevWeek?.();
        }
    }

    return (
        <div
            className="week-strip"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            {weekDays.map((d, i) => {
                const isToday = new Date().toDateString() === d.toDateString();
                const isActive = selectedDate.toDateString() === d.toDateString();
                return (
                    <button
                        key={i}
                        type="button"
                        className={`day-pill${isToday ? " today" : ""}${isActive ? " active" : ""}`}
                        onClick={() => onSelectDay(d)}
                        title="Показать расписание на день"
                    >
                        {dayLabels[i]}
                        <span className="num">{d.getDate()}</span>
                    </button>
                );
            })}
        </div>
    );
}
