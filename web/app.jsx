import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { usePoll } from "./lib/api";
import Shipments from "./shipments/Shipments";
import Inbox from "./inbox/Inbox";
import Operations from "./operations/Operations";
import StatusBar from "./StatusBar";

const views = ["shipments", "notifications", "operations"];
// #shipments/<id> 형식으로 선택한 배송까지 주소에 남긴다.
function currentRoute() {
  const [view, id] = location.hash.slice(1).split("/");
  return views.includes(view) ? { view, id } : { view: "shipments" };
}

function Badge({ count, tone, label }) {
  if (!count) return null;
  return (
    <span className={"badge " + tone} aria-label={label + " " + count + "건"}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function App() {
  const [route, setRoute] = useState(currentRoute);
  const { view } = route;
  const { data: summary, error, reload } = usePoll("summary");
  useEffect(() => {
    const navigate = () => setRoute(currentRoute());
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  const tabs = [
    ["shipments", "운영자", null],
    ["notifications", "수신자 알림함", <Badge key="b" count={summary?.unread} tone="info" label="읽지 않은 알림" />],
    ["operations", "알림 운영", <Badge key="b" count={summary?.queue?.dead} tone="alarm" label="DLQ 대기" />],
  ];
  return (
    <>
      <header className="topbar">
        <a className="brand" href="#shipments">
          <span className="mark" aria-hidden="true">
            ⇄
          </span>
          운송 데스크
        </a>
        <nav aria-label="화면">
          {tabs.map(([v, label, badge]) => (
            <a key={v} href={"#" + v} aria-current={v === view ? "page" : undefined}>
              {label}
              {badge}
            </a>
          ))}
        </nav>
        <StatusBar summary={summary} error={error} />
      </header>
      <main>
        {view === "operations" ? (
          <Operations summary={summary} />
        ) : view === "shipments" ? (
          <Shipments selectedId={route.id} onChange={reload} />
        ) : (
          <Inbox onChange={reload} />
        )}
      </main>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
