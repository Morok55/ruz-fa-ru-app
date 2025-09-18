import React from "react";

export default function AppShell({ header, children }) {
    return (
        <div className="app">
            <div className="topbar">
                {header}
            </div>
            {children}
        </div>
    );
}
