import React, { useEffect, useMemo, useRef, useState } from "react";
import { MdPeopleAlt } from "react-icons/md";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export default function GroupSearch({ open, onClose, onPick }) {
    const [q, setQ] = useState("");
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState([]);
    const inputRef = useRef(null);

    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        tg?.BackButton?.show();
        tg?.BackButton?.onClick(() => {
            onClose();
        });

        return () => {
            tg?.BackButton?.offClick?.();
            tg?.BackButton?.hide?.();
        };
    });

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

    if (!open) return null;

    return (
        <div className="gs-overlay" role="dialog" aria-modal="true">
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
