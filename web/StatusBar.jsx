import React from "react";

// 워커가 3초마다 남기는 큐 스냅샷의 나이로 워커 상태를 판단한다(서버 시계 기준).
export default function StatusBar({ summary, error }) {
  if (error)
    return (
      <div className="sys warn" role="status">
        <span className="sys-state">상태 조회 실패</span>
        <span className="sys-detail">{error}</span>
      </div>
    );
  if (!summary)
    return (
      <div className="sys" role="status">
        <span className="sys-state">상태 확인 중</span>
      </div>
    );
  const { sampleAge, queue, pendingOutbox } = summary;
  const stale = sampleAge == null || sampleAge > 15;
  const age = Math.max(0, Math.round(sampleAge ?? 0));
  return (
    <div className={"sys" + (stale ? " warn" : "")} role="status" aria-live="polite">
      <span className="sys-state">
        {sampleAge == null ? "워커 시작 대기" : stale ? "워커 응답 없음" : "워커 정상"}
      </span>
      {sampleAge != null && <span className="sys-detail">{age}초 전 수집</span>}
      <dl className="sys-counts">
        <div>
          <dt>발행 대기</dt>
          <dd>{pendingOutbox}</dd>
        </div>
        <div>
          <dt>SQS</dt>
          <dd>{queue?.waiting ?? "–"}</dd>
        </div>
        <div className={queue?.dead ? "alarm" : ""}>
          <dt>DLQ</dt>
          <dd>{queue?.dead ?? "–"}</dd>
        </div>
      </dl>
    </div>
  );
}
