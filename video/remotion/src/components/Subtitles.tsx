import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import captions from '../captions.json';
import {C, FONT} from '../theme';

type Caption = {start: number; end: number; text: string};
const CAPTIONS = captions as Caption[];

export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const active = CAPTIONS.find((c) => {
    const from = Math.round(c.start * 30);
    const to = Math.round(c.end * 30);
    return frame >= from && frame < to;
  });
  if (!active) return null;

  const from = Math.round(active.start * 30);
  const to = Math.round(active.end * 30);
  const local = frame - from;
  const duration = to - from;
  const opacity = interpolate(
    local,
    [0, 5, Math.max(6, duration - 5), duration],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 16,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity,
      }}
    >
      <div
        style={{
          maxWidth: 1500,
          padding: '9px 20px',
          borderRadius: 8,
          background: 'rgba(32, 32, 30, 0.80)',
          color: '#FFFEFC',
          fontFamily: FONT,
          fontSize: 34,
          fontWeight: 500,
          lineHeight: 1.38,
          letterSpacing: '0.015em',
          textAlign: 'center',
          whiteSpace: 'pre-line',
        }}
      >
        {active.text}
      </div>
    </div>
  );
};
