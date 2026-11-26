import React from "react";
import { after, dateTime, eventNames, statusNames, time } from "../lib/labels";

// 상태 이력 한 버전 = 타임라인 한 칸. 알림 대상 이벤트가 있으면
// 아웃박스 기록 → SQS 발행 → 알림 저장 → 읽음 단계를 그 아래에 붙인다.
export default function Timeline({ history }) {
  return (
    <ol className="timeline">
      {history.map((h, i) => (
        <li key={h.version} data-status={h.status}>
          <div className="step">
            <span className="version">v{h.version}</span>
            <b>{statusNames[h.status]}</b>
            <time dateTime={h.occurred_at}>{dateTime(h.occurred_at)}</time>
          </div>
          {h.note && <p className="note">사유: {h.note}</p>}
          <Delivery row={h} previous={history[i - 1]} />
        </li>
      ))}
    </ol>
  );
}

function Delivery({ row, previous }) {
  if (!row.event_id) {
    const text =
      row.status === "registered"
        ? "등록은 수신자 알림 대상이 아닙니다."
        : previous?.status === "exception"
          ? "배송 재개는 이력에만 기록하고 수신자에게 알리지 않습니다."
          : "연결된 알림 이벤트가 없습니다.";
    return <p className="muted">{text}</p>;
  }
  const from = row.occurred_at;
  const steps = [
    ["아웃박스 기록", from, eventNames[row.event_type]],
    row.published_at
      ? ["SQS 발행", row.published_at]
      : [
          "SQS 발행 대기",
          null,
          row.attempts
            ? `재시도 ${row.attempts}회 · 다음 시도 ${time(row.next_attempt)}`
            : "발행 워커가 곧 전송합니다.",
        ],
    row.stored_at ? ["알림 저장", row.stored_at] : ["알림 저장 대기", null],
    row.read_at ? ["수신자 읽음", row.read_at] : ["읽지 않음", null],
  ];
  return (
    <ul className="delivery" aria-label="알림 전달 단계">
      {steps.map(([label, at, extra]) => (
        <li key={label} className={at ? "done" : "pending"}>
          {label}
          {at && at !== from && <span className="lag">{after(from, at)}</span>}
          {extra && <span className="muted"> · {extra}</span>}
        </li>
      ))}
      <li className="event-id mono">이벤트 {row.event_id}</li>
    </ul>
  );
}
