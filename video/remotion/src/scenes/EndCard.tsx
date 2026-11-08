import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import audioManifest from '../audio-manifest.json';
import {C, FONT} from '../theme';

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [0, 26], [16, 0], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT,
        paddingBottom: 70,
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 20}}>
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 14,
            background: C.brand,
            marginTop: 10,
          }}
        />
        <span
          style={{
            fontSize: 88,
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
          fontSize: 40,
          lineHeight: 1.55,
          color: C.ink,
          textAlign: 'center',
          letterSpacing: '0.01em',
        }}
      >
        把散落的信息，
        <br />
        变成有据可查的行动。
      </div>

      <div
        style={{
          width: 120,
          height: 1,
          background: C.brand,
          margin: '38px 0 30px',
          opacity: 0.7,
        }}
      />

      <div
        style={{
          maxWidth: 1320,
          fontSize: 22,
          lineHeight: 1.8,
          color: C.muted,
          textAlign: 'center',
          letterSpacing: '0.01em',
        }}
      >
        真实运行：截图识别、跨来源关联、冲突处理、联网核实。入口展示：官网同步、邮箱接入、推送提醒。
        规划：自定义网站查询。
      </div>

      <div
        style={{
          marginTop: 16,
          maxWidth: 1320,
          fontSize: 13,
          lineHeight: 1.7,
          color: C.faint,
          textAlign: 'center',
          letterSpacing: '0.02em',
        }}
      >
        演示素材：宁波诺丁汉大学公开活动页（真实）· 群聊（自拟）· 抓取 2026-11-08
      </div>

      <div
        style={{
          marginTop: 8,
          maxWidth: 1320,
          fontSize: 12.5,
          lineHeight: 1.6,
          color: C.faint,
          textAlign: 'center',
          letterSpacing: '0.02em',
        }}
      >
        {audioManifest.attribution}
      </div>
    </div>
  );
};
