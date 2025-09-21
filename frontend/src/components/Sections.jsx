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
                onSlideChangeTransitionEnd={handleSlideChangeTransitionEnd}
                initialSlide={1}
                slidesPerView={1}
                spaceBetween={gapPx}
                resistanceRatio={0.85}
                speed={260}
                simulateTouch={true}
                threshold={5}
            >
                <SwiperSlide>{renderDay(prevDate)}</SwiperSlide>
                <SwiperSlide>{renderDay(selectedDate)}</SwiperSlide>
                <SwiperSlide>{renderDay(nextDate)}</SwiperSlide>
            </Swiper>
        </main>
    );
}
