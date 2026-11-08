import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import manifest from '../asset-manifest.json';
import {C, FONT, MONO} from '../theme';

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);

export const ExportCard: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 16], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [0, 22], [14, 0], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const {name, bytes} = manifest.ics;

  return (
    <div
      style={{
        position: 'absolute',
        left: 360,
        top: 300,
        width: 1200,
        height: 400,
        background: C.surface,
        border: `1px solid ${C.line}`,
        boxShadow: '0 24px 60px rgba(32,32,30,0.09)',
        opacity,
        transform: `translateY(${y}px)`,
        fontFamily: FONT,
        padding: '34px 42px',
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: C.muted,
          letterSpacing: '0.14em',
          marginBottom: 26,
        }}
      >
        导出结果
      </div>

      <div style={{display: 'flex', alignItems: 'flex-start', gap: 30}}>
        <div
          style={{
            position: 'relative',
            width: 46,
            height: 58,
            border: `1.5px solid ${C.brand}`,
            background: C.surface,
            flex: '0 0 46px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: -1.5,
              top: -1.5,
              width: 14,
              height: 14,
              background: C.paper,
              borderLeft: `1.5px solid ${C.brand}`,
              borderBottom: `1.5px solid ${C.brand}`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 8,
              textAlign: 'center',
              fontSize: 9,
              color: C.brand,
              letterSpacing: '0.08em',
              fontFamily: MONO,
            }}
          >
            ICS
          </div>
        </div>

        <div style={{flex: 1}}>
          <div
            style={{
              fontSize: 38,
              lineHeight: 1.2,
              color: C.ink,
              fontFamily: MONO,
              letterSpacing: '-0.02em',
            }}
          >
            {name}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 14,
              color: C.muted,
              letterSpacing: '0.03em',
            }}
          >
            {bytes} B · 真实下载文件
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 32,
          paddingTop: 20,
          borderTop: `1px solid ${C.line}`,
          fontSize: 14,
          color: C.muted,
          lineHeight: 1.8,
        }}
      >
        页面暂无提示；文件已生成，可导入日历。
      </div>

      <div
        style={{
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: C.faint,
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
        含活动与报名截止两个日程
      </div>
    </div>
  );
};
