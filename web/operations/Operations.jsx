import React from "react";
import { usePoll } from "../lib/api";
import Route, { eventSteps } from "../lib/Route";
import { eventNames, time } from "../lib/labels";

export default function Operations({ summary }) {
  const { data, error } = usePoll("operations");
  const snap = data?.snapshot,
    q = snap?.sample;
  const stale = snap && Date.now() - Date.parse(snap.sampled_at) > 15000;
  return (
    <>
      <div className="pagehead">
        <h1>알림 운영</h1>
        <p className="lede">AWS Emulator의 SQS Standard 큐와 DLQ를 워커가 3초마다 조회한 근사치입니다.</p>
      </div>
      {error && <p role="alert">운영 정보를 불러오지 못했습니다. 3초 뒤 다시 시도합니다.</p>}
      <section className="panel">
        <h2>파이프라인</h2>
        {q ? (
          <>
            <ol className="pipeline" aria-label="알림 파이프라인 단계별 건수">
              <li>
                <span className="pl-count">{summary?.pendingOutbox ?? "–"}</span>
                <span className="pl-label">아웃박스 발행 대기</span>
              </li>
              <li>
                <span className="pl-count">{q.waiting}</span>
                <span className="pl-label">SQS 대기</span>
              </li>
              <li>
                <span className="pl-count">{q.processing}</span>
                <span className="pl-label">워커 처리 중</span>
              </li>
              <li className={"pl-dlq" + (q.dead ? " alarm" : "")}>
                <span className="pl-count">{q.dead}</span>
                <span className="pl-label">DLQ</span>
              </li>
            </ol>
            <dl className="facts queue-facts">
              <div>
                <dt>원본 큐</dt>
                <dd className="id">{q.queue}</dd>
              </div>
              <div>
                <dt>실패 큐</dt>
                <dd className="id">{q.dlq}</dd>
              </div>
              <div>
                <dt>가시성 타임아웃</dt>
                <dd>{q.visibility}초</dd>
              </div>
              <div>
                <dt>DLQ 이동 기준</dt>
                <dd>수신 {q.limit}회</dd>
              </div>
              <div>
                <dt>마지막 수집</dt>
                <dd className={stale ? "stale" : ""}>
                  {time(snap.sampled_at)}
                  {stale && " (지연)"}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="tl-quiet">워커가 첫 큐 상태를 수집하면 표시됩니다.</p>
        )}
      </section>
      <section className="panel">
        <h2>최근 배송 이벤트</h2>
        {data?.events?.length ? (
          <ul className="events">
            {data.events.map((e) => (
              <li key={e.id}>
                <div className="ev-head">
                  <b>{e.destination}</b>
                  <span>{eventNames[e.type]}</span>
                  <span className="id">{e.id.slice(0, 8)}</span>
                </div>
                <Route steps={eventSteps(e)} from={e.occurred_at} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="tl-quiet">배송을 시작하면 이벤트가 여기에 쌓입니다.</p>
        )}
      </section>
      <section className="panel">
        <h2>DLQ 복구 기록</h2>
        {data?.replays?.length ? (
          <ul className="replays">
            {data.replays.map((r) => (
              <li key={r.event_id}>
                <span className="id">{r.event_id}</span>
                <span>DLQ 도착 {time(r.observed_at)}</span>
                <span className={r.replayed_at ? "ok" : "pending"}>
                  {r.replayed_at ? "재처리 후 알림 확인 " + time(r.replayed_at) : "복구 대기"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tl-quiet">
            아직 복구 기록이 없습니다. README의 장애 복구 테스트를 실행하면 생깁니다.
          </p>
        )}
      </section>
    </>
  );
}
