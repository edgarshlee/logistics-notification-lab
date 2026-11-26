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
      <div className="pagehead">
        <h1>배송 현황</h1>
        <form
          className="register"
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
            placeholder="예: 부산 물류센터"
            required
            maxLength={100}
            value={dest}
            onChange={(e) => setDest(e.target.value)}
          />
          <button className="primary" disabled={busy}>
            배송 등록
          </button>
        </form>
      </div>
      {(error || loadError) && <p role="alert">{error || loadError}</p>}
      <div className="toolbar">
        <div className="board" role="group" aria-label="상태별 배송 수와 필터">
          {Object.entries({ all: "전체", ...statusNames }).map(([key, label]) => (
            <button
              key={key}
              data-status={key}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              <span className="board-count">
                {shipments.filter((s) => key === "all" || s.status === key).length}
              </span>
              <span className="board-label">{label}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className="search"
          aria-label="배송 검색"
          placeholder="도착지 또는 운송 번호"
          maxLength={100}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className={"split" + (selectedId ? " has-selection" : "")}>
        <div className="list">
          {data && !visible.length ? (
            <p className="empty">
              {term
                ? `'${term}'와 일치하는 배송이 없습니다. 도착지 일부나 운송 번호 앞자리로 검색하세요.`
                : "이 상태의 배송이 없습니다. 위에서 도착지를 입력해 배송을 등록하세요."}
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
                    <td className="id">{s.id.slice(0, 8)}</td>
                    <td className="dest">
                      <a href={"#shipments/" + s.id} onClick={(e) => e.stopPropagation()}>
                        {s.destination}
                      </a>
                    </td>
                    <td>
                      <span className="state" data-status={s.status}>
                        {statusNames[s.status]}
                      </span>
                    </td>
                    <td className="when" title={new Date(s.updated_at).toLocaleString("ko-KR")}>
                      {ago(s.updated_at, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <aside className="detail" aria-label="배송 상세">
          {selectedId ? (
            <ShipmentDetail key={selectedId} id={selectedId} onChange={refresh} />
          ) : (
            <div className="panel hint">
              <p>
                목록에서 배송을 고르면 상태 이력과, 각 알림이 기록·발행·저장·읽음을 거쳐 간
                경로를 볼 수 있습니다.
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
