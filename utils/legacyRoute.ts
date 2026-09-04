type RouteQuery = Record<string, string | undefined>

function queryString(query: RouteQuery): string {
  return Object.entries(query)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

/** Keep previously shared mini-program cards working after moving pages into a subpackage. */
export function redirectLegacyRoute(target: string, query: RouteQuery = {}): void {
  const params = queryString(query)
  uni.redirectTo({ url: params ? `${target}?${params}` : target })
}
