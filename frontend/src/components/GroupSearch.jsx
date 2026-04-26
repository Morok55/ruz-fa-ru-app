import React, { useEffect, useRef, useState, useCallback } from "react";
import { MdMeetingRoom, MdPeopleAlt, MdPerson, MdStar, MdStarBorder, MdClose } from "react-icons/md";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

const FAV_KEY = "tg-schedule::fav-groups";

function normalizeItem(item, fallbackType = "group") {
    const type = item?.type === "person" || item?.type === "auditorium" ? item.type : fallbackType;
    return {
        id: item?.id,
        label: item?.label || "",
        type,
        description: item?.description || ""
    };
}

function itemKey(item) {
    const type = item?.type || "group";
    return `${type}:${item?.id}`;
}

function favsRead() {
    try {
        const raw = localStorage.getItem(FAV_KEY);
        const arr = JSON.parse(raw || "[]");
        return Array.isArray(arr)
            ? arr.map(x => normalizeItem(x)).filter(x => x.id && x.label)
            : [];
    } catch { return []; }
}
function favsWrite(arr) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); } catch {}
}
function uniqById(list) {
    const seen = new Set();
    return list.filter(g => !seen.has(itemKey(g)) && seen.add(itemKey(g)));
}

export default function GroupSearch({ open, onClose, onPick }) {
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState([]);

    const inputRef = useRef(null);

    const [shown, setShown] = useState(false);   // смонтирован ли экран
    const [closing, setClosing] = useState(false); // идёт ли анимация закрытия
    const [active, setActive] = useState(false); // включает класс is-open через кадр

    // избранные расписания
    const [favs, setFavs] = useState(() => favsRead());

    const isFav = useCallback((item) => favs.some(f => itemKey(f) === itemKey(item)), [favs]);

    const addFav = useCallback((g) => {
        setFavs(prev => {
            const item = normalizeItem(g);
            const next = uniqById([item, ...prev]);
            favsWrite(next);
            return next;
        });
    }, []);

    const removeFav = useCallback((item) => {
        setFavs(prev => {
            const next = prev.filter(f => itemKey(f) !== itemKey(item));
            favsWrite(next);
            return next;
        });
    }, []);

    const toggleFav = useCallback((g) => {
        if (isFav(g)) removeFav(g);
        else addFav(g);
    }, [isFav, addFav, removeFav]);

    const ItemIcon = ({ item, className }) => (
        item?.type === "person" ? <MdPerson className={className} />
            : item?.type === "auditorium" ? <MdMeetingRoom className={className} />
                : <MdPeopleAlt className={className} />
    );

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
                const [groupsRes, peopleRes, roomsRes] = await Promise.all([
                    fetch(`${API_BASE}/groups?term=${encodeURIComponent(term)}`, { signal: ctrl.signal }),
                    fetch(`${API_BASE}/search?term=${encodeURIComponent(term)}&type=person&limit=50`, { signal: ctrl.signal }),
                    fetch(`${API_BASE}/search?term=${encodeURIComponent(term)}&type=auditorium&limit=50`, { signal: ctrl.signal })
                ]);
                const groups = groupsRes.ok ? await groupsRes.json() : [];
                const people = peopleRes.ok ? await peopleRes.json() : [];
                const rooms = roomsRes.ok ? await roomsRes.json() : [];
                setResults([
                    ...groups.map(x => normalizeItem(x, "group")),
                    ...people.map(x => normalizeItem(x, "person")),
                    ...rooms.map(x => normalizeItem(x, "auditorium"))
                ].filter(x => x.id && x.label));
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
                        placeholder="Группа, преподаватель или аудитория"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                    <button className="gs-cancel" onClick={onClose}>Отмена</button>
                </div>

                <div className="gs-section">Избранные</div>
                <div className="gs-favs">
                    {favs.length === 0 ? (
                        <div className="gs-empty">Здесь появятся избранные расписания</div>
                    ) : (
                        favs.map(g => (
                            <div className="gs-fav" key={itemKey(g)}>
                                <button
                                    className="gs-fav-chip"
                                    onClick={() => { onPick(g); onClose(); }}
                                    title={g.label}
                                >
                                    <ItemIcon item={g} className="gs-fav-ico" />
                                    <span className="gs-fav-text">{g.label}</span>
                                </button>
                                <button
                                    className="gs-fav-del"
                                    onClick={(e) => { e.stopPropagation(); removeFav(g); }}
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
                        <div className="gs-empty">Начните вводить группу, преподавателя или аудиторию</div>
                    ) : (
                        results.map((g) => {
                        const fav = isFav(g);
                        return (
                            <div key={itemKey(g)} className="gs-item">
                                <button
                                    className="gs-item-main"
                                    onClick={() => { onPick(g); onClose(); }}
                                    title={g.label}
                                >
                                    <span className="gs-item-ico"><ItemIcon item={g} /></span>
                                    <span className="gs-item-copy">
                                        <span className="gs-item-text">{g.label}</span>
                                        {g.description ? <span className="gs-item-desc">{g.description.trim()}</span> : null}
                                    </span>
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
