import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT, STAGE} from '../theme';
import {SHOTS} from '../timeline';

export const ScreenFrame: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({children, style}) => {
  return (
    <div
      style={{
        position: 'absolute',
        left: STAGE.x,
        top: STAGE.y,
        width: STAGE.w,
        height: STAGE.h,
        overflow: 'hidden',
        background: C.paper,
        border: `1px solid ${C.line}`,
        boxShadow: '0 22px 60px rgba(32, 32, 30, 0.10)',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const TopBar: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const shot =
    SHOTS.find((s) => t >= s.start && t < s.end) ?? SHOTS[SHOTS.length - 1];

  if (shot.hideBar) return null;

  const mutedTag =
    shot.tag?.includes('入口') ||
    shot.tag?.includes('规划') ||
    shot.tag?.includes('示意') ||
    shot.tag?.includes('对照') ||
    shot.tag?.includes('真实文件');
  const note = 'note' in shot ? shot.note : undefined;

  return (
    <div
      style={{
        position: 'absolute',
        left: STAGE.x,
        right: 1920 - STAGE.x - STAGE.w,
        top: 18,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: FONT,
        fontSize: 12,
        color: C.muted,
        letterSpacing: '0.04em',
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 9}}>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 5,
            background: C.brand,
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: '0.06em',
          }}
        >
          到点
        </span>
        <span style={{color: C.lineStrong}}>/</span>
        <span>{shot.label}</span>
      </div>

      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        {note ? (
          <span style={{fontSize: 12, color: C.muted, letterSpacing: '0.02em'}}>
            {note}
          </span>
        ) : null}
        {shot.tag ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 8px',
              border: `1px solid ${C.lineStrong}`,
              borderRadius: 999,
              background: 'rgba(255, 254, 252, 0.72)',
              fontSize: 11,
              letterSpacing: '0.05em',
              color: C.muted,
            }}
          >
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: 4,
                background: mutedTag ? C.faint : C.brand,
                display: 'inline-block',
              }}
            />
            {shot.tag}
          </span>
        ) : null}
      </div>
    </div>
  );
};

export const PaperFill: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill style={{backgroundColor: C.paper, fontFamily: FONT}}>
    {children}
  </AbsoluteFill>
);
