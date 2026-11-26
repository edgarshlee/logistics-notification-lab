import React, { useState } from "react";
import { api, useAction, usePoll } from "../lib/api";
import { statusActions, statusNames } from "../lib/labels";
import History from "./History";

export default function Shipments({ onChange }) {
  const { data, error: loadError, reload } = usePoll("shipments");
  const { busy, error, act } = useAction(async () => {
    await reload();
    onChange?.();
  });
  const [filter, setFilter] = useState("all");
  const [dest, setDest] = useState("");
  const shipments = data || [];
  const visible = shipments.filter((s) => filter === "all" || s.status === filter);
  return (
    <>
      {(error || loadError) && <p role="alert">{error || loadError}</p>}
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
        {Object.entries({ all: "전체", ...statusNames }).map(([key, label]) => (
          <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}{" "}
            <span>
              {shipments.filter((s) => key === "all" || s.status === key).length}
            </span>
          </button>
        ))}
      </div>
      {data && !visible.length && <p className="empty">해당 상태의 배송이 없습니다.</p>}
      {visible.map((s) => (
        <article key={s.id}>
          <small>운송 번호 {s.id.slice(0, 8)}</small>
          <b>{s.destination}</b>{" "}
          <span className={"status " + s.status}>{statusNames[s.status]}</span>
          <div className="actions">
            {statusActions[s.status].map(([status, label]) => (
              <button
                key={status}
                disabled={busy}
                onClick={() =>
                  act(() =>
                    api("shipments/" + s.id, "PATCH", { status, version: s.version }),
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
  );
}
