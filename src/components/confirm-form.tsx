"use client";

import type { ReactNode } from "react";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  className?: string;
  children: ReactNode;
};

/** 버튼을 누르면 먼저 확인 창을 띄우고, "확인"을 눌렀을 때만 서버 동작을 실행한다. */
export function ConfirmForm({ action, message, className, children }: Props) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
