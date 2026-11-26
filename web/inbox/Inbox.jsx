import React, { useState } from "react";
import { api, useAction, usePoll } from "../lib/api";
import { dateTime, eventMessages } from "../lib/labels";

export default function Inbox({ onChange }) {
  const { data, error: loadError, reload } = usePoll("notifications");
  const { busy, error, act } = useAction(async () => {
    await reload();
    onChange?.();
  });
  const [unreadOnly, setUnreadOnly] = useState(false);
  const inbox = data || [];
  return (
    <>
      {(error || loadError) && <p role="alert">{error || loadError}</p>}
      <section className="mast">
        <h1>수신자 알림함</h1>
        <p>읽지 않은 알림 {inbox.filter((n) => !n.read_at).length}건</p>
      </section>
      <div className="filters">
        <button aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>
          전체 알림
        </button>
        <button aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
          읽지 않음
        </button>
      </div>
      {unreadOnly && inbox.length > 0 && inbox.every((n) => n.read_at) && (
        <p className="empty">모든 알림을 읽었습니다.</p>
      )}
      {data && !inbox.length && (
        <p>운영자 화면에서 배송을 시작하면 첫 알림이 도착합니다.</p>
      )}
      {inbox
        .filter((n) => !unreadOnly || !n.read_at)
        .map((n) => (
          <article key={n.event_id} className={n.read_at ? "read" : "unread"}>
            <small>{dateTime(n.occurred_at)}</small>
            <b>{n.destination}</b>
            <p>{eventMessages[n.event_type]}</p>
            {n.read_at ? (
              "읽음"
            ) : (
              <button
                disabled={busy}
                onClick={() => act(() => api("notifications/" + n.event_id + "/read", "PATCH"))}
              >
                읽음 처리
              </button>
            )}
          </article>
        ))}
    </>
  );
}
