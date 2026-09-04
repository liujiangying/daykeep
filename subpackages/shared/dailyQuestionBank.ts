export const DAILY_QUESTIONS = [
  '今天最感恩的一件事是什么？',
  '最近哪一个瞬间让你觉得很安心？',
  '如果明天可以去一个地方，你会选哪里？',
  '最近最想和在乎的人说的一句话是什么？',
  '今天有什么小事值得被记住？',
  '你最近悄悄期待的事情是什么？',
  '哪一种味道最容易让你想起一段回忆？',
  '这周最想完成的一件小事是什么？',
  '如果给今天取一个名字，会叫什么？',
  '最近一次真心笑出来是因为什么？',
  '今天有哪一刻让你觉得自己做得不错？',
  '最近重新喜欢上的一件小事是什么？',
  '此刻最想留住的画面是什么？',
  '最近听到最温柔的一句话是什么？',
  '今天的心情像什么天气？',
  '最近有什么事让你改变了一个小想法？',
  '如果把今天做成一张明信片，你会写什么？',
  '最近最想感谢谁？为什么？',
  '今天身体或心里有什么感受值得照顾？',
  '这周发生了哪件意料之外的好事？',
  '最近哪件普通小事让生活有了光？',
]

function questionAt(index: number) {
  const safe = ((index % DAILY_QUESTIONS.length) + DAILY_QUESTIONS.length) % DAILY_QUESTIONS.length
  return { key: `system-${safe}`, text: DAILY_QUESTIONS[safe] }
}

/**
 * 同一个自然日稳定返回同一道题，跨日按题库顺序轮换。
 * 题库大于 7，因此任意连续 7 天不会重复；服务重启或刷新页面也不会跳题。
 */
export function dailyQuestionForDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error('invalid daily-question date')
  const dayNumber = Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000)
  return questionAt(dayNumber)
}

/** 从题库里换成下一句，避开当前正在显示的那句。 */
export function nextDailyQuestion(currentText: string) {
  const index = DAILY_QUESTIONS.indexOf(currentText.trim())
  return questionAt(index < 0 ? 0 : index + 1)
}
