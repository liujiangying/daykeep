import { request } from '@/api/request'
export type InsightAction = 'none' | 'diary' | 'commitment'
export interface Insight { id: string; type: 'anniversary'|'preference'|'care'; title: string; content: string; actionType: InsightAction; actionPayload: { spaceId?: string | null; scopeKey?: string }; createdAt: string }
export function listInsights(spaceId?: string | null) {
  const query = spaceId ? `?spaceId=${encodeURIComponent(spaceId)}` : ''
  return request<Insight[]>({ url: `/api/insights${query}`, timeout: 120000 })
}
export function dismissInsight(id: string) { return request<{ok:boolean}>({ url: `/api/insights/${encodeURIComponent(id)}/dismiss`, method: 'POST' }) }
