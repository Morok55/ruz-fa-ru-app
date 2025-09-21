import React, { useMemo, useRef, useEffect } from "react";
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
    renderDay,
    onPrevDay,
    onNextDay,
    gapPx = 32,
    onSwipeStart, onSwipeMove, onSwipeEnd
}) {
    const swiperRef = useRef(null);

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
    }, [selectedDate]);

    function handleSlideChangeTransitionEnd(sw) {
        // 0=предыдущий день, 1=текущий (центр), 2=следующий
        if (sw.activeIndex === 0) {
            onPrevDay?.();
            // вернёмся в центр после обновления selectedDate (через useEffect выше)
        } else if (sw.activeIndex === 2) {
            onNextDay?.();
        }
    }

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
                    // Здесь точно знаем направление перелистывания и что оно СОСТОЯЛОСЬ.
                    if (sw.activeIndex === 0) {
                        onSwipeEnd?.(true, "prev");   // едем к предыдущему дню
                    } else if (sw.activeIndex === 2) {
                        onSwipeEnd?.(true, "next");   // едем к следующему дню
                    }
                }}
                onSlideChangeTransitionEnd={(sw) => {
                    // После окончания анимации — меняем день
                    if (sw.activeIndex === 0)      onPrevDay?.();
                    else if (sw.activeIndex === 2) onNextDay?.();
                }}

                initialSlide={1}
                slidesPerView={1}
                spaceBetween={gapPx}
                resistanceRatio={0.85}
                speed={260}
                simulateTouch
                threshold={5}
            >
                <SwiperSlide>{renderDay(prevDate)}</SwiperSlide>
                <SwiperSlide>{renderDay(selectedDate)}</SwiperSlide>
                <SwiperSlide>{renderDay(nextDate)}</SwiperSlide>
            </Swiper>
        </main>
    );
}
