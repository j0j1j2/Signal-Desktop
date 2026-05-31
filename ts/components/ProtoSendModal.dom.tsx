// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ChangeEvent, JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  sendRawDataMessage,
  uploadFileForProto,
} from '../util/debugSendProto.preload.ts';
import { getSelectedConversationId } from '../state/selectors/nav.std.ts';

type UploadType = { name: string; pointer: Record<string, unknown> };

// Custom (research/debug): a modal to manually send a hand-written DataMessage
// (as JSON) to the members of the currently-open conversation. Opened with
// Cmd/Ctrl+Shift+P, or window.openRawProtoSend() from the dev console.

type MemberType = { title: string; aci: string };
type TargetType = {
  id: string;
  title: string;
  partnerAci: string;
  members: ReadonlyArray<MemberType>;
};

// Template presets for common DataMessage shapes. `aci` is the recipient's
// ACI (auto-filled for 1:1 conversations) used to prefill author/target fields.
function buildPresets(aci: string): ReadonlyArray<{ label: string; value: string }> {
  const now = Date.now();
  const author = aci || '<recipient-aci-uuid>';
  return [
    {
      label: 'Text',
      value: `{
  "body": "raw protobuf test"
}`,
    },
    {
      label: 'Reply (quote)',
      value: `{
  "body": "raw quote reply",
  "quote": {
    "id": ${now},
    "authorAci": "${author}",
    "text": "original preview text",
    "type": 0
  }
}`,
    },
    {
      label: 'Reaction',
      value: `{
  "reaction": {
    "emoji": "\u{1F44D}",
    "remove": false,
    "targetAuthorAci": "${author}",
    "targetTimestamp": ${now}
  }
}`,
    },
    {
      label: 'Skeleton (all common fields)',
      value: `{
  "body": "text",
  "bodyRanges": [],
  "preview": [],
  "expireTimer": 0,
  "quote": {
    "id": ${now},
    "authorAci": "${author}",
    "text": "preview",
    "type": 0
  },
  "reaction": {
    "emoji": "\u{2764}",
    "remove": false,
    "targetAuthorAci": "${author}",
    "targetTimestamp": ${now}
  }
}`,
    },
  ];
}

const DEFAULT_SAMPLE = buildPresets('')[0]?.value ?? '{ "body": "test" }';

