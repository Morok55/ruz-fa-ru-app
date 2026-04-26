import React from "react";
import { createPortal } from "react-dom";
import { FaCopy, FaCheck } from "react-icons/fa6";
import { MdEventNote } from "react-icons/md";

export default function LessonModal({ lesson, onClose, onOpenTeacherSchedule, onOpenAuditoriumSchedule }) {
    const [isSheetOpen, setIsSheetOpen] = React.useState(false);
    const [isSheetClosing, setIsSheetClosing] = React.useState(false);

    const [copiedEmail, setCopiedEmail] = React.useState("");
    const [openingSchedule, setOpeningSchedule] = React.useState("");

    const closeTimerRef = React.useRef(null);
    const copyTimerRef = React.useRef(null);
    const sheetRef = React.useRef(null);

    // drag state
    const [isDragging, setIsDragging] = React.useState(false);
    const [dragOffset, setDragOffset] = React.useState(0);
    const dragStateRef = React.useRef({
        startX: 0,
        startY: 0,
        startScrollTop: 0,
        dragging: false,
    });

    const hasLesson = !!lesson;

    React.useEffect(() => {
        if (hasLesson) {
            setIsSheetClosing(false);
            setCopiedEmail("");
            setOpeningSchedule("");
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
            setOpeningSchedule("");
            setDragOffset(0);
            setIsDragging(false);
        }
    }, [hasLesson]);

    React.useEffect(() => {
        return () => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        };
    }, []);

    const showError = (message) => {
        const tg = window.Telegram?.WebApp;
        if (typeof tg?.showAlert === "function") {
            tg.showAlert(message);
            return;
        }
        window.alert(message);
    };

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

    const handleOpenTeacherSchedule = async (name) => {
        const teacherName = String(name || "").trim();
        if (!teacherName || teacherName === "Преподаватель" || typeof onOpenTeacherSchedule !== "function") return;

        try {
            setOpeningSchedule(`teacher:${teacherName}`);
            await onOpenTeacherSchedule(teacherName);
            startClose();
        } catch (e) {
            showError(e?.message || "Не удалось открыть расписание преподавателя");
        } finally {
            setOpeningSchedule("");
        }
    };

    const handleOpenAuditoriumSchedule = async (room) => {
        if (!room?.label || typeof onOpenAuditoriumSchedule !== "function") return;
        const key = `auditorium:${room.id || room.label}`;

        try {
            setOpeningSchedule(key);
            await onOpenAuditoriumSchedule(room);
            startClose();
        } catch (e) {
            showError(e?.message || "Не удалось открыть расписание аудитории");
        } finally {
            setOpeningSchedule("");
        }
    };

    const onTouchStart = (e) => {
        if (!hasLesson) return;
        const touch = e.touches[0];
        dragStateRef.current.startX = touch.clientX;
        dragStateRef.current.startY = touch.clientY;
        dragStateRef.current.startScrollTop = sheetRef.current?.scrollTop || 0;
        dragStateRef.current.dragging = false;
        setIsDragging(false);
        setDragOffset(0);
    };

    const onTouchMove = (e) => {
        const touch = e.touches[0];
        const delta = touch.clientY - dragStateRef.current.startY;
        const dx = Math.abs(touch.clientX - dragStateRef.current.startX);
        const dy = Math.abs(delta);

        if (!dragStateRef.current.dragging) {
            if (dy < 8 || delta <= 0 || dx > dy) return;
            if (dragStateRef.current.startScrollTop > 0 || (sheetRef.current?.scrollTop || 0) > 0) return;
            dragStateRef.current.dragging = true;
            setIsDragging(true);
        }

        if (e.cancelable) e.preventDefault();
        setDragOffset(delta <= 0 ? 0 : delta);
    };

    const finishDrag = () => {
        if (!dragStateRef.current.dragging) return;
        dragStateRef.current.dragging = false;

        if (dragOffset > 80) {
            startClose();
        } else {
            setIsDragging(false);
            setDragOffset(0);
        }
    };

    if (!lesson) return null;

    function toPairUpper(s) {
        if (!s) return "";
        return s.toLocaleUpperCase("ru-RU");
    }

    const overlayClass = `teacher-sheet-overlay ${
        isSheetClosing ? "is-closing" : (isSheetOpen ? "is-open" : "")
    }`;

    const sheetStyle = isDragging
        ? {
            transform: `translateY(${dragOffset}px)`,
            transition: "none",
        }
        : undefined;

    const kind = (lesson.kindOfWork || lesson.lessonType || "").trim();
    const lower = String(kind).toLowerCase();
    const isSeminar = lower.includes("семинар") || lower.includes("практичес");
    const hasPlus = lower.includes("+");
    const hasZachet = lower.includes("зачет") || lower.includes("зачёт");
    const hasExam = lower.includes("экзамен");
    const isPureSeminar = isSeminar && !hasPlus && !hasZachet && !hasExam;
    const kindLabel = isPureSeminar
        ? "СЕМИНАР"
        : (toPairUpper(kind) || "ЗАНЯТИЕ");
    const time = [(lesson.beginLesson || "").trim(), (lesson.endLesson || "").trim()]
        .filter(Boolean)
        .join(" – ");
    const meta = [kind, time].filter(Boolean).join(" • ");

    const originalsRaw =
        (lesson._hasMultipleTeachers || lesson._hasMultipleRooms)
            && Array.isArray(lesson._originals)
            && lesson._originals.length > 0
            ? lesson._originals
            : [lesson];

    const teacherSeen = new Set();
    const teachers = [];
    for (const item of originalsRaw) {
        const name = (item.lecturer_title || item.lecturer_name || "").trim();
        let email = (item.lecturerEmail || item.lecturer_email || "").trim();

        if (email.toLowerCase() === "null") email = "";
        if (!name && !email) continue;

        const key = `${name}|${email}`;
        if (teacherSeen.has(key)) continue;
        teacherSeen.add(key);

        teachers.push({
            name: name || "Преподаватель",
            email,
        });
    }

    const room = {
        id: lesson.auditoriumOid || lesson.auditoriumId || lesson.auditorium_id || null,
        label: (lesson.auditorium || lesson.room || "").trim(),
        description: (lesson.building || "").trim(),
    };
    const roomsSeen = new Set();
    const rooms = [];
    for (const item of originalsRaw) {
        const label = (item.auditorium || item.room || "").trim();
        const description = (item.building || "").trim();
        const id = item.auditoriumOid || item.auditoriumId || item.auditorium_id || null;
        if (!label) continue;

        const key = `${id || ""}|${label}|${description}`;
        if (roomsSeen.has(key)) continue;
        roomsSeen.add(key);
        rooms.push({ id, label, description });
    }
    if (rooms.length === 0 && room.label) {
        rooms.push(room);
    }

    const renderTeacherRow = (teacher, idx) => {
        const hasEmail = !!teacher.email;
        const isCopied = hasEmail && teacher.email === copiedEmail;
        const Icon = isCopied ? FaCheck : FaCopy;
        const canOpenTeacher =
            teacher.name && teacher.name !== "Преподаватель" && typeof onOpenTeacherSchedule === "function";
        const teacherOpeningKey = `teacher:${teacher.name}`;

        return (
            <div key={`${teacher.name}-${teacher.email}-${idx}`} className="teacher-row-card">
                <div className="teacher-row-main">
                    <div className="teacher-row-name">{teacher.name}</div>
                    <div className="teacher-row-email">{teacher.email || "Почта не указана"}</div>
                </div>

                {(hasEmail || canOpenTeacher) && (
                    <div className="teacher-row-actions">
                        {hasEmail && (
                            <button
                                type="button"
                                className="teacher-copy-btn"
                                onClick={() => handleCopyEmail(teacher.email)}
                                title="Скопировать почту"
                            >
                                <Icon />
                            </button>
                        )}
                        {canOpenTeacher && (
                            <button
                                type="button"
                                className="teacher-copy-btn"
                                onClick={() => handleOpenTeacherSchedule(teacher.name)}
                                disabled={openingSchedule === teacherOpeningKey}
                                title="Перейти к расписанию преподавателя"
                            >
                                <MdEventNote />
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderRoomRow = (item, idx) => {
        const canOpenRoom = !!item.label && typeof onOpenAuditoriumSchedule === "function";
        const roomOpeningKey = `auditorium:${item.id || item.label}`;

        return (
            <div key={`${item.id || item.label}-${item.description}-${idx}`} className="teacher-row-card">
                <div className="teacher-row-main">
                    <div className="teacher-row-name">{item.label}</div>
                    <div className="teacher-row-email">{item.description || "Адрес не указан"}</div>
                </div>

                {canOpenRoom && (
                    <div className="teacher-row-actions">
                        <button
                            type="button"
                            className="teacher-copy-btn"
                            onClick={() => handleOpenAuditoriumSchedule(item)}
                            disabled={openingSchedule === roomOpeningKey}
                            title="Перейти к расписанию аудитории"
                        >
                            <MdEventNote />
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return createPortal(
        <div className={overlayClass} onClick={startClose}>
            <div
                ref={sheetRef}
                className="teacher-sheet"
                style={sheetStyle}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={finishDrag}
                onTouchCancel={finishDrag}
            >
                <div className="teacher-sheet-grabber" />
                <div className="teacher-sheet-body">
                    <div className="lesson-sheet-header">
                        <div className="lesson-sheet-kicker">{kindLabel}</div>
                        <div className="lesson-sheet-title">{lesson.discipline || "Дисциплина"}</div>
                        {meta ? <div className="lesson-sheet-meta">{meta}</div> : null}
                    </div>

                    <div className="lesson-info-section">
                        <div className="lesson-info-label">
                            {teachers.length > 1 ? "Преподаватели" : "Преподаватель"}
                        </div>
                        <div className="teacher-sheet-foreign-list">
                            {teachers.length === 0 ? (
                                <div className="teacher-row-card">
                                    <div className="teacher-row-main">
                                        <div className="teacher-row-name">Преподаватель не указан</div>
                                        <div className="teacher-row-email">Нет данных для действий</div>
                                    </div>
                                </div>
                            ) : (
                                teachers.map(renderTeacherRow)
                            )}
                        </div>
                    </div>

                    <div className="lesson-info-section">
                        <div className="lesson-info-label">
                            {rooms.length > 1 ? "Аудитории" : "Аудитория"}
                        </div>
                        <div className="teacher-sheet-foreign-list">
                            {rooms.length === 0 ? (
                                <div className="teacher-row-card">
                                    <div className="teacher-row-main">
                                        <div className="teacher-row-name">Аудитория не указана</div>
                                        <div className="teacher-row-email">Нет данных для действий</div>
                                    </div>
                                </div>
                            ) : (
                                rooms.map(renderRoomRow)
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
