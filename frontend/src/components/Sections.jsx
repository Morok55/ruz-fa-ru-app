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
    renderDay,
    onPrevDay,
    onNextDay,
    gapPx = 32,
    onSwipeStart, onSwipeMove, onSwipeEnd
}) {
    const swiperRef = useRef(null);

    const [activeIndex, setActiveIndex] = useState(1);
    const [isAnimating, setIsAnimating] = useState(false);

    const addDays = (date, n) => {
        const d = new Date(date);
        d.setDate(d.getDate() + n);
        return d;
    };

    const prevDate = useMemo(() => addDays(selectedDate, -1), [selectedDate]);
    const nextDate = useMemo(() => addDays(selectedDate,  1), [selectedDate]);

    // После смены дня снаружи — держим слайдер в центре (index=1)
    useEffect(() => {
        const sw = swiperRef.current;
        if (sw && sw.activeIndex !== 1) {
            sw.slideTo(1, 0); // без анимации
        }
        setActiveIndex(1);
        setIsAnimating(false);
    }, [selectedDate]);

    const visiblePrev  = (isAnimating && activeIndex === 2) ? selectedDate : prevDate;
    const visibleNext  = (isAnimating && activeIndex === 0) ? selectedDate : nextDate;
    const visibleCenter = selectedDate;

    return (
        <main className="sections-swiper">
            <Swiper
                onSwiper={(sw) => (swiperRef.current = sw)}
                onTouchStart={() => onSwipeStart?.()}
                onSliderMove={(sw) => {
                    const dx = sw.touches?.diff ?? 0;
                    const w  = sw.width || 1;
                    let p = dx / w; if (p < -1) p = -1; if (p > 1) p = 1;
                    onSwipeMove?.(p);
                }}
                onTouchEnd={(sw) => {
                    // если не произошло сдвига на 0/2 — свайп отменён
                    if (sw.activeIndex === 1) onSwipeEnd?.(false);
                }}

                onSlideChangeTransitionStart={(sw) => {
                    setIsAnimating(true);
                    setActiveIndex(sw.activeIndex);

                    if (sw.activeIndex === 0) {
                        onSwipeEnd?.(true, "prev");
                    } else if (sw.activeIndex === 2) {
                        onSwipeEnd?.(true, "next");
                    }
                }}
                onSlideChangeTransitionEnd={(sw) => {
                    // Сначала сообщаем наружу о смене дня (стейт selectedDate поменяется),
                    // но до повторного центрирования мы держим isAnimating=true и знаем activeIndex.
                    if (sw.activeIndex === 0) {
                        onPrevDay?.();
                    } else if (sw.activeIndex === 2) {
                        onNextDay?.();
                    }
                    // здесь НЕ сбрасываем isAnimating: это делает эффект по selectedDate,
                    // когда мгновенно вернёмся на центр (index=1)
                }}

                initialSlide={1}
                slidesPerView={1}
                spaceBetween={gapPx}
                resistanceRatio={0.85}
                speed={260}
                simulateTouch
                threshold={5}
            >
                <SwiperSlide>{renderDay(visiblePrev)}</SwiperSlide>
                <SwiperSlide>{renderDay(visibleCenter)}</SwiperSlide>
                <SwiperSlide>{renderDay(visibleNext)}</SwiperSlide>
            </Swiper>
        </main>
    );
}
