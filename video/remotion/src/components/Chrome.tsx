import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT, STAGE} from '../theme';
import {CHAPTERS, SHOTS} from '../timeline';

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

  const chapter = CHAPTERS.find((c) => t >= c.start && t < c.end)?.name;
  const note = 'note' in shot ? shot.note : undefined;

  return (
    <>
      {chapter ? (
        <div
          style={{
            position: 'absolute',
            left: 48,
            top: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontFamily: FONT,
            fontSize: 38,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 9,
              background: C.brand,
              display: 'inline-block',
              marginTop: 3,
            }}
          />
          <span style={{color: C.ink}}>到点</span>
          <span style={{color: C.muted}}>/</span>
          <span style={{color: C.muted}}>{chapter}</span>
        </div>
      ) : null}

      {note ? (
        <div
          style={{
            position: 'absolute',
            right: 1920 - STAGE.x - STAGE.w,
            top: 18,
            fontFamily: FONT,
            fontSize: 13,
            color: C.muted,
            letterSpacing: '0.03em',
          }}
        >
          {note}
        </div>
      ) : null}
    </>
  );
};

export const PaperFill: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill style={{backgroundColor: C.paper, fontFamily: FONT}}>
    {children}
  </AbsoluteFill>
);
