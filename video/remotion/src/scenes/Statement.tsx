import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
const fade = (frame: number, start: number, len = 18) =>
  interpolate(frame, [start, start + len], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
const rise = (frame: number, start: number, len = 22) =>
  interpolate(frame, [start, start + len], [14, 0], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export const Statement: React.FC<{variant: 'conflict' | 'verify'}> = ({
  variant,
}) => {
  const frame = useCurrentFrame();
  const isVerify = variant === 'verify';

  return (
    <div style={{position: 'absolute', inset: 0, fontFamily: FONT}}>
      <div style={{position: 'absolute', left: 210, top: 280}}>
        <div
          style={{
            width: 52,
            height: 3,
            background: C.brand,
            marginBottom: 26,
            opacity: fade(frame, 0, 14),
          }}
        />
        <div
          style={{
            fontSize: 13,
            color: C.brand,
            letterSpacing: '0.18em',
            marginBottom: 22,
            opacity: fade(frame, 2, 14),
          }}
        >
          {isVerify ? '核实' : '冲突'}
        </div>

        {isVerify ? (
          <>
            <div
              style={{
                fontSize: 62,
                fontWeight: 600,
                lineHeight: 1.38,
                letterSpacing: '-0.02em',
                color: C.ink,
                opacity: fade(frame, 8, 18),
                transform: `translateY(${rise(frame, 8, 20)}px)`,
              }}
            >
              找到，就引用。
            </div>
            <div
              style={{
                fontSize: 62,
                fontWeight: 600,
                lineHeight: 1.38,
                letterSpacing: '-0.02em',
                color: C.ink,
                opacity: fade(frame, 16, 18),
                transform: `translateY(${rise(frame, 16, 20)}px)`,
              }}
            >
              找不到，就说没找到。
            </div>
          </>
        ) : (
          <div
            style={{
              fontSize: 68,
              fontWeight: 600,
              lineHeight: 1.38,
              letterSpacing: '-0.02em',
              color: C.ink,
              opacity: fade(frame, 8, 18),
              transform: `translateY(${rise(frame, 8, 20)}px)`,
            }}
          >
            冲突不替你决定。
          </div>
        )}

        <div
          style={{
            marginTop: 28,
            fontSize: 26,
            lineHeight: 1.7,
            color: C.muted,
            opacity: fade(frame, 24, 18),
          }}
        >
          {isVerify
            ? '来源、域名、原文，都在画面里。'
            : '两种说法，和各自的出处，摆在一起。'}
        </div>

        {isVerify ? (
          <div
            style={{
              marginTop: 44,
              display: 'flex',
              gap: 14,
              opacity: fade(frame, 32, 18),
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: C.brand,
                border: `1px solid ${C.brand}`,
                borderRadius: 999,
                padding: '8px 16px',
                letterSpacing: '0.02em',
              }}
            >
              官方来源 · 域名 · 原文
            </span>
            <span
              style={{
                fontSize: 14,
                color: C.muted,
                border: `1px solid ${C.lineStrong}`,
                borderRadius: 999,
                padding: '8px 16px',
                letterSpacing: '0.02em',
              }}
            >
              未找到明确适用的官方依据
            </span>
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: 'absolute',
          right: 210,
          bottom: 240,
          fontSize: 13,
          color: C.faint,
          letterSpacing: '0.14em',
          opacity: fade(frame, 30, 18),
          writingMode: 'vertical-rl',
        }}
      >
        到点 / PRINCIPLE
      </div>
    </div>
  );
};
