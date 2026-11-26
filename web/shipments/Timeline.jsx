import React from "react";
import Route, { eventSteps } from "../lib/Route";
import { dateTime, statusNames } from "../lib/labels";

// 상태 이력 한 버전이 타임라인 한 칸. 알림 대상 이벤트가 있으면 그 경로를 붙인다.
export default function Timeline({ history }) {
  return (
    <ol className="timeline">
      {history.map((h, i) => (
        <li key={h.version} data-status={h.status}>
          <div className="tl-head">
            <span className="tl-version" aria-label={"버전 " + h.version}>
              {h.version}
            </span>
            <b>{statusNames[h.status]}</b>
            <time dateTime={h.occurred_at}>{dateTime(h.occurred_at)}</time>
          </div>
          {h.note && <p className="tl-note">사유: {h.note}</p>}
          {h.event_id ? (
            <>
              <Route steps={eventSteps(h)} from={h.occurred_at} />
              <p className="tl-event">
                이벤트 <span className="id">{h.event_id}</span>
              </p>
            </>
          ) : (
            <p className="tl-quiet">
              {h.status === "registered"
                ? "등록 단계에서는 수신자에게 알리지 않습니다."
                : history[i - 1]?.status === "exception"
                  ? "배송 재개는 이력에만 남기고 수신자에게 알리지 않습니다."
                  : "이 변경에 연결된 알림이 없습니다."}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
