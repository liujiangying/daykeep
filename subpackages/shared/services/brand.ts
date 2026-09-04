/** 品牌图标、胶囊封面由环境变量指定对象存储地址。 */
const COS_PUBLIC_HOST =
  (import.meta.env.VITE_COS_PUBLIC_HOST as string | undefined)?.replace(/\/$/, '') || ''
const COS_PREFIX =
  (import.meta.env.VITE_COS_PREFIX as string | undefined)?.replace(/^\/|\/$/g, '') || ''
const assetUrl = (path: string) => COS_PUBLIC_HOST
  ? `${COS_PUBLIC_HOST}/${COS_PREFIX ? `${COS_PREFIX}/` : ''}${path}`
  : ''

export const BRAND_ICON_LAKE =
  assetUrl('defaults/brand/only-us-icon-lake-green.png')
export const BRAND_ICON_SKY =
  assetUrl('defaults/brand/only-us-icon-sky-blue.png')
export const BRAND_ICON_URL = BRAND_ICON_SKY

/** 时间胶囊锁定/开封页封面（约 117KB），不进主包 */
export const CAPSULE_COVER_URL =
  assetUrl('defaults/capsule/time-cover-v3.webp')
