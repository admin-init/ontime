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

const Arrow: React.FC<{left: number; top: number; delay: number}> = ({
  left,
  top,
  delay,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [delay, delay + 20], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: 94,
        height: 1,
        background: C.lineStrong,
        transform: `scaleX(${p})`,
        transformOrigin: 'left center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: -3,
          width: 7,
          height: 7,
          borderTop: `1px solid ${C.lineStrong}`,
          borderRight: `1px solid ${C.lineStrong}`,
          transform: 'rotate(45deg)',
        }}
      />
    </div>
  );
};

const Box: React.FC<{
  left: number;
  index: string;
  title: string;
  desc: string;
  delay: number;
}> = ({left, index, title, desc, delay}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: 370,
        width: 400,
        height: 190,
        borderTop: `2px solid ${C.brand}`,
        background: C.surface,
        borderRight: `1px solid ${C.line}`,
        borderBottom: `1px solid ${C.line}`,
        borderLeft: `1px solid ${C.line}`,
        padding: '24px 26px',
        opacity: fade(frame, delay, 18),
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: C.faint,
          letterSpacing: '0.14em',
          marginBottom: 18,
        }}
      >
        {index}
      </div>
      <div
        style={{
          fontSize: 27,
          fontWeight: 600,
          color: C.ink,
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 15,
          lineHeight: 1.7,
          color: C.muted,
        }}
      >
        {desc}
      </div>
    </div>
  );
};

export const Concept: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <div style={{position: 'absolute', inset: 0, fontFamily: FONT}}>
      <div
        style={{
          position: 'absolute',
          left: 210,
          top: 215,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          opacity: fade(frame, 0, 16),
        }}
      >
        <span
          style={{
            fontSize: 40,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: '-0.02em',
          }}
        >
          指定网站查询
        </span>
        <span
          style={{
            fontSize: 12,
            color: C.muted,
            border: `1px solid ${C.lineStrong}`,
            borderRadius: 999,
            padding: '4px 10px',
            letterSpacing: '0.08em',
          }}
        >
          规划
        </span>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 210,
          top: 300,
          fontSize: 16,
          color: C.muted,
          opacity: fade(frame, 6, 16),
        }}
      >
        用户授权之后，才去读指定的公开页面。
      </div>

      <Box
        left={210}
        index="01 / 入口"
        title="指定网站"
        desc="用户给出的公开页面地址，而不是全站抓取。"
        delay={10}
      />
      <Box
        left={760}
        index="02 / 授权"
        title="用户授权"
        desc="API，或用户授权的浏览器会话。"
        delay={18}
      />
      <Box
        left={1310}
        index="03 / 结果"
        title="来源卡"
        desc="原文、域名、检索时间，逐条可回溯。"
        delay={26}
      />

      <Arrow left={626} top={465} delay={28} />
      <Arrow left={1176} top={465} delay={36} />

      <div
        style={{
          position: 'absolute',
          left: 210,
          top: 690,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 14,
          color: C.muted,
          opacity: fade(frame, 44, 18),
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 5,
            background: C.faint,
          }}
        />
        规划能力 · 概念示意，尚未接入
      </div>
    </div>
  );
};
