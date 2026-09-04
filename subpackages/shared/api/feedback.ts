import { request } from '@/api/request'

export type FeedbackCategory = 'bug' | 'suggestion' | 'account' | 'other'

export interface SubmitFeedbackPayload {
  category: FeedbackCategory
  content: string
  contact?: string
  imageUrls?: string[]
  source: 'mini-program' | 'app'
  clientMeta?: {
    platform?: string
    appVersion?: string
    page?: string
    system?: string
  }
}

export function submitFeedback(payload: SubmitFeedbackPayload) {
  return request<{ id: string; environment: 'testing' | 'production' }>({
    url: '/api/feedback',
    method: 'POST',
    data: payload,
    timeout: 20000,
  })
}