export function ProtoSendModal(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState(DEFAULT_SAMPLE);
  const [status, setStatus] = useState<string | null>(null);
  const [target, setTarget] = useState<TargetType | null>(null);
  const [echo, setEcho] = useState(true);
  const [uploads, setUploads] = useState<ReadonlyArray<UploadType>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openModal = useCallback(() => {
    const state = window.reduxStore?.getState();
    const id = state ? getSelectedConversationId(state) : undefined;
    if (!id) {
      setTarget(null);
      setStatus('Open a conversation first.');
    } else {
      const convo = window.ConversationController.get(id);
      const recipients = convo?.getRecipients() ?? [];
      const members: Array<MemberType> = recipients.map(serviceId => {
        const aci = String(serviceId);
        const member = window.ConversationController.get(aci);
        return { aci, title: member?.getTitle() ?? aci };
      });
      setTarget({
        id,
        title: convo?.getTitle() ?? id,
        partnerAci: recipients.length === 1 ? String(recipients[0]) : '',
        members,
      });
      setStatus(null);
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'p'
      ) {
        event.preventDefault();
        openModal();
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    (
      window as unknown as { openRawProtoSend?: () => void }
    ).openRawProtoSend = openModal;
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openModal]);

  const onSend = useCallback(async () => {
    if (!target) {
      setStatus('No conversation selected.');
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      setStatus(`Invalid JSON: ${String(error)}`);
      return;
    }

    // Merge any uploaded attachments (their bytes can't live in the JSON text).
    if (uploads.length > 0) {
      const existing = Array.isArray(parsed.attachments)
        ? (parsed.attachments as Array<unknown>)
        : [];
      parsed.attachments = [...existing, ...uploads.map(item => item.pointer)];
    }

    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      `Send a raw DataMessage to "${target.title}" and all its members?\n\n` +
        'This goes to real recipients through the encrypted pipeline.'
    );
    if (!confirmed) {
      return;
    }

    try {
      setStatus('Sending…');
      const result = await sendRawDataMessage(target.id, parsed, { echo });
      setStatus(
        `Sent to ${result.recipients} recipient(s) at ${result.timestamp}.`
      );
    } catch (error) {
      setStatus(`Error: ${String(error)}`);
    }
  }, [json, target, echo, uploads]);

  const onPickFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      for (const file of files) {
        try {
          setStatus(`Uploading ${file.name}…`);
          // eslint-disable-next-line no-await-in-loop
          const up = await uploadFileForProto(file);
          setUploads(prev => [...prev, up]);
          setStatus(`Attached ${file.name}.`);
        } catch (error) {
          setStatus(`Upload failed for ${file.name}: ${String(error)}`);
        }
      }
    },
    []
  );

  // Fill the author fields (quote.authorAci / reaction.targetAuthorAci) of the
  // current JSON with the picked member's ACI.
  const applyAuthor = useCallback(
    (aci: string) => {
      try {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const quote = parsed.quote as Record<string, unknown> | undefined;
        if (quote) {
          quote.authorAci = aci;
        }
        const reaction = parsed.reaction as Record<string, unknown> | undefined;
        if (reaction) {
          reaction.targetAuthorAci = aci;
        }
        setJson(JSON.stringify(parsed, null, 2));
        setStatus(`Set author to ${aci}`);
      } catch {
        void navigator.clipboard?.writeText(aci);
        setStatus(`Copied ${aci} (JSON not valid to auto-fill).`);
      }
    },
    [json]
  );

  if (!open) {
    return null;
  }

  return (
    <div className="ProtoSend__overlay" role="dialog" aria-modal="true">
      <div className="ProtoSend__panel">
        <div className="ProtoSend__title">Raw protobuf send · debug</div>
        <div className="ProtoSend__warn">
          {'⚠ Research/debug only. Encodes this JSON as a '}
          <code>Content.dataMessage</code>
          {' and sends it to all members of '}
          <strong>{target ? target.title : '(no conversation open)'}</strong>
          {' through the normal encrypted pipeline. Use only with your own or '}
          {'consenting test accounts.'}
        </div>
        <div className="ProtoSend__presets">
          {buildPresets(target?.partnerAci ?? '').map(preset => (
            <button
              key={preset.label}
              type="button"
              className="ProtoSend__preset"
              onClick={() => setJson(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {target != null && target.members.length > 0 && (
          <div className="ProtoSend__members">
            <span className="ProtoSend__members-label">
              Set author (click):
            </span>
            {target.members.map(member => (
              <button
                key={member.aci}
                type="button"
                className="ProtoSend__member"
                title={member.aci}
                onClick={() => applyAuthor(member.aci)}
              >
                {member.title}
              </button>
            ))}
          </div>
        )}
        <textarea
          className="ProtoSend__textarea"
          value={json}
          spellCheck={false}
          onChange={event => setJson(event.target.value)}
        />
        <div className="ProtoSend__attach">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={onPickFile}
          />
          <button
            type="button"
            className="ProtoSend__preset"
            onClick={() => fileInputRef.current?.click()}
          >
            + Attach file / photo
          </button>
          {uploads.map((item, index) => (
            <span key={`${item.name}-${index}`} className="ProtoSend__upload">
              {item.name}
              <button
                type="button"
                className="ProtoSend__upload-remove"
                aria-label="Remove"
                onClick={() =>
                  setUploads(prev => prev.filter((_, i) => i !== index))
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {status != null && <div className="ProtoSend__status">{status}</div>}
        <div className="ProtoSend__buttons">
          <label className="ProtoSend__echo">
            <input
              type="checkbox"
              checked={echo}
              onChange={event => setEcho(event.target.checked)}
            />
            Echo to my timeline
          </label>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="ProtoSend__btn"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ProtoSend__btn ProtoSend__btn--send"
            onClick={onSend}
            disabled={target == null}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
