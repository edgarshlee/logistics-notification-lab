import React, { useState } from "react";
import { api, useAction, usePoll } from "../lib/api";
import { ago, dateTime, eventMessages } from "../lib/labels";

export default function Inbox({ onChange }) {
  const { data, error: loadError, reload } = usePoll("notifications");
  const { busy, error, act } = useAction(async () => {
    await reload();
    onChange?.();
  });
  const [unreadOnly, setUnreadOnly] = useState(false);
  const inbox = data || [];
  const unread = inbox.filter((n) => !n.read_at).length;
  const visible = inbox.filter((n) => !unreadOnly || !n.read_at);
  const now = Date.now();
  return (
    <>
      <div className="pagehead">
        <h1>수신자 알림함</h1>
        <p className="lede">
          가상 수신자 한 명의 알림입니다. 읽지 않은 알림 <b>{unread}</b>건
        </p>
      </div>
      {(error || loadError) && <p role="alert">{error || loadError}</p>}
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="알림 필터">
          <button aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>
            전체 {inbox.length}
          </button>
          <button aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
            읽지 않음 {unread}
          </button>
        </div>
        <button
          disabled={busy || !unread}
          onClick={() => act(() => api("notifications/read-all", "PATCH"))}
        >
          모두 읽음으로 표시
        </button>
      </div>
      {data && !inbox.length && (
        <p className="empty">아직 알림이 없습니다. 운영자 화면에서 배송을 시작하면 몇 초 뒤 여기에 도착합니다.</p>
      )}
      {data && inbox.length > 0 && !visible.length && (
        <p className="empty">모든 알림을 읽었습니다.</p>
      )}
      <ul className="inbox">
        {visible.map((n) => (
          <li key={n.event_id} className={n.read_at ? "read" : "unread"}>
            <span className="dot" aria-hidden="true" />
            <div className="msg">
              <b>{n.destination}</b>
              <p>
                {eventMessages[n.event_type]}
                {n.detail && <span className="reason-text"> 사유: {n.detail}</span>}
              </p>
            </div>
            <time dateTime={n.occurred_at} title={dateTime(n.occurred_at)}>
              {ago(n.occurred_at, now)}
            </time>
            {n.read_at ? (
              <span className="read-mark">읽음</span>
            ) : (
              <button
                disabled={busy}
                onClick={() => act(() => api("notifications/" + n.event_id + "/read", "PATCH"))}
              >
                읽음으로 표시
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
