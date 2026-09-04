import { Router } from 'express'
import { config } from '../config.js'
import { queryOne } from '../db.js'

interface WikimediaPage {
  title?: string
  normalizedtitle?: string
  description?: string
  extract?: string
  content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } }
}

interface WikimediaEvent {
  year?: number
  text?: string
  pages?: WikimediaPage[]
}

export interface HistoryStory {
  id: string
  year: number | null
  title: string
  description: string
  sourceUrl: string
}

interface HistoryPayload {
  month: number
  day: number
  source: string
  stories: HistoryStory[]
  updatedAt: string
}

interface CacheRow {
  payload: HistoryPayload & { stories: Array<HistoryStory & { imageUrl?: string }> }
  fresh: boolean
}

export const historyRouter = Router()

const TRADITIONAL_PHRASES: Array<[RegExp, string]> = [
  [/颱風/g, '台风'],
  [/天鴿/g, '天鸽'],
  [/澳門/g, '澳门'],
  [/氣象/g, '气象'],
  [/發出/g, '发出'],
  [/懸掛/g, '悬挂'],
  [/警號/g, '警号'],
  [/訊號/g, '信号'],
  [/襲擊/g, '袭击'],
  [/吹襲/g, '吹袭'],
  [/登陸/g, '登陆'],
  [/颶風/g, '飓风'],
  [/颱/g, '台'],
  [/颴/g, '旋'],
]

const TRADITIONAL_CHARS: Record<string, string> = {
  鴿: '鸽', 鳥: '鸟', 馬: '马', 龍: '龙', 龜: '龟', 魚: '鱼', 鯨: '鲸', 鱷: '鳄', 鷹: '鹰', 鶴: '鹤',
  風: '风', 颱: '台', 門: '门', 間: '间', 開: '开', 關: '关', 閉: '闭', 聞: '闻', 問: '问', 閣: '阁',
  氣: '气', 發: '发', 髮: '发', 懸: '悬', 掛: '挂', 號: '号', 襲: '袭', 警: '警', 報: '报', 預: '预',
  臺: '台', 灣: '湾', 國: '国', 內: '内', 會: '会', 來: '来', 說: '说', 語: '语', 話: '话', 記: '记',
  時: '时', 後: '后', 前: '前', 個: '个', 條: '条', 點: '点', 萬: '万', 億: '亿', 與: '与', 於: '于',
  別: '别',
  對: '对', 為: '为', 無: '无', 當: '当', 應: '应', 實: '实', 歷: '历', 史: '史', 經: '经', 濟: '济',
  軍: '军', 戰: '战', 備: '备', 聯: '联', 隊: '队', 車: '车', 輛: '辆', 轉: '转', 運: '运', 達: '达',
  電: '电', 視: '视', 廣: '广', 播: '播', 網: '网', 資: '资', 訊: '讯', 題: '题', 圖: '图', 書: '书',
  學: '学', 醫: '医', 藥: '药', 體: '体', 樂: '乐', 藝: '艺', 劇: '剧', 選: '选', 舉: '举', 政: '政',
  區: '区', 縣: '县', 鄉: '乡', 鎮: '镇', 廠: '厂', 廈: '厦', 場: '场', 館: '馆', 樓: '楼',
  讓: '让', 認: '认', 識: '识', 證: '证', 評: '评', 論: '论', 計: '计', 設: '设', 試: '试', 賽: '赛',
  離: '离', 進: '进', 過: '过', 還: '还', 遠: '远', 近: '近', 長: '长', 頭: '头', 東: '东', 帶: '带',
  義: '义', 華: '华', 島: '岛', 嶼: '屿', 標: '标', 準: '准', 係: '系', 變: '变', 壓: '压',
  強: '强', 熱: '热', 亞: '亚', 歐: '欧', 非: '非', 美: '美', 鹽: '盐', 糧: '粮', 穀: '谷',
  極: '极', 壞: '坏', 導: '导', 致: '致', 測: '测', 紀: '纪', 錄: '录', 續: '续', 疊: '叠', 處: '处',
  嚴: '严', 斷: '断', 兒: '儿', 產: '产', 業: '业', 務: '务', 勢: '势', 據: '据', 擊: '击',
  機: '机', 構: '构', 檔: '档', 規: '规', 劃: '划', 營: '营', 復: '复', 舊: '旧', 新: '新', 數: '数',
  擴: '扩', 範: '范', 圍: '围', 顯: '显', 示: '示', 僅: '仅', 屬: '属', 責: '责', 任: '任',
  編: '编', 寫: '写', 讀: '读', 權: '权', 限: '限', 質: '质', 量: '量', 專: '专', 積: '积',
  術: '术', 科: '科', 研: '研', 究: '究', 戶: '户', 樣: '样', 態: '态', 狀: '状',
  統: '统', 組: '组', 織: '织', 總: '总', 級: '级', 類: '类', 傳: '传', 優: '优', 勝: '胜', 敗: '败',
  協: '协', 議: '议', 請: '请', 求: '求', 料: '料', 項: '项', 頁: '页', 雙: '双', 單: '单',
  該: '该', 調: '调', 查: '查', 購: '购', 買: '买', 貨: '货', 費: '费', 價: '价', 錢: '钱', 銀: '银',
  錯: '错', 誤: '误', 啟: '启', 動: '动', 停: '停', 儲: '储', 存: '存', 願: '愿', 愛: '爱', 災: '灾', 馮: '冯',
}

