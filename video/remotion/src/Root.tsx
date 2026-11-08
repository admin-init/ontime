import React from 'react';
import {Composition} from 'remotion';
import {Promo, type PromoProps} from './Promo';
import {TOTAL_FRAMES} from './timeline';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Promo105"
        component={Promo}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{showSubtitles: true} satisfies PromoProps}
      />
      <Composition
        id="Promo105-NoSubs"
        component={Promo}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{showSubtitles: false} satisfies PromoProps}
      />
    </>
  );
};
