import React from 'react';
import {Sequence} from 'remotion';
import {PaperFill, TopBar} from './components/Chrome';
import {MediaShot} from './components/MediaShot';
import {Soundtrack} from './components/Soundtrack';
import {Subtitles} from './components/Subtitles';
import {SHOTS} from './timeline';
import {Concept} from './scenes/Concept';
import {DualValue} from './scenes/DualValue';
import {EndCard} from './scenes/EndCard';
import {Opening} from './scenes/Opening';
import {Statement} from './scenes/Statement';
import {Thesis1, Thesis2} from './scenes/Thesis';
import {TitleCard} from './scenes/TitleCard';

export type PromoProps = {
  showSubtitles: boolean;
};

const ShotBody: React.FC<{shot: (typeof SHOTS)[number]}> = ({shot}) => {
  switch (shot.kind) {
    case 'title':
      return <TitleCard />;
    case 'ui':
    case 'still':
      return <MediaShot shot={shot} />;
    case 'thesis1':
      return <Thesis1 />;
    case 'thesis2':
      return <Thesis2 />;
    case 'dual':
      return <DualValue />;
    case 'statement':
      return <Statement variant={shot.variant} />;
    case 'concept':
      return <Concept />;
    case 'end':
      return <EndCard />;
    default:
      return null;
  }
};

export const Promo: React.FC<PromoProps> = ({showSubtitles}) => {
  const opening = SHOTS.filter((s) => s.kind === 'open');
  const openingStart = opening.length
    ? Math.round(opening[0].start * 30)
    : 90;
  const openingEnd = opening.length
    ? Math.round(opening[opening.length - 1].end * 30)
    : 390;

  return (
    <PaperFill>
      <Soundtrack />

      <Sequence
        from={openingStart}
        durationInFrames={openingEnd - openingStart}
        name="opening"
        layout="none"
      >
        <Opening />
      </Sequence>

      {SHOTS.filter((s) => s.kind !== 'open').map((shot) => {
        const from = Math.round(shot.start * 30);
        const to = Math.round(shot.end * 30);
        return (
          <Sequence
            key={shot.id}
            from={from}
            durationInFrames={Math.max(1, to - from)}
            name={shot.id}
            layout="none"
          >
            <ShotBody shot={shot} />
          </Sequence>
        );
      })}

      <TopBar />
      {showSubtitles ? <Subtitles /> : null}
    </PaperFill>
  );
};
