import React from 'react';
import {
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {C, FONT} from '../theme';

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);

type CardProps = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  label: string;
  index: number;
  dim: number;
  children: React.ReactNode;
};

const Card: React.FC<CardProps> = ({
  left,
  top,
  width,
  height,
  rotate,
  label,
  index,
  dim,
  children,
}) => {
  const frame = useCurrentFrame();
  const start = index * 8;
  const opacity = interpolate(frame, [start, start + 22], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [start, start + 26], [18, 0], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scatterX = dim * (index === 0 ? -90 : index === 1 ? 90 : 0);
  const scatterY = dim * (index === 0 ? -46 : index === 1 ? -24 : 62);

  return (
    <div
      style={{
        position: 'absolute',
        left: left + scatterX,
        top: top + scatterY + y,
        width,
        height,
        transform: `rotate(${rotate}deg)`,
        opacity: opacity * (1 - dim * 0.62),
        filter: dim > 0.01 ? `blur(${dim * 2.4}px)` : undefined,
        background: C.surface,
        border: `1px solid ${C.line}`,
        boxShadow:
          dim > 0.01
            ? '0 12px 30px rgba(32,32,30,0.06)'
            : '0 24px 50px rgba(32,32,30,0.10)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 38,
          flex: '0 0 38px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 15px',
          borderBottom: `1px solid ${C.line}`,
          background: C.surface,
          fontFamily: FONT,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: C.muted,
            letterSpacing: '0.06em',
          }}
        >
          {label}
        </span>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 5,
            background: index === 2 ? C.faint : C.brand,
          }}
        />
      </div>
      <div style={{position: 'relative', flex: 1, overflow: 'hidden'}}>
        {children}
      </div>
    </div>
  );
};

const Calendar: React.FC = () => {
  const days = Array.from({length: 14}, (_, i) => i + 9);
  const cell = (d: number) => {
    if (d === 12) {
      return (
        <div
          key={d}
          style={{
            width: 34,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 16,
            background: C.brand,
            color: '#FFFEFC',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {d}
        </div>
      );
    }
    if (d === 15) {
      return (
        <div
          key={d}
          style={{
            width: 34,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 16,
            border: `1.5px solid ${C.brand}`,
            color: C.brand,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {d}
        </div>
      );
    }
    return (
      <div
        key={d}
        style={{
          width: 34,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          color: d < 9 ? C.faint : C.ink,
        }}
      >
        {d}
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: '18px 20px 16px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: FONT,
        background: C.surface,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span style={{fontSize: 14, fontWeight: 600, color: C.ink}}>
          十一月 2026
        </span>
        <span style={{fontSize: 11, color: C.faint, letterSpacing: '0.06em'}}>
          日历示意
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          rowGap: 2,
          marginBottom: 14,
        }}
      >
        {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
          <div
            key={w}
            style={{
              fontSize: 10,
              color: C.faint,
              textAlign: 'center',
              height: 18,
            }}
          >
            {w}
          </div>
        ))}
        {days.map((d) => (
          <div key={d} style={{display: 'flex', justifyContent: 'center'}}>
            {cell(d)}
          </div>
        ))}
      </div>
      <div
        style={{
          borderTop: `1px solid ${C.line}`,
          paddingTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 9}}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 6,
              background: C.brand,
            }}
          />
          <span style={{fontSize: 13, color: C.ink, fontWeight: 500}}>
            11月12日 周四
          </span>
          <span style={{fontSize: 13, color: C.muted}}>报名截止</span>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 9}}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 6,
              border: `1.5px solid ${C.brand}`,
            }}
          />
          <span style={{fontSize: 13, color: C.ink, fontWeight: 500}}>
            11月15日 周日
          </span>
          <span style={{fontSize: 13, color: C.muted}}>09:30 讲座</span>
        </div>
      </div>
    </div>
  );
};

export const Opening: React.FC = () => {
  const frame = useCurrentFrame();
  const dim = interpolate(frame, [192, 222], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const textOpacity = interpolate(frame, [205, 232], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const textY = interpolate(frame, [205, 240], [16, 0], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <>
      <Card
        left={160}
        top={150}
        width={560}
        height={470}
        rotate={-2.2}
        label="官网通知"
        index={0}
        dim={dim}
      >
        <Img
          src={staticFile('media/img/unnc_notice.png')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: '50% 11%',
          }}
        />
      </Card>

      <Card
        left={1180}
        top={128}
        width={600}
        height={560}
        rotate={2.0}
        label="群聊截图"
        index={1}
        dim={dim}
      >
        <Img
          src={staticFile('media/img/unnc_chat.png')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: '50% 8%',
          }}
        />
      </Card>

      <Card
        left={760}
        top={620}
        width={430}
        height={360}
        rotate={-1.0}
        label="日历（示意）"
        index={2}
        dim={dim}
      >
        <Calendar />
      </Card>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: interpolate(frame, [86, 110], [0, 1], {
            easing: EASE,
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }) * (1 - dim),
          pointerEvents: 'none',
        }}
      >
        <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
          <g
            stroke={C.lineStrong}
            strokeWidth={1}
            strokeDasharray="3 6"
            fill="none"
          >
            <path d="M 735 400 L 862 478" />
            <path d="M 1185 400 L 1058 478" />
            <path d="M 975 610 L 975 552" />
          </g>
          <g fill={C.brand} opacity={0.55}>
            <circle cx={862} cy={478} r={2.6} />
            <circle cx={1058} cy={478} r={2.6} />
            <circle cx={975} cy={552} r={2.6} />
          </g>
        </svg>
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: dim,
          background:
            'linear-gradient(90deg, rgba(247,245,241,0.96) 0%, rgba(247,245,241,0.88) 38%, rgba(247,245,241,0.10) 72%, rgba(247,245,241,0) 100%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 210,
          top: 300,
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            width: 52,
            height: 3,
            background: C.brand,
            marginBottom: 30,
          }}
        />
        <div
          style={{
            fontSize: 74,
            fontWeight: 600,
            lineHeight: 1.28,
            letterSpacing: '-0.02em',
            color: C.ink,
          }}
        >
          信息都在。
        </div>
        <div
          style={{
            fontSize: 74,
            fontWeight: 600,
            lineHeight: 1.28,
            letterSpacing: '-0.02em',
            color: C.brand,
          }}
        >
          事情没成。
        </div>
        <div
          style={{
            marginTop: 30,
            fontSize: 15,
            color: C.muted,
            letterSpacing: '0.12em',
          }}
        >
          官网 · 群聊 · 日历
        </div>
      </div>
    </>
  );
};
