/**
 * 响应给客户端的错误文案统一从这里出。
 *
 * 之前全仓 54 处写的是 `msg: e?.message || '失败'`，等于把内部异常原文直接
 * 交给客户端。Postgres 的报错里带表名、列名、约束名（例如
 * `duplicate key value violates unique constraint "uq_quiz_open_pair"`），
 * 上游 SDK 的报错里带桶名、region、请求 ID，这些既是内部结构泄露，
 * 也是一段用户完全看不懂的文字。
 *
 * 规则：默认永不外泄。只有显式标记 expose 的错误才允许把自己的文案带出去，
 * 这样"给用户看什么"是主动决定的，而不是取决于异常恰好来自哪一层。
 * 详细信息仍然要 console.error 落日志，排查靠日志而不是靠响应体。
 */

/** 允许把 message 展示给用户的业务错误。 */
export class ClientError extends Error {
  readonly expose = true
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ClientError'
    this.status = status
  }
}

function isExposable(error: unknown): error is { message: string } {
  if (!error || typeof error !== 'object') return false
  if ((error as { expose?: unknown }).expose !== true) return false
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && message.trim() !== ''
}

/** 取一个可以安全返回给客户端的文案；不可外泄时用调用方给的兜底文案。 */
export function clientMessage(error: unknown, fallback: string): string {
  return isExposable(error) ? error.message.trim().slice(0, 200) : fallback
}
