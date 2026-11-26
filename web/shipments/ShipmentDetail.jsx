import React, { useState } from "react";
import { api, useAction, usePoll } from "../lib/api";
import { statusActions, statusNames } from "../lib/labels";
import Timeline from "./Timeline";

export default function ShipmentDetail({ id, onChange }) {
  const { data, error: loadError, reload } = usePoll("shipments/" + id);
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState(null); // null: 예외 사유 입력창 닫힘
  const { busy, error, act } = useAction(async () => {
    await reload();
    await onChange?.();
  });
  if (loadError && !data)
    return (
      <div className="panel">
        <BackLink />
        <p role="alert">{loadError}</p>
      </div>
    );
  if (!data) return <div className="panel">불러오는 중…</div>;
  const { shipment, history } = data;
  function change(status, extra) {
    setNotice("");
    return act(async () => {
      try {
        await api("shipments/" + id, "PATCH", { status, version: shipment.version, ...extra });
        setReason(null);
      } catch (e) {
        if (e.status !== 409) throw e;
        // 다른 화면이나 요청이 먼저 상태를 바꿨다. 최신 상태를 다시 불러와 보여준다.
        setReason(null);
        setNotice("다른 요청이 먼저 이 배송을 변경했습니다. 최신 상태를 불러왔으니 다시 확인하세요.");
      }
    });
  }
  return (
    <div className="panel">
      <BackLink />
      <small className="mono">운송 번호 {shipment.id}</small>
      <h2>
        {shipment.destination}{" "}
        <span className={"status " + shipment.status}>{statusNames[shipment.status]}</span>
      </h2>
      {notice && <p className="notice">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {reason === null ? (
        <div className="actions">
          {statusActions[shipment.status].map(([status, label]) => (
            <button
              key={status}
              disabled={busy}
              onClick={() => (status === "exception" ? setReason("") : change(status))}
            >
              {label}
            </button>
          ))}
          {!statusActions[shipment.status].length && (
            <span className="muted">배송이 완료되어 더 바꿀 상태가 없습니다.</span>
          )}
        </div>
      ) : (
        <form
          className="reason"
          onSubmit={(e) => {
            e.preventDefault();
            change("exception", { reason });
          }}
        >
          <label htmlFor="reason">예외 사유</label>
          <input
            id="reason"
            autoFocus
            required
            maxLength={100}
            placeholder="예: 수취인 부재, 주소 불명"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button disabled={busy}>예외 등록</button>
          <button type="button" className="plain" onClick={() => setReason(null)}>
            취소
          </button>
        </form>
      )}
      <h3>추적 타임라인</h3>
      <Timeline history={history} />
    </div>
  );
}

function BackLink() {
  return (
    <a className="back" href="#shipments">
      ← 목록
    </a>
  );
}
