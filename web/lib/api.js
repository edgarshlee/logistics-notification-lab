import { useCallback, useEffect, useRef, useState } from "react";

export async function api(path, method = "GET", body) {
  const res = await fetch("/api/" + path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // 프록시 오류 페이지처럼 JSON이 아닌 응답은 아래에서 상태 코드로 안내한다.
  }
  if (!res.ok) {
    const message = data?.message;
    throw Error(
      Array.isArray(message)
        ? message.join(", ")
        : message || `요청을 처리하지 못했습니다. (HTTP ${res.status})`,
    );
  }
  return data;
}

// 주기적으로 API를 조회한다. 탭이 숨겨지면 멈추고, 다시 보이면 즉시 갱신한다.
// 늦게 도착한 이전 응답이 최신 응답을 덮어쓰지 않도록 요청 순번을 비교한다.
export function usePoll(path, ms = 3000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const issued = useRef(0);
  const applied = useRef(0);
  const reload = useCallback(async () => {
    const id = ++issued.current;
    try {
      const next = await api(path);
      if (id > applied.current) {
        applied.current = id;
        setData(next);
        setError("");
      }
    } catch (e) {
      if (id > applied.current) {
        applied.current = id;
        setError(e.message);
      }
    }
  }, [path]);
  useEffect(() => {
    let timer;
    const start = () => {
      clearInterval(timer);
      if (document.hidden) return;
      reload();
      timer = setInterval(reload, ms);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", start);
      applied.current = issued.current = issued.current + 1;
    };
  }, [reload, ms]);
  return { data, error, reload };
}

// 버튼 동작 공통 처리: 진행 중 표시, 오류 메시지, 완료 후 갱신.
export function useAction(after) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await after?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, act };
}
