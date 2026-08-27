// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ChangeEvent, JSX } from 'react';
import { useRef, useState } from 'react';

import { AxoButton } from '../../axo/AxoButton.dom.tsx';
import { AxoDialog } from '../../axo/AxoDialog.dom.tsx';
import { tw } from '../../axo/tw.dom.tsx';
import type { LinkPreviewEditType } from '../../types/LinkPreview.std.ts';
import { isValidLink } from '../../types/LinkPreview.std.ts';
import type { LinkPreviewForUIType } from '../../types/message/LinkPreviews.std.ts';
import type { LocalizerType } from '../../types/Util.std.ts';
import { Input } from '../Input.dom.tsx';

export type Props = Readonly<{
  i18n: LocalizerType;
  preview: LinkPreviewForUIType;
  onClose: () => void;
  onSave: (edit: LinkPreviewEditType) => Promise<void>;
}>;

export function LinkPreviewEditorModal({
  i18n,
  preview,
  onClose,
  onSave,
}: Props): JSX.Element {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(preview.url);
  const [title, setTitle] = useState(preview.title ?? '');
  const [description, setDescription] = useState(preview.description ?? '');
  const [image, setImage] = useState<File | null | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();

  const hasImage =
    image instanceof File || (image === undefined && preview.image);
  const imageName = image instanceof File ? image.name : undefined;

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selected = input.files?.[0];
    if (selected) {
      setImage(selected);
      setError(undefined);
    }
    input.value = '';
  };

  const handleSave = async () => {
    const normalizedUrl = url.trim();
    if (!isValidLink(normalizedUrl)) {
      setError(i18n('icu:LinkPreviewEditor__InvalidUrl'));
      return;
    }

    setIsSaving(true);
    setError(undefined);
    try {
      await onSave({ url: normalizedUrl, title, description, image });
      onClose();
    } catch (_error) {
      setError(i18n('icu:LinkPreviewEditor__InvalidImage'));
      setIsSaving(false);
    }
  };

  return (
    <AxoDialog.Root open onOpenChange={open => !open && onClose()}>
      <AxoDialog.Content size="sm" escape="cancel-is-destructive">
        <AxoDialog.Header>
          <AxoDialog.Title>
            {i18n('icu:LinkPreviewEditor__Title')}
          </AxoDialog.Title>
          <AxoDialog.Close />
        </AxoDialog.Header>
        <AxoDialog.Body>
          <div className={tw('flex flex-col gap-4')}>
            <label className={tw('flex flex-col gap-1 type-body-medium')}>
              <span className={tw('text-label-secondary')}>
                {i18n('icu:LinkPreviewEditor__Url')}
              </span>
              <Input
                i18n={i18n}
                maxByteCount={4096}
                onChange={value => {
                  setUrl(value);
                  setError(undefined);
                }}
                placeholder={i18n('icu:LinkPreviewEditor__UrlPlaceholder')}
                value={url}
              />
              <span className={tw('type-body-small text-label-secondary')}>
                {i18n('icu:LinkPreviewEditor__UrlHint')}
              </span>
            </label>
            <label className={tw('flex flex-col gap-1 type-body-medium')}>
              <span className={tw('text-label-secondary')}>
                {i18n('icu:LinkPreviewEditor__PreviewTitle')}
              </span>
              <Input
                i18n={i18n}
                maxByteCount={2048}
                onChange={setTitle}
                placeholder={i18n(
                  'icu:LinkPreviewEditor__PreviewTitlePlaceholder'
                )}
                value={title}
              />
            </label>
            <label className={tw('flex flex-col gap-1 type-body-medium')}>
              <span className={tw('text-label-secondary')}>
                {i18n('icu:LinkPreviewEditor__Description')}
              </span>
              <Input
                expandable
                forceTextarea
                i18n={i18n}
                maxByteCount={4096}
                onChange={setDescription}
                placeholder={i18n(
                  'icu:LinkPreviewEditor__DescriptionPlaceholder'
                )}
                value={description}
              />
            </label>
            <div className={tw('flex flex-col gap-2')}>
              <span className={tw('type-body-medium text-label-secondary')}>
                {i18n('icu:LinkPreviewEditor__Image')}
              </span>
              <input
                ref={imageInputRef}
                hidden
                type="file"
                accept="image/*"
                aria-label={i18n('icu:LinkPreviewEditor__ChooseImage')}
                onChange={handleImageChange}
              />
              <div className={tw('flex flex-wrap items-center gap-2')}>
                <AxoButton.Root
                  size="sm"
                  variant="secondary"
                  onClick={() => imageInputRef.current?.click()}
                >
                  {i18n('icu:LinkPreviewEditor__ChooseImage')}
                </AxoButton.Root>
                {hasImage && (
                  <AxoButton.Root
                    size="sm"
                    variant="borderless-destructive"
                    onClick={() => setImage(null)}
                  >
                    {i18n('icu:LinkPreviewEditor__RemoveImage')}
                  </AxoButton.Root>
                )}
              </div>
              {imageName && (
                <div
                  className={tw(
                    'truncate type-body-small text-label-secondary'
                  )}
                >
                  {imageName}
                </div>
              )}
              {error && (
                <div
                  className={tw('type-body-small text-color-label-destructive')}
                >
                  {error}
                </div>
              )}
            </div>
          </div>
        </AxoDialog.Body>
        <AxoDialog.Footer>
          <AxoDialog.Actions>
            <AxoDialog.Action
              variant="secondary"
              disabled={isSaving}
              onClick={onClose}
            >
              {i18n('icu:cancel')}
            </AxoDialog.Action>
            <AxoDialog.Action
              variant="primary"
              pending={isSaving}
              onClick={handleSave}
            >
              {i18n('icu:save')}
            </AxoDialog.Action>
          </AxoDialog.Actions>
        </AxoDialog.Footer>
      </AxoDialog.Content>
    </AxoDialog.Root>
  );
}
