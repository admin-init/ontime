import React from 'react';
import {Composition} from 'remotion';
import {Promo, type PromoProps} from './Promo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Promo105"
        component={Promo}
        durationInFrames={3150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{showSubtitles: true} satisfies PromoProps}
      />
      <Composition
        id="Promo105-NoSubs"
        component={Promo}
        durationInFrames={3150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{showSubtitles: false} satisfies PromoProps}
      />
    </>
  );
};
