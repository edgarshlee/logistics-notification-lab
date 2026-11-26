import React, { useEffect, useState } from "react";
const time = (value) => new Date(value).toLocaleTimeString("ko-KR");
const types = {
  ShipmentInTransit: "배송 시작",
  ShipmentExceptionRaised: "배송 예외",
  ShipmentDelivered: "배송 완료",
};
export default function Operations() {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    async function refresh() {
      try {
        const res = await fetch("/api/operations");
        if (!res.ok) throw Error();
        const next = await res.json();
        if (live) {
          setData(next);
          setError("");
        }
      } catch {
        if (live)
          setError("운영 정보를 조회할 수 없습니다. 잠시 후 다시 시도합니다.");
      }
    }
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  const snap = data?.snapshot,
    q = snap?.sample;
  return (
    <>
      <section className="mast">
        <h1>알림 운영</h1>
        <p>AWS Emulator · SQS Standard Queue</p>
      </section>
      {error && <p role="alert">{error}</p>}
      <h2>큐 현황</h2>
      {q ? (
        <>
          <small>
            {time(snap.sampled_at)} 수집 · SQS 근사치
            {Date.now() - Date.parse(snap.sampled_at) > 15000
              ? " · 갱신 지연"
              : ""}
          </small>
          <div className="metrics">
            {[
              ["발행 후 대기", q.waiting],
              ["수신 후 처리 중", q.processing],
              ["DLQ 대기", q.dead],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <b>{value ?? "—"}</b> 건
              </div>
            ))}
          </div>
          <article>
            <b>{q.queue}</b>
            <p>
              가시성 타임아웃 {q.visibility}초 · 최대 수신 {q.limit}회
            </p>
            <small>실패 큐 → {q.dlq}</small>
          </article>
        </>
      ) : (
        <p>워커의 첫 큐 상태 수집을 기다리는 중입니다.</p>
      )}
      <h2>DLQ 복구 이력</h2>
      {data?.replays?.length ? (
        data.replays.map((r) => (
          <article key={r.event_id}>
            <small>이벤트 {r.event_id}</small>
            <strong>DLQ 수신 {time(r.observed_at)}</strong> →{" "}
            {r.replayed_at
              ? "재전송 및 알림 확인 " + time(r.replayed_at)
              : "복구 확인 대기"}
          </article>
        ))
      ) : (
        <p>
          아직 확인된 복구 이력이 없습니다. README의 장애 복구 테스트로 재현할
          수 있습니다.
        </p>
      )}
      <h2>최근 배송 이벤트</h2>
      {data?.events.map((e) => (
        <article key={e.id}>
          <small>이벤트 {e.id}</small>
          <b>{e.destination}</b> · {types[e.type]}
          <p>
            아웃박스 기록 →{" "}
            {e.published_at ? "SQS 발행 " + time(e.published_at) : "발행 대기"}{" "}
            → {e.stored ? "알림 저장 완료" : "알림 저장 대기"}{" "}
            {e.stored_at && time(e.stored_at)}
          </p>
        </article>
      ))}
    </>
  );
}
