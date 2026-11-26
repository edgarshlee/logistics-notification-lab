import React from "react";
import { after, time } from "./labels";

// 알림 한 건이 지나가는 체크포인트. 완료된 지점은 채워진 점, 다음 지점은 노란 점.
export function eventSteps(e) {
  return [
    { label: "기록", at: e.occurred_at },
    {
      label: "발행",
      at: e.published_at,
      note: e.attempts ? `재시도 ${e.attempts}회, 다음 ${time(e.next_attempt)}` : "발행 대기",
    },
    { label: "저장", at: e.stored_at, note: "저장 대기" },
    { label: "읽음", at: e.read_at, note: "읽지 않음" },
  ];
}

export default function Route({ steps, from }) {
  const next = steps.findIndex((s) => !s.at);
  return (
    <ol className="route" style={{ "--n": steps.length }}>
      {steps.map((s, i) => (
        <li key={s.label} className={s.at ? "done" : i === next ? "next" : "todo"}>
          <span className="cp-label">{s.label}</span>
          <span className="cp-when">
            {s.at ? (s.at === from ? time(s.at) : after(from, s.at)) : s.note}
          </span>
        </li>
      ))}
    </ol>
  );
}
