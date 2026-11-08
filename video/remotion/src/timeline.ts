export type Tone = 'brand' | 'muted' | 'conflict';

export type CalloutSide = 'top' | 'bottom' | 'left' | 'right';

export type CalloutSpec = {
  from: number;
  to: number;
  box: [number, number, number, number];
  text: string;
  tone?: Tone;
  side?: CalloutSide;
};

export type ZoomSpec = {
  from: number;
  to: number;
  focus: [number, number];
  ease?: 'push' | 'linear';
};

type Base = {
  id: string;
  start: number;
  end: number;
  label: string;
  tag?: string;
  note?: string;
  hideBar?: boolean;
};

export type Shot =
  | (Base & {kind: 'title'})
  | (Base & {kind: 'open'})
  | (Base & {kind: 'thesis1'})
  | (Base & {kind: 'thesis2'})
  | (Base & {
      kind: 'ui';
      clip: string;
      clipDuration: number;
      zoom?: ZoomSpec;
      note?: string;
      callouts?: CalloutSpec[];
    })
  | (Base & {
      kind: 'still';
      image: string;
      zoom?: ZoomSpec;
      note?: string;
      callouts?: CalloutSpec[];
    })
  | (Base & {kind: 'dual'})
  | (Base & {kind: 'statement'; variant: 'conflict' | 'verify'})
  | (Base & {kind: 'export'})
  | (Base & {kind: 'concept'})
  | (Base & {kind: 'end'});

