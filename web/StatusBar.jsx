import React from "react";

// 워커가 3초마다 남기는 큐 스냅샷의 나이로 워커 상태를 판단한다.
// 나이는 서버 시계 기준으로 계산해 브라우저 시계 차이의 영향을 받지 않는다.
export default function StatusBar({ summary, error }) {
  if (error) return <p className="statusbar warn">시스템 상태를 조회할 수 없습니다. {error}</p>;
  if (!summary) return <p className="statusbar">시스템 상태 확인 중…</p>;
  const { sampleAge, queue, pendingOutbox } = summary;
  const stale = sampleAge == null || sampleAge > 15;
  return (
    <p className={"statusbar" + (stale ? " warn" : "")} aria-live="polite">
      <span>
        {sampleAge == null
          ? "워커 첫 수집 대기"
          : stale
            ? `워커 응답 없음 · 마지막 수집 ${Math.round(sampleAge)}초 전`
            : `워커 정상 · ${Math.max(0, Math.round(sampleAge))}초 전 수집`}
      </span>
      <span>아웃박스 발행 대기 {pendingOutbox}건</span>
      <span>SQS 대기 {queue?.waiting ?? "—"}건</span>
      <span className={queue?.dead ? "alarm" : ""}>DLQ {queue?.dead ?? "—"}건</span>
    </p>
  );
}
