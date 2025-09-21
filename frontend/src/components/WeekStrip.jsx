import React, { useMemo, useRef, useEffect } from "react";
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
}) {
    const swiperRef = useRef(null);

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
                onSwiper={(sw) => (swiperRef.current = sw)}
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
                    />
                </SwiperSlide>

                <SwiperSlide>
                    <WeekGrid
                        days={weekDays}
                        selectedDate={selectedDate}
                        onSelectDay={onSelectDay}
                        dayLabels={dayLabels}
                    />
                </SwiperSlide>

                <SwiperSlide>
                    <WeekGrid
                        days={nextDays}
                        selectedDate={selectedDate}
                        onSelectDay={onSelectDay}
                        dayLabels={dayLabels}
                    />
                </SwiperSlide>
            </Swiper>
        </div>
    );
}

function WeekGrid({ days, selectedDate, onSelectDay, dayLabels }) {
    return (
        <div className="week-grid">
            {days.map((d, i) => {
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
