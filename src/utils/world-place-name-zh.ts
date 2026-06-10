/** 英文/拉丁地名直译为中文（无拉丁字符时原样返回） */

const TOKEN_ZH: Record<string, string> = {
  mill: '磨',
  oak: '橡',
  fair: '菲',
  stone: '石',
  grey: '灰',
  gray: '灰',
  green: '绿',
  red: '赤',
  silver: '银',
  iron: '铁',
  ash: '灰',
  storm: '暴',
  thai: '泰',
  bridge: '桥',
  ford: '津',
  hill: '丘',
  lake: '湖',
  bay: '湾',
  field: '野',
  high: '高',
  low: '低',
  inner: '内',
  outer: '外',
  north: '北',
  south: '南',
  east: '东',
  west: '西',
  upper: '上',
  lower: '下',
  deep: '深',
  far: '远',
  near: '近',
  old: '古',
  burg: '堡',
  borough: '堡',
  ton: '顿',
  shire: '郡',
  haven: '港',
  court: '府',
  hold: '堡',
  crown: '冠',
  vale: '谷',
  marches: '边地',
  citadel: '寨',
  keep: '堡',
  province: '省',
  city: '城',
  county: '县',
  kingdom: '王国',
  empire: '帝国',
  republic: '共和国',
  federation: '联邦',
  union: '合众国',
  confederation: '邦联',
  duchy: '公国',
  dominion: '疆域',
  realm: '境域',
  covenant: '盟约',
  league: '同盟',
  ascendancy: '霸业',
  valen: '瓦伦',
  arden: '雅顿',
  mere: '麦尔',
  thorn: '刺',
  ashford: '阿什福德',
  glenmere: '格伦麦尔',
  riven: '里文',
  stormhold: '风暴堡',
  elden: '艾尔登',
  westmarch: '西境',
  valdris: '瓦德里斯',
  elyndor: '埃林多尔',
  korath: '科拉斯',
  myrrhan: '秘尔汉',
  sylvara: '西尔瓦拉',
  drakmere: '德拉克麦尔',
  aurelion: '奥雷利昂',
  nethis: '内西斯',
  kael: '凯尔',
  vorn: '沃恩',
  thal: '塔尔',
  ryn: '林',
  morn: '晨',
  dusk: '暮',
  lorn: '洛恩'
}

const SUFFIXES = [
  'borough',
  'shire',
  'burg',
  'ford',
  'haven',
  'mouth',
  'land',
  'ton',
  'ville',
  'wick',
  'dale',
  'mere',
  'hold',
  'court',
  'vale'
].sort((a, b) => b.length - a.length)

/** 地图/界面显示用地名最大字数（含后缀） */
export const PLACE_NAME_MAX_CHARS = 7

const PLACE_SUFFIX_RE = /(城塞|府城|城|镇|都|京|堡|寨|港|谷|县|郡|町)$/

/** 截断过长中文地名，优先保留后缀 */
export function truncateChinesePlaceName(name: string, max = PLACE_NAME_MAX_CHARS): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed
  const chars = [...trimmed.replace(/\s/g, '')]
  if (chars.length <= max) return trimmed.replace(/\s/g, '')

  const suffixMatch = trimmed.match(PLACE_SUFFIX_RE)
  if (suffixMatch) {
    const suffix = suffixMatch[1]
    const body = trimmed.slice(0, trimmed.length - suffix.length).replace(/\s/g, '')
    const bodyChars = [...body]
    const keepBody = Math.max(1, max - suffix.length)
    return bodyChars.slice(0, keepBody).join('') + suffix
  }
  return chars.slice(0, max).join('')
}

/** 地图标签用：过长时省略中间 */
export function placeNameForMapLabel(name: string, max = PLACE_NAME_MAX_CHARS): string {
  return truncateChinesePlaceName(name, max)
}

export function hasLatinInName(name: string): boolean {
  return /[A-Za-z]/.test(name)
}

function translateToken(token: string): string {
  const key = token.toLowerCase().replace(/[^a-z]/g, '')
  if (!key) return token
  return TOKEN_ZH[key] ?? phoneticLatinChunk(key)
}

function splitCompoundWord(word: string): string[] {
  const lower = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!lower) return [word]
  for (const suf of SUFFIXES) {
    if (lower.endsWith(suf) && lower.length > suf.length + 1) {
      return [lower.slice(0, -suf.length), suf]
    }
  }
  return [lower]
}

/** 简易音节音译（未收录词根时，限制长度避免整词逐字母堆砌） */
function phoneticLatinChunk(s: string): string {
  const map: Record<string, string> = {
    a: '阿',
    b: '布',
    c: '克',
    d: '德',
    e: '伊',
    f: '夫',
    g: '格',
    h: '赫',
    i: '伊',
    j: '杰',
    k: '克',
    l: '尔',
    m: '姆',
    n: '恩',
    o: '奥',
    p: '普',
    q: '奎',
    r: '尔',
    s: '斯',
    t: '特',
    u: '乌',
    v: '维',
    w: '沃',
    x: '克斯',
    y: '伊',
    z: '兹'
  }
  let out = ''
  const limit = s.length > 5 ? 5 : s.length
  for (let i = 0; i < limit; i++) {
    const ch = s[i]
    out += map[ch] ?? ch
  }
  return out || s.slice(0, 3)
}

/** 将含拉丁字母的地名直译为中文专名 */
export function latinPlaceNameToChinese(name: string): string {
  const trimmed = name.trim()
  if (!hasLatinInName(trimmed)) return trimmed

  const parts = trimmed.split(/[\s·\-]+/).filter(Boolean)
  const zhParts: string[] = []

  for (const part of parts) {
    const chunks = splitCompoundWord(part)
    for (const chunk of chunks) {
      zhParts.push(translateToken(chunk))
    }
  }

  const merged = zhParts.join('').replace(/\s+/g, '')
  return truncateChinesePlaceName(merged || trimmed)
}
