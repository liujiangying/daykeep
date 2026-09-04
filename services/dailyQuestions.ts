import { request } from '@/api/request'

export interface DailyAnswerReveal { userId: string; nickname: string; avatarUrl: string; answer: string }
export interface DailyQuestionState {
  date: string
  questionKey: string
  question: string
  answered: boolean
  myAnswer: string
  canCustomize: boolean
  isPersonal: boolean
  isPublic?: boolean
  savedAsEntry: boolean
  yesterday: { date: string; question: string; answers: DailyAnswerReveal[] }
}

export function saveCustomDailyQuestion(question: string, spaceId?: string | null) {
  return request<{ date: string; questionKey: string; question: string }>({ url: '/api/daily-questions/today/question', method: 'PUT', data: { question, spaceId: spaceId || null } })
}

export function getDailyQuestion(spaceId?: string | null) {
  const query = spaceId ? `?spaceId=${encodeURIComponent(spaceId)}` : ''
  return request<DailyQuestionState>({ url: `/api/daily-questions/today${query}` })
}

export function saveDailyAnswer(answer: string, spaceId?: string | null) {
  return request<{ answer: string; updatedAt: string; entryId: string | null; savedAsEntry: boolean }>({
    url: '/api/daily-questions/today/answer', method: 'PUT', data: { answer, spaceId: spaceId || null },
  })
}
