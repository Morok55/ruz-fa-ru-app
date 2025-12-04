import React from "react";
import { createPortal } from "react-dom";
import { FaCopy, FaCheck } from "react-icons/fa6";

export default function LessonModal({ lesson, onClose }) {
    const [isSheetOpen, setIsSheetOpen] = React.useState(false);
    const [isSheetClosing, setIsSheetClosing] = React.useState(false);

    const [copiedEmail, setCopiedEmail] = React.useState("");

    const closeTimerRef = React.useRef(null);
    const copyTimerRef = React.useRef(null);

    // drag state
    const [isDragging, setIsDragging] = React.useState(false);
    const [dragOffset, setDragOffset] = React.useState(0);
    const dragStateRef = React.useRef({
        startY: 0,
        dragging: false,
    });

    const hasLesson = !!lesson;

    // анимация открытия
    React.useEffect(() => {
        if (hasLesson) {
            setIsSheetClosing(false);
            setCopiedEmail("");
            setDragOffset(0);
            setIsDragging(false);
            if (copyTimerRef.current) {
                clearTimeout(copyTimerRef.current);
                copyTimerRef.current = null;
            }
            requestAnimationFrame(() => setIsSheetOpen(true));
        } else {
            setIsSheetOpen(false);
            setIsSheetClosing(false);
            setCopiedEmail("");
            setDragOffset(0);
            setIsDragging(false);
        }
    }, [hasLesson]);

    // очистка таймеров
    React.useEffect(() => {
        return () => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        };
    }, []);

    const startClose = () => {
        if (!hasLesson || isSheetClosing) return;
        setIsSheetClosing(true);
        setIsDragging(false);
        setDragOffset(0);

        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
        }
        closeTimerRef.current = setTimeout(() => {
            setIsSheetClosing(false);
            setIsSheetOpen(false);
            onClose?.();
            closeTimerRef.current = null;
        }, 260);
    };

    const handleCopyEmail = async (email) => {
        if (!email) return;
        let ok = false;

        if (navigator?.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(email);
                ok = true;
            } catch {
                ok = false;
            }
        }

        if (!ok) {
            window.prompt("Скопируйте почту:", email);
        }

        if (copyTimerRef.current) {
            clearTimeout(copyTimerRef.current);
        }
        setCopiedEmail(email);
        copyTimerRef.current = setTimeout(() => {
            setCopiedEmail("");
            copyTimerRef.current = null;
        }, 2000);
    };

    // TOUCH-обработчики для свайпа вниз
    const onTouchStart = (e) => {
        if (!hasLesson) return;
        const touch = e.touches[0];
        dragStateRef.current.startY = touch.clientY;
        dragStateRef.current.dragging = true;
        setIsDragging(true);
        setDragOffset(0);
    };

    const onTouchMove = (e) => {
        if (!dragStateRef.current.dragging) return;
        const touch = e.touches[0];
        const delta = touch.clientY - dragStateRef.current.startY;
        if (delta <= 0) {
            setDragOffset(0);
        } else {
            setDragOffset(delta);
        }
    };

    const finishDrag = () => {
        if (!dragStateRef.current.dragging) return;
        dragStateRef.current.dragging = false;

        const threshold = 80; // пикселей, после которых считаем жест закрытием
        if (dragOffset > threshold) {
            // тянули достаточно — закрываем
            startClose();
        } else {
            // мало тянули — возвращаем обратно
            setIsDragging(false);
            setDragOffset(0);
        }
    };

    const onTouchEnd = () => {
        finishDrag();
    };

    const onTouchCancel = () => {
        finishDrag();
    };

    if (!lesson) return null;

    const isForeign = lesson._isForeign ?? /иностран/i.test(lesson.discipline || "");
    const overlayClass = `teacher-sheet-overlay ${
        isSheetClosing ? "is-closing" : (isSheetOpen ? "is-open" : "")
    }`;

    // inline-стиль только во время перетаскивания:
    const sheetStyle = isDragging
        ? {
            transform: `translateY(${dragOffset}px)`,
            transition: "none",
        }
        : undefined;

    // ====== ИНОСТРАННЫЙ ЯЗЫК ======
    if (isForeign) {
        const originalsRaw =
            Array.isArray(lesson._originals) && lesson._originals.length > 0
                ? lesson._originals
                : [lesson];

        const seen = new Set();
        const teachers = [];
        for (const o of originalsRaw) {
            const name = (o.lecturer_title || o.lecturer_name || "").trim();
            let email = (o.lecturerEmail || o.lecturer_email || "").trim();

            if (email.toLowerCase() === "null") email = "";

            if (!name && !email) continue;

            const key = `${name}|${email}`;
            if (seen.has(key)) continue;
            seen.add(key);

            teachers.push({
                name: name || "Преподаватель",
                email,
            });
        }

        return createPortal(
            <div className={overlayClass} onClick={startClose}>
                <div
                    className="teacher-sheet"
                    style={sheetStyle}
                    onClick={(e) => e.stopPropagation()}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={onTouchCancel}
                >
                    <div className="teacher-sheet-grabber" />
                    <div className="teacher-sheet-body">
                        <div className="teacher-sheet-name">
                            {lesson.discipline || "Иностранный язык"}
                        </div>

                        <div className="teacher-sheet-foreign-list">
                            {teachers.length === 0 ? (
                                <div className="teacher-row-empty">
                                    Нет информации о преподавателях
                                </div>
                            ) : (
                                teachers.map((t, idx) => {
                                    const hasEmail = !!t.email;
                                    const isCopied = hasEmail && t.email === copiedEmail;
                                    const Icon = isCopied ? FaCheck : FaCopy;

                                    return (
                                        <div key={idx} className="teacher-row-card">
                                            <div className="teacher-row-main">
                                                <div className="teacher-row-name">
                                                    {t.name}
                                                </div>
                                                <div className="teacher-row-email">
                                                    {t.email || "Почта не указана"}
                                                </div>
                                            </div>

                                            {hasEmail && (
                                                <button
                                                    type="button"
                                                    className="teacher-copy-btn"
                                                    onClick={() => handleCopyEmail(t.email)}
                                                >
                                                    <Icon />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    // ====== Обычный предмет ======
    const name = (lesson.lecturer_title || lesson.lecturer_name || "").trim() || "Преподаватель";
    const email = (lesson.lecturerEmail || lesson.lecturer_email || "").trim();
    const isCopiedMain = !!email && email === copiedEmail;
    const MainIcon = isCopiedMain ? FaCheck : FaCopy;

    return createPortal(
        <div className={overlayClass} onClick={startClose}>
            <div
                className="teacher-sheet"
                style={sheetStyle}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchCancel}
            >
                <div className="teacher-sheet-grabber" />
                <div className="teacher-sheet-body">
                    <div className="teacher-sheet-name">{name}</div>
                    <div className="teacher-sheet-email">
                        {email || "Почта не указана"}
                    </div>

                    {email && (
                        <button
                            type="button"
                            className="sheet-btn"
                            onClick={() => handleCopyEmail(email)}
                        >
                            <MainIcon />
                            <span>{isCopiedMain ? "Почта скопирована" : "Скопировать почту"}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
