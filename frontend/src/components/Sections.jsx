import React, { useMemo, useRef, useEffect, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";

/**
 * Пропсы:
 * - selectedDate: Date — текущий выбранный день
 * - renderDay: (date: Date) => ReactNode — рендерит <DaySection ... />
 * - onPrevDay: () => void — перейти на предыдущий день
 * - onNextDay: () => void — перейти на следующий день
 * - gapPx?: number — расстояние между слайдами (по умолчанию 32)
 */
export default function Sections({
    selectedDate,
    weekDays,                 // массив из 7 дат текущей недели
    renderDay,
    onSelectDay,              // (date: Date) => void — выбрать день по индексу слайдера
    onPrevDay,
    onNextDay,
    gapPx = 32,
    onSwipeStart, onSwipeMove, onSwipeEnd,
    onPullDownRefresh,
    refreshing
}) {
    const swiperRef = useRef(null);

    const lastIndexRef = useRef(0);       // последний известный индекс (для определения направления)
    const touchStartIndexRef = useRef(0); // индекс в момент касания (для отмены свайпа)

    // PTR (pull-to-refresh)
    const ptrStartX = useRef(0);
    const ptrStartY = useRef(0);
    const ptrActive = useRef(false);
    const [pullPx, setPullPx] = useState(0);     // текущий сдвиг кружка
    const [ptrAnimate, setPtrAnimate] = useState(false); // включить transition на отпускании
    const [ptrSpin, setPtrSpin] = useState(false); // крутить иконку (только для PTR)
    const pullPxRef = useRef(0);
    useEffect(() => { pullPxRef.current = pullPx; }, [pullPx]);

    // настройки жеста
    // сколько нужно «утащить», чтобы вообще ПОКАЗАТЬ кружок (до этого он скрыт)
    const PULL_SHOW = 50;          // px видимого смещения до первого показа
    // сколько нужно утащить ПОСЛЕ показа, чтобы сработал refresh (сложнее вытащить)
    const PULL_TRIGGER = 70;       // px видимого смещения до триггера
    // максимальное видимое смещение (дальше — резинка)
    const PULL_MAX = 95;          // px
    const PULL_SNAP = 44;          // фиксация пузырька при refresh
    const VERTICAL_RATIO = 3;    // насколько жест должен быть «вертикальным»
    const pullAngle = (Math.min(1, pullPx / PULL_MAX) * 300);     // угол поворота по ходу жеста (0..-300deg)
    // минимум 1 секунда удержания кружка после успешного PTR
    const ptrHoldUntilRef = useRef(0);
    const ptrHoldTimerRef = useRef(null);

    // этот реф отмечает, что refresh запущен ИМЕННО жестом pull-to-refresh
    const ptrOwnRefresh = useRef(false);

    // PTR разрешён только если активный день прокручен к началу (scrollTop === 0)
    const ptrAllowedRef = useRef(false);

    // понадобится ref на корневой контейнер, чтобы искать активный день
    const containerRef = useRef(null);

    const addDays = (date, n) => {
        const d = new Date(date);
        d.setDate(d.getDate() + n);
        return d;
    };

    const sameDay = (a, b) =>
        a && b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    const extendedDays = useMemo(() => {
        if (!Array.isArray(weekDays) || weekDays.length !== 7) return [];
        const prevWeekLast = addDays(weekDays[0], -1);   // воскресенье прошлой недели
        const nextWeekFirst = addDays(weekDays[6], 1);   // понедельник следующей недели
        return [prevWeekLast, ...weekDays, nextWeekFirst];
    }, [weekDays]);

    const selectedIndex = useMemo(() => {
        if (!Array.isArray(extendedDays) || extendedDays.length === 0) return 0;
        const idx = extendedDays.findIndex(d => sameDay(d, selectedDate));
        // если выбранный день точно в текущей неделе — это будет индекс 1..7
        // если его нет (редкий случай) — по умолчанию ставим на понедельник недели (index=1)
        return idx >= 0 ? idx : 1;
    }, [extendedDays, selectedDate]);

    // После смены дня снаружи — держим слайдер в центре (index=1)
    useEffect(() => {
        const sw = swiperRef.current;
        if (sw && typeof selectedIndex === "number" && sw.activeIndex !== selectedIndex) {
            sw.slideTo(selectedIndex, 0); // без анимации
        }
        lastIndexRef.current = selectedIndex;
    }, [selectedDate]);

    useEffect(() => {
        if (refreshing) {
            if (ptrOwnRefresh.current) {
                setPtrAnimate(true);
                setPullPx(PULL_SNAP);
                // ptrSpin уже включён на отпускании — оставляем
            } else {
                // «чужая» загрузка — кружок не трогаем
                setPtrSpin(false);
                setPullPx(0);
            }
        } else {
            if (ptrOwnRefresh.current) {
                setPtrAnimate(true);
                const now = Date.now();
                const remain = Math.max(0, ptrHoldUntilRef.current - now); // сколько осталось до 1s

                // если сеть ответила раньше — досидим до конца «минимума»
                if (ptrHoldTimerRef.current) clearTimeout(ptrHoldTimerRef.current);
                ptrHoldTimerRef.current = setTimeout(() => {
                    setPullPx(0);
                    setPtrSpin(false);
                    ptrOwnRefresh.current = false;
                    ptrHoldUntilRef.current = 0;
                    ptrHoldTimerRef.current = null;
                }, remain || 90);
                return () => {
                    if (ptrHoldTimerRef.current) {
                        clearTimeout(ptrHoldTimerRef.current);
                        ptrHoldTimerRef.current = null;
                    }
                };
            } else {
                setPtrSpin(false);
                setPullPx(0);
            }
        }
    }, [refreshing]);

    return (
        <main
            ref={containerRef}
            className="sections-swiper"
            onTouchStart={(e) => {
                if (refreshing) return; // пока грузимся — не стартуем новый жест
                const t = e.touches?.[0];
                if (!t) return;

                // проверяем: активный день прокручен в самый верх?
                let atTop = false;
                try {
                    const root = containerRef.current;
                    const activeDay = root?.querySelector(".swiper-slide-active .day-section");
                    atTop = !!activeDay && (activeDay.scrollTop <= 0);
                } catch (_) { /* no-op */ }
                ptrAllowedRef.current = atTop;

                ptrStartX.current = t.pageX;
                ptrStartY.current = t.pageY;
                ptrActive.current = true;
                ptrOwnRefresh.current = false;
                setPtrAnimate(false);   // во время перетягивания — без transition
                setPullPx(0);
            }}
            onTouchMove={(e) => {
                if (!ptrActive.current || refreshing) return;
                if (!ptrAllowedRef.current) return;

                // если в процессе пользователь всё-таки проскроллил контент — PTR отменяем
                try {
                    const root = containerRef.current;
                    const activeDay = root?.querySelector(".swiper-slide-active .day-section");
                    if (activeDay && activeDay.scrollTop > 0) return;
                } catch (_) {}

                const t = e.touches?.[0];
                if (!t) return;
                const dx = t.pageX - ptrStartX.current;
                const dy = t.pageY - ptrStartY.current;

                // требуем явную вертикальность
                if (Math.abs(dx) > Math.abs(dy) * VERTICAL_RATIO) return;

                if (dy > 0) {
                    // «мертвая зона» до первого показа кружка
                    if (dy < PULL_SHOW) { setPullPx(0); return; }

                    // считаем видимое смещение после мертвой зоны
                    const dyEff = dy - PULL_SHOW;

                    // резинка после PULL_MAX: чем дальше тянешь, тем тяжелее
                    const damp = (dyEff <= PULL_MAX)
                        ? dyEff
                        : PULL_MAX + (dyEff - PULL_MAX) * 0.22;

                    setPullPx(Math.min(PULL_MAX + 60, damp));
                }
            }}
            onTouchEnd={() => {
                if (!ptrActive.current) return;
                ptrActive.current = false;

                // если список не был вверху — это обычный скролл, PTR не трогаем
                if (!ptrAllowedRef.current) {
                    setPtrAnimate(false);
                    setPullPx(0);
                    setPtrSpin(false);
                    return;
                }

                setPtrAnimate(true);

                // берём актуальное значение потяга
                const pulled = pullPxRef.current;

                // не дотянули — аккуратно спрятать
                if (pulled < PULL_TRIGGER || refreshing) {
                    setPullPx(0);
                    setPtrSpin(false);
                    return;
                }

                // дотянули → фиксируем пузырёк и запускаем refresh как PTR
                ptrOwnRefresh.current = true;
                setPullPx(PULL_SNAP);
                setPtrSpin(true);

                // зафиксировать «не раньше чем через 1s можно спрятать»
                ptrHoldUntilRef.current = Date.now() + 1000;

                requestAnimationFrame(() => {
                    onPullDownRefresh?.();
                });
            }}
        >
            <div
                className={`ptr ${ptrAnimate ? "ptr-animate" : ""} ${ptrSpin ? "is-refreshing" : ""} ${pullPx > 0 ? "is-visible" : ""}`}
                style={{ transform: `translateY(${pullPx}px)` }}
                aria-hidden="true"
            >
                <div className="ptr-bubble">
                {/* Ротор крутим только пока тянем пальцем; в режиме спина он статичен */}
                <div
                    className="ptr-rotor"
                    style={{ transform: ptrSpin ? undefined : `rotate(${pullAngle}deg)` }}
                >
                    {ptrSpin ? (
                        // РЕЖИМ ОБНОВЛЕНИЯ: бегущая линия по кругу (без стрелки)
                        <svg className="ptr-ring" viewBox="0 0 40 40" width="22" height="22" aria-hidden="true">
                            <circle cx="20" cy="20" r="14" className="ptr-ring-track" />
                            <circle cx="20" cy="20" r="14" className="ptr-ring-dash" />
                        </svg>
                    ) : (
                        // РЕЖИМ ПЕРЕТЯГИВАНИЯ: твоя стрелка
                        <div className="ptr-icon-wrap">
                            <svg className="ptr-icon-svg" viewBox="0 0 28 28" width="20" height="20" aria-hidden="true"
                            >
                                <path fill="currentColor"
                                    d="M22,16c0,4.41-3.586,8-8,8s-8-3.59-8-8s3.586-8,8-8l2.359,0.027l-1.164,1.164l2.828,2.828
                                    L24.035,6l-6.012-6l-2.828,2.828L16.375,4H14C7.375,4,2,9.371,2,16s5.375,12,12,12s12-5.371,12-12H22z"
                                />
                            </svg>
                        </div>
                    )}
                </div>
            </div>
            </div>

            <Swiper
                onSwiper={(sw) => (swiperRef.current = sw)}
                onTouchStart={(sw) => {
                    touchStartIndexRef.current = sw.activeIndex ?? 0;
                    onSwipeStart?.();
                }}
                onSliderMove={(sw) => {
                    const dx = sw.touches?.diff ?? 0;
                    const w  = sw.width || 1;
                    let p = dx / w; if (p < -1) p = -1; if (p > 1) p = 1;
                    onSwipeMove?.(p);
                }}
                onTouchEnd={(sw) => {
                    // свайп отменён, если индекс не изменился
                    if ((sw.activeIndex ?? 0) === touchStartIndexRef.current) {
                        onSwipeEnd?.(false);
                    }
                }}

                onSlideChangeTransitionStart={(sw) => {
                    const curr = sw.activeIndex ?? 0;
                    const prev = lastIndexRef.current ?? curr;
                    const dir = curr < prev ? "prev" : (curr > prev ? "next" : undefined);
                    if (dir) onSwipeEnd?.(true, dir);
                }}
                onSlideChangeTransitionEnd={(sw) => {
                    const curr = sw.activeIndex ?? 0;
                    lastIndexRef.current = curr;

                    if (Array.isArray(extendedDays) && extendedDays.length > 0) {
                        const idx = Math.max(0, Math.min(curr, extendedDays.length - 1));
                        const date = extendedDays[idx];
                        onSelectDay?.(date);
                    } else {
                        // fallback
                        if (curr === 0) onPrevDay?.();
                        else if (curr === 2) onNextDay?.();
                    }
                }}

                initialSlide={selectedIndex}
                slidesPerView={1}
                spaceBetween={gapPx}
                resistanceRatio={0.85}
                speed={260}
                simulateTouch
                threshold={5}
            >
                {Array.isArray(extendedDays) && extendedDays.length > 0 ? (
                    extendedDays.map((d) => (
                        <SwiperSlide key={`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`}>
                            {renderDay(d)}
                        </SwiperSlide>
                    ))
                ) : (
                    // fallback на случай, если weekDays не передали
                    <>
                        <SwiperSlide>{renderDay(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1))}</SwiperSlide>
                        <SwiperSlide>{renderDay(selectedDate)}</SwiperSlide>
                        <SwiperSlide>{renderDay(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1))}</SwiperSlide>
                    </>
                )}
            </Swiper>
        </main>
    );
}
