import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
const fade = (frame: number, start: number, len = 20) =>
  interpolate(frame, [start, start + len], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
const rise = (frame: number, start: number, len = 24) =>
  interpolate(frame, [start, start + len], [16, 0], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export const Thesis1: React.FC = () => {
  const frame = useCurrentFrame();
  const items = ['什么时候', '做什么', '还缺什么'];

  return (
    <div style={{position: 'absolute', inset: 0, fontFamily: FONT}}>
      <div
        style={{
          position: 'absolute',
          left: 210,
          top: 300,
          opacity: fade(frame, 0, 16),
          transform: `translateY(${rise(frame, 0, 22)}px)`,
        }}
      >
        <div style={{width: 52, height: 3, background: C.brand, marginBottom: 30}} />
        <div
          style={{
            fontSize: 76,
            fontWeight: 600,
            lineHeight: 1.28,
            letterSpacing: '-0.025em',
            color: C.ink,
          }}
        >
          不替你判断真假。
        </div>
        <div
          style={{
            marginTop: 26,
            fontSize: 26,
            lineHeight: 1.7,
            color: C.muted,
            letterSpacing: '0.01em',
          }}
        >
          它只把每一条要求，连回原文。
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 1210,
          top: 330,
          width: 380,
          opacity: fade(frame, 22, 20),
          transform: `translateY(${rise(frame, 22, 26)}px)`,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: C.brand,
            letterSpacing: '0.18em',
            marginBottom: 18,
          }}
        >
          你会知道
        </div>
        {items.map((item, i) => (
          <div
            key={item}
            style={{
              borderTop: `1px solid ${C.line}`,
              padding: '16px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              opacity: fade(frame, 28 + i * 6, 16),
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 5,
                background: C.brand,
              }}
            />
            <span
              style={{
                fontSize: 30,
                fontWeight: 500,
                color: C.ink,
                letterSpacing: '0.02em',
              }}
            >
              {item}
            </span>
          </div>
        ))}
        <div style={{borderTop: `1px solid ${C.line}`}} />
      </div>
    </div>
  );
};

export const Thesis2: React.FC = () => {
  const frame = useCurrentFrame();
  const cardOpacity = fade(frame, 8, 18);
  const cardY = rise(frame, 8, 24);

  return (
    <div style={{position: 'absolute', inset: 0, fontFamily: FONT}}>
      <div
        style={{
          position: 'absolute',
          left: 210,
          top: 280,
          opacity: fade(frame, 0, 16),
          transform: `translateY(${rise(frame, 0, 22)}px)`,
        }}
      >
        <div style={{width: 52, height: 3, background: C.brand, marginBottom: 30}} />
        <div
          style={{
            fontSize: 68,
            fontWeight: 600,
            lineHeight: 1.32,
            letterSpacing: '-0.025em',
            color: C.ink,
          }}
        >
          每一条要求，
          <br />
          连回原文。
        </div>
        <div
          style={{
            marginTop: 30,
            fontSize: 23,
            lineHeight: 1.7,
            color: C.muted,
            maxWidth: 620,
          }}
        >
          点开每个字段，都能看到这一段。
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 1020,
          top: 280,
          width: 660,
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderLeft: `3px solid ${C.brand}`,
          boxShadow: '0 20px 50px rgba(32,32,30,0.08)',
          padding: '26px 32px 28px',
          opacity: cardOpacity,
          transform: `translateY(${cardY}px)`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: C.brand,
              border: `1px solid ${C.brand}`,
              borderRadius: 999,
              padding: '3px 9px',
              letterSpacing: '0.1em',
            }}
          >
            原文
          </span>
          <span style={{fontSize: 12, color: C.muted, letterSpacing: '0.03em'}}>
            unnc_notice.png
          </span>
        </div>
        <div
          style={{
            fontSize: 24,
            lineHeight: 1.8,
            color: C.ink,
            letterSpacing: '0.01em',
          }}
        >
          本次活动需要报名，请在11月12日之前登录下列链接完成注册：
        </div>
        <div
          style={{
            marginTop: 22,
            paddingTop: 16,
            borderTop: `1px solid ${C.line}`,
            fontSize: 12,
            color: C.faint,
            letterSpacing: '0.04em',
          }}
        >
          报名说明 · 抓取 2026-11-08
        </div>
      </div>
    </div>
  );
};
