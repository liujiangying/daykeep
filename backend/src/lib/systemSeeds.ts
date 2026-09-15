export const SELF_PROMISE_DATE = '2027-01-01'

type SeedDateInput = {
  eventDate: string
  ownerType: string
  clientRequestId: string | null
  body: string
}

/** 服务端兜底：即使旧版客户端仍提交相对日期，系统内置约定也固定到元旦。 */
export function normalizeSystemSeedEventDate(input: SeedDateInput): string {
  if (
    input.ownerType === 'personal'
    && (
      input.clientRequestId === 'seed:self_promise'
      || input.body.includes('__dk_seed:self_promise__')
    )
  ) {
    return SELF_PROMISE_DATE
  }
  return input.eventDate
}
