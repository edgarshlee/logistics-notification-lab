import React, { useEffect, useState } from "react";
import { api, useAction, usePoll } from "../lib/api";
import { ago, statusNames } from "../lib/labels";
import ShipmentDetail from "./ShipmentDetail";

const open = (id) => {
  location.hash = id ? "shipments/" + id : "shipments";
};

export default function Shipments({ selectedId, onChange }) {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const { data, error: loadError, reload } = usePoll(
    "shipments" + (term ? "?q=" + encodeURIComponent(term) : ""),
  );
  const refresh = async () => {
    await reload();
    onChange?.();
  };
  const { busy, error, act } = useAction(refresh);
  const [filter, setFilter] = useState("all");
  const [dest, setDest] = useState("");
  const shipments = data || [];
  const visible = shipments.filter((s) => filter === "all" || s.status === filter);
  const now = Date.now();
  return (
    <>
      {(error || loadError) && <p role="alert">{error || loadError}</p>}
      <section className="mast">
        <h1>배송 현황</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              const created = await api("shipments", "POST", { destination: dest });
              setDest("");
              open(created.id);
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
      <div className="toolbar">
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
        <input
          type="search"
          className="search"
          aria-label="배송 검색"
          placeholder="도착지·운송 번호 검색"
          maxLength={100}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className={"split" + (selectedId ? " has-selection" : "")}>
        <div className="list">
          {data && !visible.length ? (
            <p className="empty">
              {term ? `'${term}'에 해당하는 배송이 없습니다.` : "해당 상태의 배송이 없습니다."}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">운송 번호</th>
                  <th scope="col">도착지</th>
                  <th scope="col">상태</th>
                  <th scope="col">마지막 변경</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr
                    key={s.id}
                    aria-current={s.id === selectedId || undefined}
                    onClick={() => open(s.id)}
                  >
                    <td className="mono">{s.id.slice(0, 8)}</td>
                    <td>
                      <a href={"#shipments/" + s.id} onClick={(e) => e.stopPropagation()}>
                        {s.destination}
                      </a>
                    </td>
                    <td>
                      <span className={"status " + s.status}>{statusNames[s.status]}</span>
                    </td>
                    <td title={new Date(s.updated_at).toLocaleString("ko-KR")}>
                      {ago(s.updated_at, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <aside className="detail">
          {selectedId ? (
            <ShipmentDetail key={selectedId} id={selectedId} onChange={refresh} />
          ) : (
            <p className="hint">
              배송을 선택하면 상태 이력과 알림 전달 과정을 추적 타임라인으로 볼 수 있습니다.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
