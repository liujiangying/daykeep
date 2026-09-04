import { request } from '@/api/request'

export interface HistoryStory {
  id: string
  year: number | null
  title: string
  description: string
  sourceUrl: string
}

export interface HistoryDay {
  month: number
  day: number
  source: string
  stories: HistoryStory[]
  updatedAt: string
}

export function getHistoryDay(month: number, day: number) {
  return request<HistoryDay>({
    url: `/api/history/today?month=${month}&day=${day}`,
    skipAuth: true,
    timeout: 15000,
  })
}
