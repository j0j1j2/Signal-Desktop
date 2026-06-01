// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

// Custom (research/debug): a viewer that shows the decoded contents of a
// message (its stored attributes = the parsed DataMessage) as JSON. Opened from
// the message right-click menu ("Show raw proto") via window.openRawMessageInspector.

function formatMessage(data: unknown): string {
  try {
    return JSON.stringify(
      data,
      (_key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        if (value instanceof Uint8Array) {
          return `<bytes:${value.byteLength}>`;
        }
        if (
          value != null &&
          typeof value === 'object' &&
          (value as { type?: unknown }).type === 'Buffer' &&
          Array.isArray((value as { data?: unknown }).data)
        ) {
          return `<bytes:${(value as { data: Array<unknown> }).data.length}>`;
        }
        return value;
      },
      2
    );
  } catch (error) {
    return `Could not serialize message: ${String(error)}`;
  }
}

export function RawMessageModal(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    (
      window as unknown as { openRawMessageInspector?: (data: unknown) => void }
    ).openRawMessageInspector = (data: unknown) => {
      setText(formatMessage(data));
      setOpen(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onCopy = useCallback(() => {
    void navigator.clipboard?.writeText(text);
  }, [text]);

  if (!open) {
    return null;
  }

  return (
    <div className="ProtoSend__overlay" role="dialog" aria-modal="true">
      <div className="ProtoSend__panel">
        <div className="ProtoSend__title">Raw message · decoded proto</div>
        <textarea
          className="ProtoSend__textarea"
          style={{ height: 380 }}
          readOnly
          spellCheck={false}
          value={text}
        />
        <div className="ProtoSend__buttons">
          <button type="button" className="ProtoSend__btn" onClick={onCopy}>
            Copy
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="ProtoSend__btn ProtoSend__btn--send"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
