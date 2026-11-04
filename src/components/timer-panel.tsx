"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { refreshTimerAction, startTimerAction, stopTimerAction } from "@/app/timer/actions";
import { formatClock } from "@/lib/format.ts";
import type { TimerState } from "@/lib/timer.ts";

type Props = {
  initial: TimerState;
  serverNow: string; // 서버가 화면을 만든 시각 (첫 화면을 서버와 똑같이 그리기 위해)
  focusMinutes: number;
  breakMinutes: number;
};

type Permission = NotificationPermission | "unsupported";

function readPermission(): Permission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

// 알림 권한은 브라우저가 가진 값이라서, React 가 바뀐 걸 알 수 있게 "구독" 방식으로 읽는다.
const permissionListeners = new Set<() => void>();
function subscribePermission(callback: () => void): () => void {
  permissionListeners.add(callback);
  let status: PermissionStatus | undefined;
  navigator.permissions
    ?.query({ name: "notifications" })
    .then((s) => {
      status = s;
      s.onchange = callback; // 주소창에서 권한을 바꿨을 때도 반영
    })
    .catch(() => {});
  return () => {
    permissionListeners.delete(callback);
    if (status) status.onchange = null;
  };
}

function notify(title: string, body: string) {
  if (readPermission() !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {
    // 일부 환경에서는 알림 생성이 실패할 수 있다. 화면 표시는 그대로 동작한다.
  }
}

export function TimerPanel({ initial, serverNow, focusMinutes, breakMinutes }: Props) {
  const [timer, setTimer] = useState<TimerState>(initial);
  const [now, setNow] = useState(() => Date.parse(serverNow));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const permission = useSyncExternalStore(subscribePermission, readPermission, (): Permission => "default");

  // 1초마다 호출되는 함수가 항상 최신 값을 보도록 ref 에 담아 둔다.
  const timerRef = useRef(timer);
  const settling = useRef(false);
  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);

  // 화면 갱신용 1초 시계. 남은 시간은 숫자를 세는 게 아니라 (끝나는 시각 − 지금)으로 매번 계산한다.
  useEffect(() => {
    const id = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      const t = timerRef.current;
      if (t.phase === "focus" && current >= Date.parse(t.endsAt) && !settling.current) {
        settling.current = true;
        void refreshTimerAction()
          .then((result) => {
            if (result.ok) {
              setTimer(result.state);
              notify("집중 끝!", `${breakMinutes}분 쉬어요. 먼 곳을 20초 바라보세요.`);
            }
          })
          .finally(() => {
            settling.current = false;
          });
      } else if (t.phase === "break" && current >= Date.parse(t.endsAt)) {
        setTimer({ phase: "idle" });
        notify("휴식 끝", "준비되면 다음 집중을 시작해요.");
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [breakMinutes]);

  const remainingMs = timer.phase === "idle" ? 0 : Date.parse(timer.endsAt) - now;
  const clock = formatClock(remainingMs);

  // 다른 탭을 보고 있어도 탭 제목으로 남은 시간을 알 수 있다.
  useEffect(() => {
    const previous = document.title;
    if (timer.phase === "focus") document.title = `${clock} 집중 · RecallNote`;
    if (timer.phase === "break") document.title = `${clock} 휴식 · RecallNote`;
    return () => {
      document.title = previous;
    };
  }, [clock, timer.phase]);

  async function call(action: () => Promise<Awaited<ReturnType<typeof startTimerAction>>>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.ok) {
        setTimer(result.state);
        setNow(Date.now());
      } else {
        setError(result.message);
      }
    } catch {
      setError("서버와 연결이 끊겼어요. 서버가 켜져 있는지 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function askPermission() {
    if (typeof Notification === "undefined") return;
    await Notification.requestPermission();
    permissionListeners.forEach((callback) => callback()); // 화면에 바뀐 권한을 반영
  }

  return (
    <section aria-label="공부 타이머">
      {timer.phase === "idle" && (
        <div>
          <p className="mb-6 text-muted">
            집중 {focusMinutes}분 → 휴식 {breakMinutes}분. 시간은 <a href="/settings">설정</a>에서 바꿀 수 있어요.
          </p>
          <button type="button" disabled={busy} onClick={() => void call(startTimerAction)} className="btn btn-primary text-lg">
            집중 시작 ({focusMinutes}분)
          </button>
        </div>
      )}

      {timer.phase === "focus" && (
        <div>
          <p className="text-muted">집중 중 · {timer.plannedMinutes}분</p>
          <p className="my-2 text-7xl font-semibold tabular-nums" role="timer" aria-label={`남은 시간 ${clock}`}>
            {clock}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("중지할까요? 지금까지 집중한 시간만 기록돼요.")) void call(stopTimerAction);
            }}
            className="btn mt-4"
          >
            중지
          </button>
        </div>
      )}

      {timer.phase === "break" && (
        <div>
          <p className="text-muted">휴식 중 · {timer.breakMinutes}분</p>
          <p className="my-2 text-5xl font-semibold tabular-nums" role="timer" aria-label={`남은 휴식 ${clock}`}>
            {clock}
          </p>
          <div className="panel my-6">
            <p className="text-3xl font-semibold leading-snug">먼 곳을 20초 바라보세요</p>
            <ul className="mt-4 space-y-1 text-lg text-muted">
              <li>눈을 천천히 깜빡여 주세요</li>
              <li>어깨와 목을 가볍게 돌려 보세요</li>
              <li>물을 한 모금 마셔요</li>
            </ul>
          </div>
          <button type="button" disabled={busy} onClick={() => void call(startTimerAction)} className="btn">
            바로 다음 집중 시작
          </button>
        </div>
      )}

      {error && (
        <p className="mt-4 text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="mt-10 border-t border-border pt-4 text-sm text-muted">
        {permission === "default" && (
          <>
            <button type="button" onClick={() => void askPermission()} className="btn">
              알림 켜기
            </button>
            <p className="mt-2">집중·휴식이 끝나면 알려 드려요. 이 탭이 열려 있을 때만 알림이 와요.</p>
          </>
        )}
        {permission === "granted" && <p>알림 켜짐 · 이 탭이 열려 있을 때만 알림이 와요.</p>}
        {permission === "denied" && <p>알림이 브라우저에서 차단돼 있어요. 주소창 왼쪽 아이콘에서 허용할 수 있어요.</p>}
        {permission === "unsupported" && <p>이 브라우저는 알림을 지원하지 않아요.</p>}
      </div>
    </section>
  );
}
