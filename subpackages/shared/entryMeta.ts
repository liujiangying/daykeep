export interface TagSuggestionSource {
  title?: string
  body?: string
  hasImages?: boolean
  selected?: string[]
}

const TAG_RULES: Array<[RegExp, string[]]> = [
  [/(旅行|旅游|景点|机场|酒店|出发|西湖|海边)/, ['旅行', '在路上']],
  [/(咖啡|餐厅|美食|吃饭|早餐|午餐|晚餐|甜品)/, ['美食', '探店']],
  [/(妈妈|爸爸|孩子|家人|家庭)/, ['家人', '家庭时光']],
  [/(朋友|闺蜜|聚会|同学)/, ['朋友', '相聚']],
  [/(猫|狗|宠物|毛孩子)/, ['萌宠', '陪伴']],
  [/(工作|会议|项目|加班)/, ['工作', '成长']],
  [/(生日|纪念|周年)/, ['纪念日', '值得记住']],
  [/(雨|晴|雪|天气|晚霞|日落)/, ['天气', '今日风景']],
  [/(开心|快乐|幸福|难过|心情|感受)/, ['心情', '此刻心情']],
]

/** 返回单个合法标签；分隔符或空白表示用户一次输入了多个标签。 */
export function normalizeSingleTag(value: string) {
  const tag = value.trim().replace(/^#+\s*/, '')
  if (!tag || /[、,，#\s]/.test(tag)) return ''
  return tag.slice(0, 16)
}

/**
 * 本地推荐不上传正文或照片：文字按生活场景匹配，存在照片时补充图片类标签。
 * 图片语义不在客户端根据文件名猜测，避免产生误导。
 */
export function suggestEntryTags(source: TagSuggestionSource) {
  const text = `${source.title || ''} ${source.body || ''}`.toLowerCase()
  const candidates: string[] = []
  TAG_RULES.forEach(([pattern, tags]) => {
    if (pattern.test(text)) candidates.push(...tags)
  })
  if (source.hasImages) candidates.push('照片日记', '生活碎片')
  candidates.push('今日份', '随手记')
  const selected = new Set(source.selected || [])
  return [...new Set(candidates)].filter((tag) => !selected.has(tag)).slice(0, 8)
}
