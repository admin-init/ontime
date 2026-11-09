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

const Column: React.FC<{
  x: number;
  label: string;
  value: string;
  sub?: string;
  source: string;
  quote: string;
  delay: number;
  align: 'left' | 'right';
}> = ({x, label, value, sub, source, quote, delay, align}) => {
  const frame = useCurrentFrame();
  const opacity = fade(frame, delay, 18);
  const dx = interpolate(frame, [delay, delay + 22], [align === 'left' ? -18 : 18, 0], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 300,
        width: 700,
        opacity,
        transform: `translateX(${dx}px)`,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: C.muted,
          letterSpacing: '0.12em',
          marginBottom: 18,
          textAlign: align,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: value.length > 8 ? 38 : 46,
          fontWeight: 600,
          lineHeight: 1.3,
          color: C.ink,
          letterSpacing: '-0.02em',
          textAlign: align,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div
          style={{
            fontSize: 22,
            color: C.muted,
            marginTop: 8,
            textAlign: align,
          }}
        >
          {sub}
        </div>
      ) : null}
      <div
        style={{
          marginTop: 26,
          fontSize: 13,
          color: C.faint,
          letterSpacing: '0.04em',
          textAlign: align,
        }}
      >
        {source}
      </div>
      <div
        style={{
          marginTop: 22,
          borderLeft: `2px solid ${C.lineStrong}`,
          paddingLeft: 18,
          fontSize: 19,
          lineHeight: 1.75,
          color: C.muted,
          textAlign: 'left',
        }}
      >
        {quote}
      </div>
    </div>
  );
};

export const DualValue: React.FC = () => {
  const frame = useCurrentFrame();
  const titleOpacity = fade(frame, 0, 16);

  return (
    <div style={{position: 'absolute', inset: 0, fontFamily: FONT}}>
      <div
        style={{
          position: 'absolute',
          left: 210,
          top: 190,
          opacity: titleOpacity,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 7,
            background: C.conflict,
          }}
        />
        <span
          style={{
            fontSize: 28,
            color: C.muted,
            letterSpacing: '0.04em',
          }}
        >
          同一字段，两种说法
        </span>
      </div>

      <Column
        x={210}
        label="官网通知"
        value="思源报告厅"
        source="unnc_notice.png"
        quote="地点：思源报告厅"
        delay={8}
        align="left"
      />
      <Column
        x={1010}
        label="群聊"
        value="劳伦斯报告厅"
        sub="Lawrence Auditorium"
        source="unnc_chat.png"
        quote="地点改了！思源报告厅这周被占了，改到劳伦斯报告厅 Lawrence Auditorium。"
        delay={14}
        align="left"
      />

      <div
        style={{
          position: 'absolute',
          left: 950,
          top: 300,
          width: 1,
          height: 430,
          background: C.line,
          opacity: titleOpacity,
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 210,
          top: 810,
          fontSize: 14,
          color: C.muted,
          letterSpacing: '0.03em',
          opacity: fade(frame, 26, 18),
        }}
      >
        两种说法都保留；由你选一个。
      </div>
    </div>
  );
};
