import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Operations from "./operations";
const names = {
  registered: "등록",
  in_transit: "배송 중",
  exception: "배송 예외",
  delivered: "배송 완료",
};
const actions = {
  registered: [["in_transit", "배송 시작"]],
  in_transit: [
    ["exception", "예외 등록"],
    ["delivered", "배송 완료"],
  ],
  exception: [["in_transit", "배송 재개"]],
  delivered: [],
};
const messages = {
  ShipmentInTransit: "배송을 시작했습니다.",
  ShipmentDelivered: "배송을 완료했습니다.",
  ShipmentExceptionRaised: "배송 예외가 발생했습니다.",
};
async function api(path, method = "GET", body) {
  const res = await fetch("/api/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.message);
  return data;
}
function History({ shipment }) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (!expanded) return;
    let live = true;
    api("shipments/" + shipment.id)
      .then((r) => {
        if (live) {
          setRows(r);
          setError("");
        }
      })
      .catch((e) => {
        if (live) {
          setRows([]);
          setError(e.message);
        }
      });
    return () => {
      live = false;
    };
  }, [expanded, shipment.id, shipment.version]);
  return (
    <details onToggle={(e) => setExpanded(e.currentTarget.open)}>
      <summary>상태 이력</summary>
      {error}
      <ol>
        {rows.map((r) => (
          <li key={r.version}>
            {names[r.status]} ·{" "}
            {new Date(r.occurred_at).toLocaleString("ko-KR")}
          </li>
        ))}
      </ol>
    </details>
  );
}
function App() {
  const currentView = () =>
    ["notifications", "operations"].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : "shipments";
  const [filter, setFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [view, tab] = useState(currentView),
    [shipments, setShipments] = useState([]),
    [inbox, setInbox] = useState([]),
    [dest, setDest] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const [s, n] = await Promise.all([api("shipments"), api("notifications")]);
    setShipments(s);
    setInbox(n);
  }
  useEffect(() => {
    const navigate = () => tab(currentView());
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  useEffect(() => {
    const refresh = () => load().catch((e) => setError(e.message));
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);
  async function act(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
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
          {[
            ["shipments", "운영자"],
            ["notifications", "수신자 알림함"],
            ["operations", "알림 운영 · SQS"],
          ].map(([v, label]) => (
            <button
              key={v}
              aria-pressed={v === view}
              onClick={() => {
                location.hash = v;
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {error && <p role="alert">{error}</p>}
        {view === "operations" ? (
          <Operations />
        ) : view === "shipments" ? (
          <>
            <section className="mast">
              <h1>배송 현황</h1>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    await api("shipments", "POST", { destination: dest });
                    setDest("");
                  });
                }}
              >
                <label htmlFor="destination">새 배송 도착지</label>
                <input
                  id="destination"
                  aria-label="도착지"
                  placeholder="도착지 입력"
                  required
                  maxLength={100}
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                />
                <button disabled={busy}>배송 등록</button>
              </form>
            </section>
            <div className="filters" aria-label="배송 상태 필터">
              {Object.entries({ all: "전체", ...names }).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}{" "}
                  <span>
                    {
                      shipments.filter((s) => key === "all" || s.status === key)
                        .length
                    }
                  </span>
                </button>
              ))}
            </div>
            {!shipments.some(
              (s) => filter === "all" || s.status === filter,
            ) && <p className="empty">해당 상태의 배송이 없습니다.</p>}
            {shipments
              .filter((s) => filter === "all" || s.status === filter)
              .map((s) => (
                <article key={s.id}>
                  <small>운송 번호 {s.id.slice(0, 8)}</small>
                  <b>{s.destination}</b>{" "}
                  <span className={"status " + s.status}>
                    {names[s.status]}
                  </span>
                  <div className="actions">
                    {actions[s.status].map(([status, label]) => (
                      <button
                        key={status}
                        disabled={busy}
                        onClick={() =>
                          act(() =>
                            api("shipments/" + s.id, "PATCH", {
                              status,
                              version: s.version,
                            }),
                          )
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <History shipment={s} />
                </article>
              ))}
          </>
        ) : (
          <>
            <section className="mast">
              <h1>수신자 알림함</h1>
              <p>읽지 않은 알림 {inbox.filter((n) => !n.read_at).length}건</p>
            </section>
            <div className="filters">
              <button
                aria-pressed={!unreadOnly}
                onClick={() => setUnreadOnly(false)}
              >
                전체 알림
              </button>
              <button
                aria-pressed={unreadOnly}
                onClick={() => setUnreadOnly(true)}
              >
                읽지 않음
              </button>
            </div>
            {unreadOnly &&
              inbox.length > 0 &&
              inbox.every((n) => n.read_at) && (
                <p className="empty">모든 알림을 읽었습니다.</p>
              )}
            {!inbox.length && (
              <p>운영자 화면에서 배송을 시작하면 첫 알림이 도착합니다.</p>
            )}
            {inbox
              .filter((n) => !unreadOnly || !n.read_at)
              .map((n) => (
                <article
                  key={n.event_id}
                  className={n.read_at ? "read" : "unread"}
                >
                  <small>
                    {new Date(n.occurred_at).toLocaleString("ko-KR")}
                  </small>
                  <b>{n.destination}</b>
                  <p>{messages[n.event_type]}</p>
                  {n.read_at ? (
                    "읽음"
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          api("notifications/" + n.event_id + "/read", "PATCH"),
                        )
                      }
                    >
                      읽음 처리
                    </button>
                  )}
                </article>
              ))}
          </>
        )}
      </main>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
