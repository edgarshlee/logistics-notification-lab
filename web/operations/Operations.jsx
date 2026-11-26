import React from "react";
import { api, useAction, usePoll } from "../lib/api";
import Route, { eventSteps } from "../lib/Route";
import { eventNames, time } from "../lib/labels";

const faults = [
  ["none", "정상", "모든 메시지를 정상 처리합니다."],
  [
    "consume",
    "알림 저장 실패",
    "워커가 알림을 저장하지 못하고 메시지를 지우지 않습니다. 10초마다 다시 수신되고, 3번째 실패 뒤 SQS가 DLQ로 옮깁니다.",
  ],
  [
    "publish",
    "SQS 발행 실패",
    "아웃박스 이벤트를 SQS로 보내지 못합니다. 배송 상태는 저장되고, 발행은 최대 60초 간격으로 재시도됩니다.",
  ],
];
const actions = { created: "저장", duplicate: "중복 무시", failed: "실패" };

export default function Operations({ summary }) {
  const { data, error, reload } = usePoll("operations");
  const { busy, error: actError, act } = useAction(reload);
  const command = (kind, eventId) =>
    act(() => api("lab/commands", "POST", { kind, eventId }));
  const status = (kind, eventId) => {
    const c = data?.commands?.find((x) => x.kind === kind && x.event_id === eventId);
    if (!c) return null;
    if (!c.done_at) return <span className="cmd pending">요청 처리 중</span>;
    return c.error ? <span className="cmd failed">{c.error}</span> : <span className="cmd ok">완료</span>;
  };
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
      {actError && <p role="alert">{actError}</p>}
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
      <section className={"panel lab" + (data && data.fault !== "none" ? " armed" : "")}>
        <h2>장애 실험실</h2>
        <div className="segmented" role="group" aria-label="장애 주입">
          {faults.map(([value, label]) => (
            <button
              key={value}
              aria-pressed={data?.fault === value}
              disabled={busy || !data}
              onClick={() => act(() => api("lab/fault", "PUT", { value }))}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="lab-hint">{faults.find(([v]) => v === (data?.fault || "none"))[2]}</p>
        <h3>DLQ 메시지</h3>
        {data?.dlq?.length ? (
          <ul className="dlq">
            {data.dlq.map((m) => (
              <li key={m.event_id}>
                <div className="ev-head">
                  <b>{m.destination || "알 수 없는 배송"}</b>
                  <span>{eventNames[m.type] || m.type}</span>
                  <span className="id">{m.event_id.slice(0, 8)}</span>
                  <span>{time(m.seen_at)} 확인</span>
                </div>
                <div className="actions">
                  {status("replay", m.event_id)}
                  <button className="primary" disabled={busy} onClick={() => command("replay", m.event_id)}>
                    원본 큐로 재처리
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tl-quiet">
            DLQ가 비어 있습니다. "알림 저장 실패"를 켠 뒤 배송을 시작하면 약 30초 뒤 메시지가 들어옵니다.
          </p>
        )}
        <h3>워커 처리 기록</h3>
        {data?.log?.length ? (
          <ul className="consume-log">
            {data.log.map((l) => (
              <li key={l.id}>
                <span className={"act " + l.action}>{actions[l.action] || l.action}</span>
                <span>{l.destination || (l.event_id ? l.event_id.slice(0, 8) : "형식 오류")}</span>
                <span className="muted">{l.receive_count ? `${l.receive_count}번째 수신` : ""}</span>
                <span className="muted err">{l.error}</span>
                <time>{time(l.logged_at)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tl-quiet">워커가 메시지를 처리하면 결과가 여기에 쌓입니다.</p>
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
                {e.published_at && (
                  <div className="actions ev-actions">
                    {status("duplicate", e.id)}
                    <button disabled={busy} onClick={() => command("duplicate", e.id)}>
                      같은 이벤트 다시 보내기
                    </button>
                  </div>
                )}
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
                  {r.replayed_at ? "원본 큐로 재전송 " + time(r.replayed_at) : "복구 대기"}
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
