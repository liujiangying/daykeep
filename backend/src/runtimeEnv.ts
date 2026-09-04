/** 本地开发读取 backend/.env；容器环境变量始终优先。 */
export async function loadRuntimeEnv() {
  try {
    const { readFileSync, existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const path = resolve(process.cwd(), '.env')
    if (!existsSync(path)) return
    const text = readFileSync(path, 'utf8')
    for (const line of text.split('\n')) {
      const value = line.trim()
      if (!value || value.startsWith('#')) continue
      const separator = value.indexOf('=')
      if (separator < 0) continue
      const key = value.slice(0, separator).trim()
      let content = value.slice(separator + 1).trim()
      if (
        (content.startsWith('"') && content.endsWith('"')) ||
        (content.startsWith("'") && content.endsWith("'"))
      ) {
        content = content.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = content
    }
  } catch {
    // 本地 .env 只是开发便利；生产环境变量由部署平台注入。
  }
  process.env.TZ ||= 'Asia/Shanghai'
}
