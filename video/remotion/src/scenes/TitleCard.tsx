import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);

export const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();

  // 0.3s in, 1.8s hold, 0.3s out, 0.6s of paper breathing room.
  const inOpacity = interpolate(frame, [9, 18], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const inY = interpolate(frame, [9, 18], [12, 0], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const outOpacity = interpolate(frame, [72, 81], [1, 0], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const opacity = Math.min(inOpacity, outOpacity);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: C.paper,
        fontFamily: FONT,
        opacity,
        transform: `translateY(${inY}px)`,
      }}
    >
      <div
        style={{
          width: 48,
          height: 3,
          background: C.brand,
          marginBottom: 30,
        }}
      />
      <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
        <span
          style={{
            width: 11,
            height: 11,
            borderRadius: 11,
            background: C.brand,
            marginTop: 10,
          }}
        />
        <span
          style={{
            fontSize: 104,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: '0.06em',
            lineHeight: 1,
          }}
        >
          到点
        </span>
      </div>
      <div
        style={{
          marginTop: 28,
          fontSize: 32,
          fontWeight: 400,
          color: C.muted,
          letterSpacing: '0.02em',
          textAlign: 'center',
        }}
      >
        多来源校园信息行动台 → 有据可查的行动清单
      </div>
    </div>
  );
};
