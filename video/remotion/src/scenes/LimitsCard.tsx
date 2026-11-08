import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
const fade = (frame: number, start: number, len = 16) =>
  interpolate(frame, [start, start + len], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
const rise = (frame: number, start: number, len = 20) =>
  interpolate(frame, [start, start + len], [12, 0], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const rows = [
  {label: '邮箱自动连接（IMAP）', status: '已实现 · 待验证', delay: 14},
  {label: '第三方 API 源', status: '已实现 · 未验证', delay: 20},
  {label: '推送', status: '规划', delay: 26},
];

export const LimitsCard: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <div style={{position: 'absolute', inset: 0, fontFamily: FONT}}>
      <div
        style={{
          position: 'absolute',
          left: 210,
          top: 230,
          width: 1400,
          opacity: fade(frame, 0, 14),
          transform: `translateY(${rise(frame, 0, 18)}px)`,
        }}
      >
        <div style={{width: 52, height: 3, background: C.brand, marginBottom: 26}} />
        <div
          style={{
            fontSize: 13,
            color: C.brand,
            letterSpacing: '0.18em',
            marginBottom: 18,
          }}
        >
          边界
        </div>
        <div
          style={{
            fontSize: 54,
            fontWeight: 600,
            lineHeight: 1.35,
            letterSpacing: '-0.02em',
            color: C.ink,
          }}
        >
          能力边界，写清楚。
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 24,
            lineHeight: 1.7,
            color: C.muted,
          }}
        >
          没有真实账号或 Key 的，不写成已验证。
        </div>

        <div style={{marginTop: 34, borderTop: `1px solid ${C.line}`}}>
          {rows.map((row) => (
            <div
              key={row.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 24,
                padding: '18px 0',
                borderBottom: `1px solid ${C.line}`,
                opacity: fade(frame, row.delay, 14),
                transform: `translateY(${rise(frame, row.delay, 18)}px)`,
              }}
            >
              <span
                style={{
                  fontSize: 30,
                  fontWeight: 500,
                  color: C.ink,
                  letterSpacing: '0.01em',
                }}
              >
                {row.label}
              </span>
              <span
                style={{
                  fontSize: 15,
                  color: C.muted,
                  border: `1px solid ${C.lineStrong}`,
                  borderRadius: 999,
                  padding: '5px 14px',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