/**
 * Wikimedia 中文接口偶尔会混入港澳台繁体条目。
 * 前端两处都会消费这个接口，所以在后端统一转成简体；缓存里已有旧 payload
 * 也会在 sanitizePayload 阶段被转换，避免等缓存过期才能生效。
 */
export function toSimplifiedChinese(input: string): string {
  let output = String(input || '')
  for (const [pattern, replacement] of TRADITIONAL_PHRASES) output = output.replace(pattern, replacement)
  return output.replace(/[\u3400-\u9fff]/g, (char) => TRADITIONAL_CHARS[char] || char)
}

function validDatePart(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function isRealMonthDay(month: number, day: number): boolean {
  const value = new Date(2024, month - 1, day)
  return value.getMonth() === month - 1 && value.getDate() === day
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function storyTitle(year: number | undefined, text: string, page?: WikimediaPage): string {
  const clause = text.split(/[。；]/)[0]?.split('，').slice(0, 2).join('，') || ''
  const subject = clause.length <= 42 ? clause : (page?.normalizedtitle || page?.title || clause.slice(0, 39) + '…')
  return `${year ? `${year}年，` : ''}${subject}`.replace(/[，,]+$/, '')
}

/** 集群无法稳定访问 Wikimedia 图床，对外只返回纯文本故事。 */
function sanitizePayload(payload: CacheRow['payload']): HistoryPayload {
  return {
    month: payload.month,
    day: payload.day,
    source: payload.source,
    updatedAt: payload.updatedAt,
    stories: (payload.stories || []).map((story) => ({
      id: story.id,
      year: story.year,
      title: toSimplifiedChinese(story.title),
      description: toSimplifiedChinese(story.description),
      sourceUrl: story.sourceUrl || '',
    })),
  }
}

function normalizeEvents(events: WikimediaEvent[], month: number, day: number): HistoryPayload {
  const seen = new Set<string>()
  const stories: HistoryStory[] = []

  for (const event of events) {
    const description = toSimplifiedChinese(plainText(event.text || ''))
    if (!description) continue
    const mainPage = event.pages?.find((page) => page.normalizedtitle || page.title)
    const year = Number.isFinite(event.year) ? Number(event.year) : null
    const title = toSimplifiedChinese(storyTitle(event.year, description, mainPage))
    const dedupeKey = `${year || ''}:${description}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    stories.push({
      id: `${month}-${day}-${year || 'unknown'}-${stories.length}`,
      year,
      title,
      description,
      sourceUrl: mainPage?.content_urls?.mobile?.page || mainPage?.content_urls?.desktop?.page || '',
    })
    if (stories.length >= 30) break
  }

  return {
    month,
    day,
    source: 'Wikimedia / 中文维基百科',
    stories,
    updatedAt: new Date().toISOString(),
  }
}

async function fetchWikimedia(month: number, day: number): Promise<HistoryPayload> {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)
  try {
    const url = `https://${config.history.language}.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Daykeep/0.1',
      },
    })
    if (!response.ok) throw new Error(`history provider responded ${response.status}`)
    const body = await response.json() as { events?: WikimediaEvent[] }
    return normalizeEvents(Array.isArray(body.events) ? body.events : [], month, day)
  } finally {
    clearTimeout(timer)
  }
}

async function readCache(key: string): Promise<CacheRow | null> {
  return queryOne<CacheRow>(
    `SELECT payload, expires_at > now() AS fresh
       FROM t_history_day_cache
      WHERE month_day = $1`,
    [key],
  )
}

async function saveCache(key: string, payload: HistoryPayload): Promise<void> {
  await queryOne(
    `INSERT INTO t_history_day_cache (month_day, source, payload, fetched_at, expires_at)
     VALUES ($1, $2, $3::jsonb, now(), now() + ($4 * interval '1 day'))
     ON CONFLICT (month_day) DO UPDATE
       SET source = EXCLUDED.source,
           payload = EXCLUDED.payload,
           fetched_at = now(),
           expires_at = EXCLUDED.expires_at
     RETURNING month_day`,
    [key, payload.source, JSON.stringify(payload), config.history.cacheDays],
  )
}

historyRouter.get('/today', async (req, res) => {
  const month = validDatePart(req.query.month, 1, 12)
  const day = validDatePart(req.query.day, 1, 31)
  if (!month || !day || !isRealMonthDay(month, day)) {
    return res.status(400).json({ code: 400, msg: '日期不正确' })
  }

  const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  let cached: CacheRow | null = null
  try {
    cached = await readCache(key)
    if (cached?.fresh) return res.json({ code: 0, data: sanitizePayload(cached.payload) })

    if (config.history.provider !== 'wikimedia') {
      throw new Error(`unsupported history provider: ${config.history.provider}`)
    }
    const payload = await fetchWikimedia(month, day)
    await saveCache(key, payload)
    return res.json({ code: 0, data: payload })
  } catch (error: any) {
    // 外部数据源偶发不可用时优先返回过期缓存，页面不会整块消失。
    if (cached?.payload) return res.json({ code: 0, data: sanitizePayload(cached.payload), stale: true })
    console.warn('[history] fetch failed:', error?.message || error)
    return res.status(502).json({ code: 502, msg: '历史故事暂时加载失败，请稍后再试' })
  }
})
