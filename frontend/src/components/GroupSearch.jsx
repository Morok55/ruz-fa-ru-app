import React, { useEffect, useRef, useState, useCallback } from "react";
import { MdPeopleAlt } from "react-icons/md";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export default function GroupSearch({ open, onClose, onPick }) {
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState([]);
    const inputRef = useRef(null);

    const [shown, setShown] = useState(false);   // смонтирован ли экран
    const [closing, setClosing] = useState(false); // идёт ли анимация закрытия
    const [active, setActive] = useState(false); // включает класс is-open через кадр

    const handleBack = useCallback(() => {
        onClose();
    }, [onClose]);

    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        const bb = tg?.BackButton;
        if (!bb) return;

        if (open) {
            bb.show();
            bb.onClick(handleBack);
            return () => {
                bb.offClick(handleBack); // важно: тот же самый колбэк
                bb.hide();
            };
        } else {
            // если компонент остаётся смонтирован, но закрывается
            bb.offClick(handleBack);
            bb.hide();
        }
    }, [open, handleBack]);

    useEffect(() => {
        if (open) {
            // 1) монтируем
            setShown(true);
            setClosing(false);
            setActive(false);
            // 2) на следующий кадр включаем класс is-open — запустится transition
            const raf = requestAnimationFrame(() => {
                setActive(true);
            });
            return () => cancelAnimationFrame(raf);
        } else if (shown) {
            // запускаем анимацию закрытия
            setClosing(true);
            setActive(false); // убираем is-open -> уедет вправо
            const t = setTimeout(() => {
                setShown(false);
                setClosing(false);
            }, 260); // должно совпадать с CSS
            return () => clearTimeout(t);
        }
    }, [open, shown]);

    useEffect(() => {
        if (open) {
            setQ("");
            setResults([]);
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const ctrl = new AbortController();
        const t = setTimeout(async () => {
            const term = q.trim();
            if (!term) {
                setResults([]);
                return;
            }
            try {
                setLoading(true);
                const r = await fetch(`${API_BASE}/groups?term=${encodeURIComponent(term)}`, { signal: ctrl.signal });
                if (!r.ok) throw new Error();
                const data = await r.json();
                setResults(data);
            } catch (_) {
                /* ignore */
            } finally {
                setLoading(false);
            }
        }, 200); // дебаунс
        return () => {
            clearTimeout(t);
            ctrl.abort();
        };
    }, [open, q]);

    if (!shown) return null;

    const overlayClass = "gs-overlay " + (active ? "is-open" : (closing ? "is-closing" : ""));

    return (
        <div
            className={overlayClass}
            role="dialog"
            aria-modal="true"
            aria-hidden={open ? "false" : "true"}
        >
            <div className="gs-panel">
                <div className="gs-title">Поиск расписания</div>

                <div className="gs-input-wrap">
                    <input
                        ref={inputRef}
                        className="gs-input"
                        placeholder="Введите номер группы"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                    <button className="gs-cancel" onClick={onClose}>Отмена</button>
                </div>

                <div className="gs-section">Избранные</div>
                <div className="gs-favs">
                    {/* пока пусто — потом добавим */}
                    <div className="gs-empty">Здесь появятся избранные группы</div>
                </div>

                <div className="gs-section">Результаты</div>
                <div className="gs-list">
                    {loading ? (
                        <div className="gs-loading"><span></span><span></span><span></span></div>
                    ) : results.length === 0 ? (
                        <div className="gs-empty">Начните вводить название группы</div>
                    ) : (
                        results.map((g) => (
                            <button
                                key={g.id}
                                className="gs-item"
                                onClick={() => { onPick(g); onClose(); }}
                            >
                                <span className="gs-item-ico"><MdPeopleAlt /></span>
                                <span className="gs-item-text">{g.label}</span>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
