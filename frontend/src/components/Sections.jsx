import React, { useMemo, useRef, useEffect, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";

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
    onSwipeStart, onSwipeMove, onSwipeEnd
}) {
    const swiperRef = useRef(null);

    // const [activeIndex, setActiveIndex] = useState(1);
    // const [isAnimating, setIsAnimating] = useState(false);

    const lastIndexRef = useRef(0);       // последний известный индекс (для определения направления)
    const touchStartIndexRef = useRef(0); // индекс в момент касания (для отмены свайпа)

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
        const nextWeekFirst = addDays(weekDays[6], 1);  // понедельник следующей недели
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

    // const visiblePrev  = (isAnimating && activeIndex === 2) ? selectedDate : prevDate;
    // const visibleNext  = (isAnimating && activeIndex === 0) ? selectedDate : nextDate;
    // const visibleCenter = selectedDate;

    return (
        <main className="sections-swiper">
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
