/** 接口对外只回打码手机号，避免安全扫描把完整号码当敏感泄露。 */
export function maskPhone(input: unknown): string {
  // 与微信绑号入库一致：先去掉 +86 / 86，再清非数字。
  let value = String(input || '').trim().replace(/^\+?86/, '').replace(/\D/g, '')
  if (value.length === 13 && value.startsWith('86')) value = value.slice(2)
  if (!/^1[3-9]\d{9}$/.test(value)) return ''
  return `${value.slice(0, 3)}****${value.slice(7)}`
}
