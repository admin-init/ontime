import React from 'react';
import {Audio, Sequence, staticFile, useVideoConfig} from 'remotion';
import audio from '../audio-manifest.json';

/**
 * BGM enters at 0:09, 0.5s fade-in, 2s fade-out, 0.30.
 * Three whooshes build into the 18s / 40s / 62s act cuts at 0.12.
 */
export const Soundtrack: React.FC = () => {
  const {fps, durationInFrames} = useVideoConfig();

  if (!audio.bgm.exists) return null;

  const startFrame = Math.round(audio.bgm.inPoint * fps);
  const sourceFrame = Math.round(audio.bgm.sourceIn * fps);
  const sequenceFrames = durationInFrames - startFrame;
  const fadeIn = Math.max(1, Math.round(audio.bgm.fadeIn * fps));
  const fadeOut = Math.max(1, Math.round(audio.bgm.fadeOut * fps));
  const base = audio.bgm.volume;

  return (
    <>
      <Sequence
        from={startFrame}
        durationInFrames={sequenceFrames}
        layout="none"
      >
        <Audio
          src={staticFile(audio.bgm.file)}
          startFrom={sourceFrame}
          volume={(f) => {
            const gain = Math.min(
              1,
              f / fadeIn,
              (sequenceFrames - f) / fadeOut,
            );
            return base * Math.max(0, gain);
          }}
        />
      </Sequence>

      {audio.sfx
        .filter((s) => s.exists)
        .map((s, i) => (
          <Sequence
            key={`${s.file}-${s.at}-${i}`}
            from={Math.round((s.at - s.lead) * fps)}
            durationInFrames={Math.round(s.duration * fps)}
            layout="none"
          >
            <Audio src={staticFile(s.file)} volume={s.volume} />
          </Sequence>
        ))}
    </>
  );
};
