// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Slider } from './Slider.dom.tsx';

// Custom: a small always-visible control at the top of the app to adjust the
// window's opacity (transparency). The chosen value is remembered across
// restarts via localStorage and re-applied on mount.

const STORAGE_KEY = 'windowOpacity';
const MIN_OPACITY = 30;

function readStoredOpacity(): number {
  const saved = Number(window.localStorage.getItem(STORAGE_KEY));
  if (Number.isFinite(saved) && saved >= MIN_OPACITY && saved <= 100) {
    return saved;
  }
  return 100;
}

export function OpacitySlider(): JSX.Element {
  const [value, setValue] = useState<number>(readStoredOpacity);

  const apply = (percent: number): void => {
    window.SignalContext.setWindowOpacity(percent / 100);
  };

  // Re-apply the remembered opacity when the app loads.
  useEffect(() => {
    apply(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (raw: number): void => {
    const clamped = Math.max(MIN_OPACITY, Math.min(100, Math.round(raw)));
    setValue(clamped);
    window.localStorage.setItem(STORAGE_KEY, String(clamped));
    apply(clamped);
  };

  return (
    <div className="OpacityControl">
      <Slider
        label="Window transparency"
        moduleClassName="OpacityControl__slider"
        value={value}
        onChange={onChange}
        containerStyle={{ width: 90 }}
      />
    </div>
  );
}
