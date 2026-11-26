import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { usePoll } from "./lib/api";
import Shipments from "./shipments/Shipments";
import Inbox from "./inbox/Inbox";
import Operations from "./operations/Operations";
import StatusBar from "./StatusBar";

const views = ["shipments", "notifications", "operations"];
const currentView = () =>
  views.includes(location.hash.slice(1)) ? location.hash.slice(1) : "shipments";

function Badge({ count, tone, label }) {
  if (!count) return null;
  return (
    <span className={"badge " + tone} aria-label={label + " " + count + "건"}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function App() {
  const [view, setView] = useState(currentView);
  const { data: summary, error, reload } = usePoll("summary");
  useEffect(() => {
    const navigate = () => setView(currentView());
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  const tabs = [
    ["shipments", "운영자", null],
    ["notifications", "수신자 알림함", <Badge key="b" count={summary?.unread} tone="info" label="읽지 않은 알림" />],
    ["operations", "알림 운영 · SQS", <Badge key="b" count={summary?.queue?.dead} tone="alarm" label="DLQ 대기" />],
  ];
  return (
    <>
      <header>
        <strong>
          <span className="mark" aria-hidden="true">
            ⇄
          </span>{" "}
          운송 데스크
        </strong>
        <nav>
          {tabs.map(([v, label, badge]) => (
            <button
              key={v}
              aria-pressed={v === view}
              onClick={() => {
                location.hash = v;
              }}
            >
              {label}
              {badge}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <StatusBar summary={summary} error={error} />
        {view === "operations" ? (
          <Operations />
        ) : view === "shipments" ? (
          <Shipments onChange={reload} />
        ) : (
          <Inbox onChange={reload} />
        )}
      </main>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
