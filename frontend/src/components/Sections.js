import React from "react";

/**
 * Скроллящийся контейнер секций (по CSS).
 * Ожидает массив React-элементов <DaySection ... /> в children.
 */
export default function Sections({ children }) {
    return <main className="sections">{children}</main>;
}
