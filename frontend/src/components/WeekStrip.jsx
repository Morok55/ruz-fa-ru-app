import React, { useMemo, useRef, useEffect, useState, useLayoutEffect, useCallback } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";

/**
 * Пропсы:
 * - weekDays: массив 7 Date (текущая неделя)
 * - selectedDate: выбранная дата
 * - onSelectDay: (Date) => void
 * - dayLabels: ["пн","вт",...]
 * - onPrevWeek / onNextWeek: колбэки смены недели
 */
export default function WeekStrip({
    weekDays,
    selectedDate,
    onSelectDay,
    dayLabels,
    onPrevWeek,
    onNextWeek,
    onReady,
    bindDaySwipeProgress
}) {
    const swiperRef = useRef(null);
    
    const gridRef = useRef(null);                // .week-grid из центрального слайда
    const pillRefs = useRef(Array(7).fill(null)); // refs на 7 кнопок в центральной неделе

    useEffect(() => {
        pillRefs.current = Array(7).fill(null);
    }, [weekDays]);

    const ghostRef = useRef(null);
    const dragRef = useRef({
        active: false,
        gridRect: null,
        fromRect: null,
        leftRect: null,   // к предыдущему дню
        rightRect: null,  // к следующему дню
        lastP: 0,
        awaitingWeekSnap: false,
    });

    dragRef.current.lastP = 0; // -1..1, знак = направление

    const raf = () => new Promise(requestAnimationFrame);
    // ждём два кадра, чтобы Swiper успел дорисовать новый слайд
    async function nextFrames(n = 2) {
        for (let i = 0; i < n; i++) await raf();
    }

    // внешняя привязка lifecycle свайпа дня
    useEffect(() => {
        if (!bindDaySwipeProgress) return;

        const start = () => {
        const grid = gridRef.current;
        const idx = weekDays.findIndex(d => d.toDateString() === selectedDate.toDateString());
        if (!grid || idx < 0) return;

        const pills = pillRefs.current;
        dragRef.current.gridRect  = grid.getBoundingClientRect();
        dragRef.current.fromRect  = pills[idx]?.getBoundingClientRect() || null;
        dragRef.current.leftRect  = pills[Math.max(0, idx - 1)]?.getBoundingClientRect()  || dragRef.current.fromRect;
        dragRef.current.rightRect = pills[Math.min(6, idx + 1)]?.getBoundingClientRect() || dragRef.current.fromRect;

        dragRef.current.active = true;
        dragRef.current.lastP  = 0;

        // во время перетягивания — отключаем CSS-транзишны для максимальной отзывчивости
        ghostRef.current?.classList.add("no-tr");
    };

    const move = (p) => {
        if (!dragRef.current.active) return;
        dragRef.current.lastP = p;

        const t = Math.min(1, Math.abs(p));
        const from = dragRef.current.fromRect;
        const to   = p < 0 ? dragRef.current.rightRect : dragRef.current.leftRect;
        if (!from || !to) return;

        const lerp = (a,b,t)=>a+(b-a)*t;
        applyGhost({
            left:   lerp(from.left,   to.left,   t),
            top:    lerp(from.top,    to.top,    t),
            width:  lerp(from.width,  to.width,  t),
            height: lerp(from.height, to.height, t),
        });
    };

    const end = (committed, dir) => {
        const el = ghostRef.current;
        el?.classList.remove("no-tr");

        const grid = gridRef.current;
        const idx = weekDays.findIndex(d => d.toDateString() === selectedDate.toDateString());
        const from = dragRef.current.fromRect;
        if (!grid || !from || idx < 0) { dragRef.current.active = false; return; }

        // Определяем «краевой» кейс: вс→пн (next) или пн→вс (prev)
        const edgeNext = committed && dir === "next" && idx === 6;
        const edgePrev = committed && dir === "prev" && idx === 0;
        const edgeCross = edgeNext || edgePrev;

        if (!committed) {
            // свайп отменён — вернуться к исходной кнопке
            applyGhost(from);
            dragRef.current.active = false;
            dragRef.current.awaitingWeekSnap = false;
            return;
        }

        if (edgeCross) {
            // ждём новую неделю → призрак скрыт и без transition
            dragRef.current.awaitingWeekSnap = true;
            const el = ghostRef.current;
            if (el) {
                el.classList.add("no-tr");
                el.style.opacity = "0";
            }
            dragRef.current.active = false;
            return;
        }

        // обычный соседний день внутри этой недели — доехать к цели
        let to = from;
        if (dir === "next")      to = dragRef.current.rightRect || from;
        else if (dir === "prev") to = dragRef.current.leftRect  || from;

        applyGhost(to);
        dragRef.current.active = false;
        dragRef.current.awaitingWeekSnap = false;
    };

    bindDaySwipeProgress({ start, move, end });
    }, [bindDaySwipeProgress, weekDays, selectedDate]);

    function moveGhostToIndex(i) {
        const grid = gridRef.current;
        const btn  = pillRefs.current[i];
        if (!grid || !btn) return;
        dragRef.current.gridRect = grid.getBoundingClientRect();
        applyGhost(btn.getBoundingClientRect());
    }

    const applyGhost = (rect, { instant = false, visible = true } = {}) => {
        const el = ghostRef.current;
        const g  = dragRef.current.gridRect;
        if (!el || !g || !rect) return;
        const x = rect.left - g.left;
        const y = rect.top  - g.top;

        if (instant) el.classList.add("no-tr");
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.width  = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
        el.style.opacity = visible ? "1" : "0";
        if (instant) requestAnimationFrame(() => el.classList.remove("no-tr"));
    };

    const handlePillClick = (date, idx, el) => {
        const gridEl = el?.closest?.(".week-grid");
        const isCentral = gridRef.current && gridEl === gridRef.current;

        if (isCentral) {
            // Клик внутри центральной недели → запустим КРАСИВУЮ анимацию
            const ghost = ghostRef.current;
            const grid  = gridRef.current;
            if (!ghost || !grid) {
                onSelectDay?.(date, idx);
                return;
            }

            // базовые измерения
            dragRef.current.gridRect = grid.getBoundingClientRect();
            const target = el.getBoundingClientRect();

            // включаем CSS-переходы
            ghost.classList.remove("no-tr");

            // если призрак ещё не стоял — мгновенно поставим его на текущую активную пилюлю
            if (!ghost.style.transform) {
                const currIdx = weekDays.findIndex(d => d.toDateString() === selectedDate.toDateString());
                const currEl  = pillRefs.current[currIdx];
                if (currEl) {
                    applyGhost(currEl.getBoundingClientRect(), { instant: true, visible: true });
                }
            }

            // на следующий кадр — плавно переезжаем к целевой пилюле и выбираем день
            requestAnimationFrame(() => {
                applyGhost(target, { instant: false, visible: true });
                onSelectDay?.(date, idx);
            });

            // для клика внутри недели НИЧЕГО не ждём от week-snap
            dragRef.current.awaitingWeekSnap = false;
            return;
        }

        // Клик в левой/правой сетке (соседние недели) — поведение как раньше
        if (gridEl) {
            dragRef.current.gridRect = gridEl.getBoundingClientRect();
            dragRef.current.awaitingWeekSnap = true; // ждём смены недели и центрирования
            applyGhost(el.getBoundingClientRect(), { instant: true, visible: true });
        }
        onSelectDay?.(date, idx);
    };

    // утилиты локально
    const addDays = (date, n) => {
        const d = new Date(date);
        d.setDate(d.getDate() + n);
        return d;
    };
    const makeWeek = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

    // считаем соседние недели заранее
    const prevDays = useMemo(() => makeWeek(addDays(weekDays[0], -7)), [weekDays]);
    const nextDays = useMemo(() => makeWeek(addDays(weekDays[0],  7)), [weekDays]);

    // после смены недели снаружи — удерживаем карусель в центре (слайд 1)
    useEffect(() => {
        const sw = swiperRef.current;
        if (sw && sw.activeIndex !== 1) {
            sw.slideTo(1, 0); // без анимации
        }
    }, [weekDays]);

    useLayoutEffect(() => {
        (async () => {
            const idx = weekDays.findIndex(d => d.toDateString() === selectedDate.toDateString());
            const el  = ghostRef.current;
            const grid = gridRef.current;

            if (!el || !grid || idx < 0) {
                // нечего показывать
                if (el) {
                    el.classList.add("no-tr");
                    el.style.opacity = "0";
                }
                dragRef.current.awaitingWeekSnap = false;
                return;
            }

            // если ждём «щелчка» после смены недели — дождёмся стабилизации layout
            if (dragRef.current.awaitingWeekSnap) {
                await nextFrames(2); // дать Swiper дорисовать центральный слайд и сетку
            }

            // обновляем измерения
            const btn = pillRefs.current[idx];
            if (!btn) return;

            dragRef.current.gridRect = grid.getBoundingClientRect();
            const rect = btn.getBoundingClientRect();

            if (dragRef.current.awaitingWeekSnap) {
                // мгновенно ставим призрак на место, показываем, и ТОЛЬКО потом включаем transition
                el.classList.add("no-tr");
                applyGhost(rect, { instant: false, visible: true });
                dragRef.current.awaitingWeekSnap = false;
                await raf(); // 1 кадр — чтобы браузер зафиксировал финальную позицию
                el.classList.remove("no-tr"); // теперь можно снова анимировать будущие движения
            } else {
                // обычный случай (клик внутри недели и т.п.)
                applyGhost(rect);
            }
        })();
    }, [weekDays, selectedDate]);

    function handleSlideChangeTransitionEnd(sw) {
        // Анимация уже завершилась (плавно доехали до края).
        if (sw.activeIndex === 0) {
            onPrevWeek?.();   // просим родителя обновить неделю (теперь текущая = предыдущая)
            // Возврат в центр сделаем после обновления данных (см. useEffect ниже).
        } else if (sw.activeIndex === 2) {
            onNextWeek?.();   // просим родителя обновить неделю (теперь текущая = следующая)
        }
    }

    return (
        <div className="week-strip-swiper">
            <Swiper
                onSwiper={(sw) => {
                    swiperRef.current = sw;
                    onReady?.(sw);
                }}
                onSlideChangeTransitionEnd={handleSlideChangeTransitionEnd}  // <-- меняем событие
                initialSlide={1}
                slidesPerView={1}
                spaceBetween={32}
                resistanceRatio={0.85}
                allowTouchMove={true}
                longSwipesRatio={0.15}
                speed={260}
                simulateTouch={true}
                threshold={5}
            >
                <SwiperSlide>
                    <WeekGrid
                        days={prevDays}
                        selectedDate={selectedDate}
                        onSelectDay={onSelectDay}
                        dayLabels={dayLabels}
                        onPillClick={handlePillClick}
                    />
                </SwiperSlide>

                <SwiperSlide>
                    <WeekGrid
                        days={weekDays}
                        selectedDate={selectedDate}
                        onSelectDay={onSelectDay}
                        dayLabels={dayLabels}
                        gridRef={gridRef}
                        getPillRef={(i) => (el) => (pillRefs.current[i] = el)}
                        onPillClick={handlePillClick}
                    />
                </SwiperSlide>

                <SwiperSlide>
                    <WeekGrid
                        days={nextDays}
                        selectedDate={selectedDate}
                        onSelectDay={onSelectDay}
                        dayLabels={dayLabels}
                        onPillClick={handlePillClick}
                    />
                </SwiperSlide>
                <div ref={ghostRef} className="pill-ghost" aria-hidden="true" />
            </Swiper>
        </div>
    );
}

function WeekGrid({ days, selectedDate, onSelectDay, dayLabels, gridRef, getPillRef, onPillClick }) {
    return (
        <div className="week-grid" ref={gridRef}>
            {days.map((d, i) => {
                const isToday = new Date().toDateString() === d.toDateString();
                const isActive = selectedDate.toDateString() === d.toDateString();
                return (
                    <button
                        key={i}
                        ref={getPillRef ? getPillRef(i) : undefined}
                        type="button"
                        className={`day-pill${isToday ? " today" : ""}${isActive ? " active" : ""}`}
                        onClick={(e) => {
                            onPillClick?.(d, i, e.currentTarget);
                            onSelectDay(d, i);
                        }}
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
