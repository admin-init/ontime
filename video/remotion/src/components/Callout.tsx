import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';
import type {CalloutSpec, Tone} from '../timeline';

const toneColor = (tone: Tone | undefined) => {
  if (tone === 'conflict') return C.conflict;
  if (tone === 'muted') return C.muted;
  return C.brand;
};

export const Callout: React.FC<{
  spec: CalloutSpec;
  zoom: number;
  durationInFrames: number;
}> = ({spec, zoom, durationInFrames}) => {
  const frame = useCurrentFrame();
  const from = spec.from * 30;
  const to = spec.to * 30;
  const opacity = interpolate(
    frame,
    [from, from + 5, Math.min(to - 4, durationInFrames - 2), to],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  if (opacity <= 0 || frame < from || frame > to) return null;

  const [x, y, w, h] = spec.box;
  const color = toneColor(spec.tone);
  const border = 2.5 / zoom;
  const fontSize = 23 / zoom;
  const padX = 9 / zoom;
  const padY = 5 / zoom;
  const gap = 8 / zoom;
  const side = spec.side ?? 'top';
  const isSide = side === 'left' || side === 'right';
  const labelWidth = isSide ? 170 / zoom : 'max-content';
  const labelMaxWidth = isSide ? undefined : 360 / zoom;

  const sideStyle: React.CSSProperties =
    side === 'bottom'
      ? {top: `calc(100% + ${gap}px)`, left: 0}
      : side === 'left'
        ? {
            right: `calc(100% + ${gap}px)`,
            top: '50%',
            transform: 'translateY(-50%)',
            textAlign: 'right',
          }
        : side === 'right'
          ? {
              left: `calc(100% + ${gap}px)`,
              top: '50%',
              transform: 'translateY(-50%)',
            }
          : {bottom: `calc(100% + ${gap}px)`, left: 0};

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
        border: `${border}px solid ${color}`,
        borderRadius: 3 / zoom,
        opacity,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          ...sideStyle,
          width: labelWidth,
          maxWidth: labelMaxWidth,
          padding: `${padY}px ${padX}px`,
          border: `${border}px solid ${color}`,
          borderRadius: 3 / zoom,
          background: 'rgba(247, 245, 241, 0.97)',
          color: C.ink,
          fontFamily: FONT,
          fontSize,
          fontWeight: 500,
          lineHeight: 1.3,
          letterSpacing: '0.01em',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
        }}
      >
        {spec.text}
      </div>
    </div>
  );
};
