export const PRESET_MOODS = ['sunny', 'cloudy', 'rainy', 'storm', 'rainbow'] as const

export type PresetMood = typeof PRESET_MOODS[number]
export type CustomMood = `custom:${string}`
export type MoodValue = PresetMood | CustomMood | ''

export const MOOD_OPTIONS: ReadonlyArray<{ value: PresetMood; label: string; icon: string; asset: string }> = [
  { value: 'sunny', label: '晴朗', icon: '☀️', asset: '/static/mood/sunny.png' },
  { value: 'cloudy', label: '平静', icon: '☁️', asset: '/static/mood/cloudy.png' },
  { value: 'rainy', label: '低落', icon: '🌧️', asset: '/static/mood/rainy.png' },
  { value: 'storm', label: '烦躁', icon: '⛈️', asset: '/static/mood/storm.png' },
  { value: 'rainbow', label: '惊喜', icon: '🌈', asset: '/static/mood/rainbow.png' },
]

const ZWJ = 0x200d
const VS15 = 0xfe0e
const VS16 = 0xfe0f
const KEYCAP = 0x20e3

function isSkinTone(cp: number) {
  return cp >= 0x1f3fb && cp <= 0x1f3ff
}

function isRegionalIndicator(cp: number) {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff
}

function isPictographic(cp: number) {
  return (
    (cp >= 0x1f300 && cp <= 0x1faff)
    || (cp >= 0x1f000 && cp <= 0x1f02f)
    || (cp >= 0x2600 && cp <= 0x27bf)
    || (cp >= 0x2300 && cp <= 0x23ff)
    || (cp >= 0x2b00 && cp <= 0x2bff)
    || (cp >= 0x2190 && cp <= 0x21ff)
    || cp === 0x00a9
    || cp === 0x00ae
    || cp === 0x2122
  )
}

/**
 * 安卓微信小程序不支持 \\p{Extended_Pictographic} 这类属性转义，
 * 字面量 /\\p{...}/u 会在模块加载时直接 SyntaxError，时光/我的整页白屏。
 * 能支持的环境仍走完整 Emoji 序列；否则用码点范围兜底。
 */
function createSingleEmojiTester(): (value: string) => boolean {
  try {
    const pattern = new RegExp(
      '^(?:\\p{Regional_Indicator}{2}|[#*0-9]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\p{Emoji_Modifier})?)*)$',
      'u',
    )
    return (value) => pattern.test(value)
  } catch {
    return isLikelySingleEmoji
  }
}

function isLikelySingleEmoji(value: string): boolean {
  if (!value || /[\sA-Za-z\u4e00-\u9fff]/.test(value)) return false
  const cps = Array.from(value, (char) => char.codePointAt(0) || 0)
  if (!cps.length || cps.length > 16) return false
  if (cps.length === 2 && cps.every(isRegionalIndicator)) return true

  const first = cps[0]
  if (first === 0x23 || first === 0x2a || (first >= 0x30 && first <= 0x39)) {
    let index = 1
    if (cps[index] === VS16) index += 1
    return cps[index] === KEYCAP && index === cps.length - 1
  }

  let index = 0
  const eatUnit = () => {
    if (index >= cps.length || !isPictographic(cps[index])) return false
    index += 1
    if (cps[index] === VS15 || cps[index] === VS16) index += 1
    if (isSkinTone(cps[index])) index += 1
    return true
  }
  if (!eatUnit()) return false
  while (index < cps.length) {
    if (cps[index] !== ZWJ) return false
    index += 1
    if (!eatUnit()) return false
  }
  return true
}

const isSingleEmoji = createSingleEmojiTester()

export function normalizeCustomEmoji(input: unknown): string {
  const value = String(input || '').trim()
  return isSingleEmoji(value) ? value : ''
}

export function encodeCustomMood(input: unknown): CustomMood | '' {
  const emoji = normalizeCustomEmoji(input)
  return emoji ? `custom:${emoji}` : ''
}

export function isMoodValue(input: unknown): input is Exclude<MoodValue, ''> {
  const value = String(input || '')
  if ((PRESET_MOODS as readonly string[]).includes(value)) return true
  return value.startsWith('custom:') && normalizeCustomEmoji(value.slice(7)) === value.slice(7)
}

export function moodIconForValue(mood: unknown): string {
  const value = String(mood || '')
  if (value.startsWith('custom:')) return normalizeCustomEmoji(value.slice(7))
  return MOOD_OPTIONS.find((item) => item.value === value)?.icon || ''
}

/** 五种预设心情用 Lucide 天气图标；自定义仍走用户选的 Emoji。 */
export function moodAssetForValue(mood: unknown): string {
  const value = String(mood || '')
  return MOOD_OPTIONS.find((item) => item.value === value)?.asset || ''
}

export function moodLabelForValue(mood: unknown): string {
  const value = String(mood || '')
  if (value.startsWith('custom:') && normalizeCustomEmoji(value.slice(7))) return '自定义'
  return MOOD_OPTIONS.find((item) => item.value === value)?.label || ''
}
