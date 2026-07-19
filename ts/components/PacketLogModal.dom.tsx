// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { PacketEntry } from '../util/packetLog.std.ts';
import { getPackets, clearPackets } from '../util/packetLog.std.ts';

// Custom (research/debug): a viewer for the last ~500 Signal Content protos that
// came in or went out this session. Opened with Cmd/Ctrl+Shift+K or
// window.openPacketLog().

function formatTime(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function PacketLogModal(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ReadonlyArray<PacketEntry>>([]);
  const [selected, setSelected] = useState(0);

  const refresh = useCallback(() => {
    // newest first
    const snapshot = [...getPackets()].reverse();
    setItems(snapshot);
    setSelected(0);
  }, []);

  const openModal = useCallback(() => {
    refresh();
    setOpen(true);
  }, [refresh]);

  useEffect(() => {
    (window as unknown as { openPacketLog?: () => void }).openPacketLog =
      openModal;
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        openModal();
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openModal]);

  const current = items[selected];

  const onCopy = useCallback(() => {
    if (current) {
      void navigator.clipboard?.writeText(current.json);
    }
  }, [current]);

  if (!open) {
    return null;
  }

  return (
    <div className="ProtoSend__overlay" role="dialog" aria-modal="true">
      <div className="ProtoSend__panel PacketLog__panel">
        <div className="ProtoSend__title">
          {`Packet log · ${items.length} recent`}
        </div>
        <div className="PacketLog__body">
          <div className="PacketLog__list">
            {items.length === 0 && (
              <div className="PacketLog__empty">No packets captured yet.</div>
            )}
            {items.map((item, index) => (
              <button
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                type="button"
                className={
                  index === selected
                    ? 'PacketLog__row PacketLog__row--selected'
                    : 'PacketLog__row'
                }
                onClick={() => setSelected(index)}
              >
                <span
                  className={`PacketLog__dir PacketLog__dir--${item.direction}`}
                >
                  {item.direction === 'in' ? '↓ in' : '↑ out'}
                </span>
                <span className="PacketLog__type">{item.type}</span>
                <span className="PacketLog__time">{formatTime(item.at)}</span>
              </button>
            ))}
          </div>
          <textarea
            aria-label="Decoded packet"
            className="ProtoSend__textarea PacketLog__detail"
            readOnly
            spellCheck={false}
            value={current ? current.json : ''}
          />
        </div>
        <div className="ProtoSend__buttons">
          <button type="button" className="ProtoSend__btn" onClick={refresh}>
            Refresh
          </button>
          <button
            type="button"
            className="ProtoSend__btn"
            onClick={() => {
              clearPackets();
              refresh();
            }}
          >
            Clear
          </button>
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
