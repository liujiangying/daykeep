function env(key: string, fallback = ''): string {
  const v = process.env[key]
  return v == null || v === '' ? fallback : v
}

const isProd = env('NODE_ENV') === 'production' || env('NODE_ENV') === 'prod'

export const config = {
  get nodeEnv() { return env('NODE_ENV', 'test') },
  get port() { return Number(env('PORT', '3000')) },
  get publicBaseUrl() { return env('PUBLIC_BASE_URL', '').replace(/\/+$/, '') },
  get cos() {
    return {
      secretId: env('COS_SECRET_ID', ''),
      secretKey: env('COS_SECRET_KEY', ''),
      bucket: env('COS_BUCKET', ''),
      region: env('COS_REGION', 'ap-guangzhou'),
      prefix: env('COS_PREFIX', isProd ? 'daykeep' : 'daykeep_test'),
      publicHost: env('COS_PUBLIC_HOST', ''),
      urlExpire: parseInt(env('COS_URL_EXPIRE', '3600'), 10),
    }
  },
  get history() {
    return {
      provider: env('HISTORY_PROVIDER', 'wikimedia'),
      language: env('HISTORY_LANGUAGE', 'zh'),
      cacheDays: Math.max(1, Number(env('HISTORY_CACHE_DAYS', '30')) || 30),
    }
  },
}

export function requireCosConfigured() {
  if (!config.cos.secretId || !config.cos.secretKey) {
    throw new Error('COS_SECRET_ID / COS_SECRET_KEY not configured')
  }
}