const BASE_SHOTS: Shot[] = [
  {
    id: 's1',
    kind: 'open',
    start: 0,
    end: 3,
    label: '散落的信息',
    tag: '三份来源',
  },
  {
    id: 's2',
    kind: 'open',
    start: 3,
    end: 6.5,
    label: '三个地方',
    tag: '并置',
  },
  {
    id: 's3',
    kind: 'open',
    start: 6.5,
    end: 10,
    label: '拼不完整',
    tag: '问题',
  },
  {
    id: 't1',
    kind: 'thesis1',
    start: 10,
    end: 13.6,
    label: '主张',
    tag: '到点',
  },
  {
    id: 't2',
    kind: 'thesis2',
    start: 13.6,
    end: 18,
    label: '连回原文',
    tag: '主张',
  },
  {
    id: 'u1',
    kind: 'ui',
    clip: '02-progress',
    clipDuration: 4.25,
    start: 18,
    end: 22.5,
    label: '通知收录',
    tag: '实机录屏',
    note: '×8 实际约 30 秒',
    zoom: {from: 1, to: 1.04, focus: [0.5, 0.36]},
    callouts: [
      {
        from: 0.3,
        to: 2.2,
        box: [0.17, 0.255, 0.65, 0.06],
        text: '真实收录过程',
        tone: 'brand',
        side: 'bottom',
      },
    ],
  },
  {
    id: 'u2',
    kind: 'still',
    image: '02-inbox.png',
    start: 22.5,
    end: 24.9,
    label: '收件箱',
    tag: '实机录屏',
    note: '先到收件箱，不自动生效',
    zoom: {from: 1, to: 1.08, focus: [0.45, 0.3]},
    callouts: [
      {
        from: 0.2,
        to: 2.3,
        box: [0.17, 0.19, 0.65, 0.23],
        text: '候选卡 · 待确认',
        tone: 'brand',
        side: 'left',
      },
    ],
  },
  {
    id: 'u3',
    kind: 'ui',
    clip: '03-confirm',
    clipDuration: 4.545,
    start: 24.9,
    end: 29.4,
    label: '确认事件',
    tag: '实机录屏',
    note: '确认后才生效',
    zoom: {from: 1, to: 1.2, focus: [0.48, 0.3]},
    callouts: [
      {
        from: 0.2,
        to: 1.7,
        box: [0.725, 0.115, 0.065, 0.04],
        text: '确认后才生效',
        tone: 'brand',
        side: 'bottom',
      },
      {
        from: 1.9,
        to: 4.4,
        box: [0.14, 0.32, 0.43, 0.11],
        text: '活动时间 / 结束时间分开',
        tone: 'brand',
        side: 'left',
      },
    ],
  },
  {
    id: 'u4',
    kind: 'ui',
    clip: '04-fields',
    clipDuration: 4.5,
    start: 29.4,
    end: 33.9,
    label: '字段与出处',
    tag: '实机录屏',
    note: '原文与来源同屏',
    zoom: {from: 1, to: 1.35, focus: [0.35, 0.4]},
    callouts: [
      {
        from: 0.3,
        to: 2.2,
        box: [0.14, 0.31, 0.43, 0.18],
        text: '点开字段，看到原文',
        tone: 'brand',
        side: 'left',
      },
      {
        from: 2.1,
        to: 4.4,
        box: [0.44, 0.37, 0.055, 0.05],
        text: '来源缩略图',
        tone: 'muted',
        side: 'right',
      },
    ],
  },
  {
    id: 'u5',
    kind: 'still',
    image: '04b-task.png',
    start: 33.9,
    end: 40,
    label: '待确认',
    tag: '实机录屏',
    note: '截止待确认 · 材料来自群聊',
    zoom: {from: 1.5, to: 1.7, focus: [0.35, 0.7]},
    callouts: [
      {
        from: 0.4,
        to: 3.0,
        box: [0.13, 0.41, 0.44, 0.12],
        text: '报名 · 截止待确认',
        tone: 'muted',
        side: 'left',
      },
      {
        from: 1.2,
        to: 4.0,
        box: [0.15, 0.55, 0.4, 0.06],
        text: '缺少日期依据，待确认',
        tone: 'muted',
        side: 'left',
      },
      {
        from: 3.9,
        to: 6.0,
        box: [0.2, 0.775, 0.28, 0.035],
        text: '材料来源：群聊',
        tone: 'muted',
        side: 'left',
      },
    ],
  },
  {
    id: 'd1',
    kind: 'ui',
    clip: '05-progress',
    clipDuration: 3.112,
    start: 40,
    end: 43.2,
    label: '第二份信息',
    tag: '实机录屏',
    note: '×16 实际约 49 秒',
    zoom: {from: 1, to: 1.03, focus: [0.5, 0.36]},
  },
  {
    id: 'd2',
    kind: 'still',
    image: '05-merge.png',
    start: 43.2,
    end: 47,
    label: '合并建议',
    tag: '实机录屏',
    note: '系统只给建议',
    zoom: {from: 1.35, to: 1.4, focus: [0.52, 0.85]},
    callouts: [
      {
        from: 0.2,
        to: 2.0,
        box: [0.18, 0.505, 0.3, 0.04],
        text: '系统只给建议',
        tone: 'brand',
        side: 'right',
      },
      {
        from: 1.8,
        to: 3.7,
        box: [0.23, 0.82, 0.5, 0.1],
        text: '地点：思源 → 劳伦斯',
        tone: 'conflict',
        side: 'right',
      },
    ],
  },
  {
    id: 'd3',
    kind: 'ui',
    clip: '06-diff',
    clipDuration: 3.8,
    start: 47,
    end: 50.8,
    label: '旧值 / 新值',
    tag: '实机录屏',
    note: '0.5× 慢放',
    zoom: {from: 1, to: 1.28, focus: [0.45, 0.78]},
    callouts: [
      {
        from: 0.3,
        to: 2.4,
        box: [0.18, 0.86, 0.63, 0.075],
        text: '旧值 / 新值，并排',
        tone: 'conflict',
        side: 'left',
      },
    ],
  },
  {
    id: 'd4',
    kind: 'ui',
    clip: '06-conflict',
    clipDuration: 5.72,
    start: 50.8,
    end: 56.5,
    label: '地点冲突',
    tag: '实机录屏',
    note: '0.5× 慢放',
    zoom: {from: 1, to: 1.55, focus: [0.38, 0.62]},
    callouts: [
      {
        from: 3.2,
        to: 5.6,
        box: [0.2, 0.695, 0.17, 0.04],
        text: '选一个，另一种留在历史',
        tone: 'muted',
        side: 'left',
      },
    ],
  },
  {
    id: 'd5',
    kind: 'dual',
    start: 56.5,
    end: 59.5,
    label: '两种说法',
    tag: '对照',
  },
  {
    id: 'd6',
    kind: 'statement',
    variant: 'conflict',
    start: 59.5,
    end: 62,
    label: '冲突',
    tag: '主张',
  },
  {
    id: 'e1',
    kind: 'ui',
    clip: '07-search',
    clipDuration: 4.667,
    start: 62,
    end: 66.666,
    label: '联网核实',
    tag: '实机录屏',
    note: '×1.4 实际检索约 5 秒',
    zoom: {from: 1, to: 1.18, focus: [0.35, 0.55]},
    callouts: [
      {
        from: 1.0,
        to: 3.0,
        box: [0.13, 0.47, 0.45, 0.05],
        text: '真实检索',
        tone: 'brand',
        side: 'left',
      },
      {
        from: 4.3,
        to: 4.66,
        box: [0.13, 0.56, 0.45, 0.09],
        text: '未找到',
        tone: 'muted',
        side: 'left',
      },
    ],
  },
  {
    id: 'e2',
    kind: 'still',
    image: '07-notfound.png',
    start: 66.666,
    end: 69.8,
    label: '未找到',
    tag: '真实结果',
    note: 'not_found · 未给出结论',
    zoom: {from: 1, to: 1.12, focus: [0.35, 0.62]},
    callouts: [
      {
        from: 0.2,
        to: 2.9,
        box: [0.13, 0.56, 0.45, 0.1],
        text: '没有给出任何结论',
        tone: 'muted',
        side: 'left',
      },
      {
        from: 1.2,
        to: 3.1,
        box: [0.13, 0.69, 0.45, 0.08],
        text: '查看了这些页面',
        tone: 'muted',
        side: 'left',
      },
    ],
  },
  {
    id: 'e3',
    kind: 'ui',
    clip: '08-link',
    clipDuration: 3.955,
    start: 69.8,
    end: 73.8,
    label: '贴链接核对',
    tag: '实机录屏',
    note: '×2.2 实际约 7 秒',
    zoom: {from: 1, to: 1.15, focus: [0.35, 0.65]},
    callouts: [
      {
        from: 0.2,
        to: 1.8,
        box: [0.12, 0.895, 0.37, 0.05],
        text: '贴官方链接',
        tone: 'brand',
        side: 'left',
      },
      {
        from: 1.6,
        to: 3.8,
        box: [0.13, 0.28, 0.45, 0.06],
        text: '抓取链接，核对原文',
        tone: 'brand',
        side: 'left',
      },
    ],
  },
  {
    id: 'e4',
    kind: 'ui',
    clip: '08-findings',
    clipDuration: 3.5,
    start: 73.8,
    end: 78.1,
    label: '6 条依据',
    tag: '真实结果',
    note: '本屏 2 条 / 共 6 条',
    zoom: {from: 1, to: 1.25, focus: [0.35, 0.62]},
    callouts: [
      {
        from: 0.5,
        to: 2.4,
        box: [0.13, 0.65, 0.45, 0.16],
        text: '官方来源 + 原文',
        tone: 'brand',
        side: 'left',
      },
      {
        from: 2.2,
        to: 4.2,
        box: [0.13, 0.575, 0.45, 0.07],
        text: '只标出，不覆盖',
        tone: 'conflict',
        side: 'left',
      },
    ],
  },
  {
    id: 'e5',
    kind: 'statement',
    variant: 'verify',
    start: 78.1,
    end: 82,
    label: '核实原则',
    tag: '主张',
  },
  {
    id: 'f1',
    kind: 'ui',
    clip: '09-action',
    clipDuration: 4.13,
    start: 82,
    end: 86.2,
    label: '行动清单',
    tag: '实机录屏',
    note: '勾选后 · 未完成清零',
    zoom: {from: 1.45, to: 1.75, focus: [0.3, 0.12]},
    callouts: [
      {
        from: 1.5,
        to: 3.9,
        box: [0.145, 0.22, 0.38, 0.115],
        text: '勾选后 · 未完成清零',
        tone: 'brand',
        side: 'left',
      },
    ],
  },
  {
    id: 'f2',
    kind: 'ui',
    clip: '04b-materials',
    clipDuration: 4.429,
    start: 86.2,
    end: 90.6,
    label: '材料与来源',
    tag: '实机录屏',
    note: '群聊来源 · 非官方通知',
    zoom: {from: 1, to: 1.6, focus: [0.35, 0.55]},
    callouts: [
      {
        from: 2.2,
        to: 4.3,
        box: [0.21, 0.775, 0.16, 0.035],
        text: '群聊来源 · 非官方通知',
        tone: 'muted',
        side: 'left',
      },
    ],
  },
  {
    id: 'f3',
    kind: 'ui',
    clip: '09-history',
    clipDuration: 2.593,
    start: 90.6,
    end: 93.2,
    label: '历史',
    tag: '实机录屏',
    note: '只追加，不覆盖',
    zoom: {from: 1, to: 1.45, focus: [0.35, 0.72]},
    callouts: [
      {
        from: 0.3,
        to: 1.6,
        box: [0.5, 0.487, 0.08, 0.028],
        text: '历史只追加',
        tone: 'brand',
        side: 'right',
      },
      {
        from: 1.0,
        to: 2.5,
        box: [0.13, 0.53, 0.44, 0.075],
        text: '每次写入都留痕',
        tone: 'muted',
        side: 'left',
      },
    ],
  },
  {
    id: 'f4',
    kind: 'export',
    start: 93.2,
    end: 95,
    label: '导出',
    tag: '真实文件',
    note: '页面暂无提示，文件已生成',
  },
  {
    id: 'g1',
    kind: 'ui',
    clip: '01-settings',
    clipDuration: 3.515,
    start: 95,
    end: 98.45,
    label: '能力边界',
    tag: '入口',
    note: '已有入口 · 尚未接入',
    zoom: {from: 1, to: 1.45, focus: [0.5, 0.3]},
  },
  {
    id: 'g2',
    kind: 'concept',
    start: 98.45,
    end: 101.5,
    label: '规划能力',
    tag: '规划',
  },
  {
    id: 'g3',
    kind: 'end',
    start: 101.5,
    end: 105,
    label: '',
    hideBar: true,
  },
];

export const TITLE_SECONDS = 3;
const TITLE_FRAMES = Math.round(TITLE_SECONDS * 30);

export const SHOTS: Shot[] = [
  {
    id: 'title',
    kind: 'title',
    start: 0,
    end: TITLE_SECONDS,
    label: '',
    hideBar: true,
  },
  ...BASE_SHOTS.map((shot) => ({
    ...shot,
    start: Number((shot.start + TITLE_SECONDS).toFixed(3)),
    end: Number((shot.end + TITLE_SECONDS).toFixed(3)),
  })),
];

export const TOTAL_FRAMES = Math.round((105 + TITLE_SECONDS) * 30);
export {TITLE_FRAMES};

