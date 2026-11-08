import React from 'react';
import {
  Easing,
  Img,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {C, STAGE} from '../theme';
import type {Shot} from '../timeline';
import {Callout} from './Callout';
import {ScreenFrame} from './Chrome';

type Props = {
  shot: Extract<Shot, {kind: 'ui' | 'still'}>;
};

const PUSH_EASE = Easing.bezier(0.33, 0, 0.2, 1);

export const MediaShot: React.FC<Props> = ({shot}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();

  const zoomSpec = shot.zoom;
  const z = zoomSpec
    ? interpolate(
        frame,
        [0, Math.max(2, durationInFrames - 4)],
        [zoomSpec.from, zoomSpec.to],
        {
          easing: PUSH_EASE,
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        },
      )
    : 1;

  const focus = zoomSpec?.focus ?? [0.5, 0.5];
  const tx = (0.5 - focus[0]) * STAGE.w * z;
  const ty = (0.5 - focus[1]) * STAGE.h * z;

  const clipFrames =
    shot.kind === 'ui' ? Math.floor(shot.clipDuration * 30) : Infinity;
  const videoVisible = shot.kind === 'ui' && frame < clipFrames - 2;

  return (
    <ScreenFrame>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          background: C.paper,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: STAGE.w,
            height: STAGE.h,
            transform: `translate(${tx}px, ${ty}px) scale(${z})`,
            transformOrigin: 'center center',
          }}
        >
          {shot.kind === 'ui' ? (
            <Img
              src={staticFile(`media/clips/${shot.clip}-last.png`)}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <Img
              src={staticFile(`media/stills/${shot.image}`)}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          )}

          {videoVisible ? (
            <OffthreadVideo
              src={staticFile(`media/clips/${shot.clip}.mp4`)}
              muted
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : null}

          {shot.callouts?.map((spec) => (
            <Callout
              key={`${spec.from}-${spec.text}`}
              spec={spec}
              zoom={z}
              durationInFrames={durationInFrames}
            />
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
};
