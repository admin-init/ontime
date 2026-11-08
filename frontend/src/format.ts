const WEEK = ['日', '一', '二', '三', '四', '五', '六']

export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function todayLine(now = new Date()): string {
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${WEEK[now.getDay()]}`
}

/** ISO 时间 → 中文短时间（仅展示用；*_display 字段一律直接用后端的）。 */
export function fmtClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return sameYear ? `${md} ${hm}` : `${d.getFullYear()}年${md} ${hm}`
}

const SOURCE_KIND_TEXT: Record<string, string> = {
  screenshot: '截图',
  text: '文字',
  web: '网页',
  mail: '邮件',
  link: '链接',
}

export function sourceKindText(kind: string | null | undefined): string {
  if (!kind) return '来源'
  return SOURCE_KIND_TEXT[kind] ?? kind
}

export const ORIGIN_TEXT: Record<string, string> = {
  model: '模型识别',
  user: '手动填写',
  rule: '联网核实',
  import: '导入',
}

export function originText(origin: string): string {
  return ORIGIN_TEXT[origin] ?? origin
}
