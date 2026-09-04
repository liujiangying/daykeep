import { request } from '@/api/request'

export type ProductEventName =
  | 'onboarding_viewed'
  | 'onboarding_skipped'
  | 'onboarding_personal_selected'
  | 'onboarding_private_space_selected'
  | 'official_space_joined'
  | 'official_space_left'
  | 'official_personal_write_started'
  | 'official_public_write_started'

export function trackProductEvent(eventName: ProductEventName, properties: Record<string, string | number | boolean> = {}) {
  return request<{ ok: boolean }>({
    url: '/api/analytics/events',
    method: 'POST',
    data: { eventName, properties },
  }).catch(() => undefined)
}
