import React, { useEffect, useRef, useState, useCallback } from "react";
import { MdPeopleAlt, MdStar, MdStarBorder, MdClose } from "react-icons/md";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

const FAV_KEY = "tg-schedule::fav-groups";

function favsRead() {
    try {
        const raw = localStorage.getItem(FAV_KEY);
        const arr = JSON.parse(raw || "[]");
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
}
function favsWrite(arr) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); } catch {}
}
function uniqById(list) {
    const seen = new Set();
    return list.filter(g => !seen.has(g.id) && seen.add(g.id));
}

export default function GroupSearch({ open, onClose, onPick }) {
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState([]);

    const inputRef = useRef(null);

    const [shown, setShown] = useState(false);   // смонтирован ли экран
    const [closing, setClosing] = useState(false); // идёт ли анимация закрытия
    const [active, setActive] = useState(false); // включает класс is-open через кадр

    // избранные группы
    const [favs, setFavs] = useState(() => favsRead());

    const isFav = useCallback((id) => favs.some(f => f.id === id), [favs]);

    const addFav = useCallback((g) => {
        setFavs(prev => {
            const next = uniqById([{ id: g.id, label: g.label }, ...prev]);
            favsWrite(next);
            return next;
        });
    }, []);

    const removeFav = useCallback((id) => {
        setFavs(prev => {
            const next = prev.filter(f => f.id !== id);
            favsWrite(next);
            return next;
        });
    }, []);

    const toggleFav = useCallback((g) => {
        if (isFav(g.id)) removeFav(g.id);
        else addFav(g);
    }, [isFav, addFav, removeFav]);

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
                    {favs.length === 0 ? (
                        <div className="gs-empty">Здесь появятся избранные группы</div>
                    ) : (
                        favs.map(g => (
                            <div className="gs-fav" key={g.id}>
                                <button
                                    className="gs-fav-chip"
                                    onClick={() => { onPick(g); onClose(); }}
                                    title={g.label}
                                >
                                    <MdPeopleAlt className="gs-fav-ico" />
                                    <span className="gs-fav-text">{g.label}</span>
                                </button>
                                <button
                                    className="gs-fav-del"
                                    onClick={(e) => { e.stopPropagation(); removeFav(g.id); }}
                                    aria-label="Удалить из избранного"
                                    title="Убрать"
                                >
                                    <MdClose />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div className="gs-section">Результаты</div>
                <div className="gs-list">
                    {loading ? (
                        <div className="gs-loading"><span></span><span></span><span></span></div>
                    ) : results.length === 0 ? (
                        <div className="gs-empty">Начните вводить название группы</div>
                    ) : (
                        results.map((g) => {
                        const fav = isFav(g.id);
                        return (
                            <div key={g.id} className="gs-item">
                                <button
                                    className="gs-item-main"
                                    onClick={() => { onPick(g); onClose(); }}
                                    title={g.label}
                                >
                                    <span className="gs-item-ico"><MdPeopleAlt /></span>
                                    <span className="gs-item-text">{g.label}</span>
                                </button>
                                <button
                                    className={"gs-item-star" + (fav ? " is-on" : "")}
                                    onClick={(e) => { e.stopPropagation(); toggleFav(g); }}
                                    aria-label={fav ? "Убрать из избранного" : "Добавить в избранное"}
                                    title={fav ? "В избранном" : "В избранное"}
                                >
                                    {fav ? <MdStar /> : <MdStarBorder />}
                                </button>
                            </div>
                        );
                    })
                    )}
                </div>
            </div>
        </div>
    );
}
