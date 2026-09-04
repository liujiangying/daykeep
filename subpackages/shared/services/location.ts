/**
 * 微信地图定位与选点。
 *
 * 这里是全项目唯一的定位实现出口。之前这套逻辑内联在 pages/notes/edit.vue 里，
 * 导致「随手记能用地图选点、约定只能手输」——同一个编辑页两套体验。
 *
 * 关于坐标：chooseLocation 返回的 latitude/longitude 必须一起带出去。
 * 早期实现只取了 name 就丢掉坐标，结果「导航到集合地点」做不了
 * （uni.openLocation 需要经纬度），圈子地图也只能用 CSS 摆假图钉。
 *
 * 关于长度：这里只做「本次用户输入」的规范化截断，
 * 不承担已有数据的重截职责——服务端 MAX_LOCATION_LEN 是唯一截断方。
 */

/** 与后端 MAX_LOCATION_LEN 保持一致，改这里必须同步改后端。 */
export const MAX_LOCATION_LEN = 64

export interface PickedLocation {
  /** 地点名，已按 MAX_LOCATION_LEN 规范化。 */
  name: string
  /** 纬度，选点失败或历史数据缺失时为 undefined。 */
  latitude?: number
  /** 经度，选点失败或历史数据缺失时为 undefined。 */
  longitude?: number
}

/** 规范化用户输入的地点名：去空白 + 截断。 */
export function normalizeLocationName(input: string): string {
  return String(input || '')
    .trim()
    .slice(0, MAX_LOCATION_LEN)
}

/** 坐标是否可用于地图展示与导航。0,0 视为无效值。 */
export function hasValidCoords(lat?: number, lng?: number): boolean {
  const latNum = Number(lat)
  const lngNum = Number(lng)
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return false
  if (latNum === 0 && lngNum === 0) return false
  return latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180
}

function getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    uni.getLocation({
      type: 'gcj02',
      success: ({ latitude, longitude }) => resolve({ latitude, longitude }),
      fail: reject,
    })
  })
}

function openMapPicker(
  latitude: number,
  longitude: number,
): Promise<{ name?: string; address?: string; latitude?: number; longitude?: number }> {
  return new Promise((resolve, reject) => {
    uni.chooseLocation({ latitude, longitude, success: resolve, fail: reject })
  })
}

/**
 * 这里不用 uni.authorize 主动申请权限。
 * getLocation 本身会触发授权弹窗，拒绝后再引导去设置页，
 * 比先 authorize 再 getLocation 少一次弹窗。
 */
export function isLocationPermissionDenied(error: unknown): boolean {
  const raw = String(
    (error as { errMsg?: string; message?: string })?.errMsg ||
      (error as { message?: string })?.message ||
      error ||
      '',
  )
  return /auth deny|authorize no response|permission denied|user deny/i.test(raw)
}

/** 用户主动取消选点不是错误，调用方不该弹提示。 */
export function isUserCancelled(error: unknown): boolean {
  const raw = String(
    (error as { errMsg?: string; message?: string })?.errMsg ||
      (error as { message?: string })?.message ||
      error ||
      '',
  )
  return /cancel/i.test(raw)
}

async function promptLocationSetting(): Promise<boolean> {
  const result = await uni.showModal({
    title: '需要位置权限',
    content: '允许获取位置后，才能打开微信地图选择地点。',
    confirmText: '去设置',
    cancelText: '暂不开启',
  })
  if (!result.confirm) return false
  const settings = await uni.openSetting()
  return !!settings.authSetting?.['scope.userLocation']
}

async function locateAndPick(): Promise<PickedLocation | null> {
  const current = await getCurrentLocation()
  const picked = await openMapPicker(current.latitude, current.longitude)
  const name = normalizeLocationName(String(picked.name || picked.address || ''))
  if (!name) return null
  // chooseLocation 未回坐标时退回定位点，保证「导航到这里」始终可用。
  const latitude = Number.isFinite(Number(picked.latitude)) ? Number(picked.latitude) : current.latitude
  const longitude = Number.isFinite(Number(picked.longitude)) ? Number(picked.longitude) : current.longitude
  return { name, latitude, longitude }
}

/**
 * 定位并打开微信地图选点。
 *
 * 返回 null 表示「没有选出结果但不是异常」：用户取消、暂不授权，
 * 或选中项没有名称。调用方遇到 null 应保持当前值不变、不提示错误。
 * 只有真正的失败（定位服务不可用等）才会抛出。
 */
export async function pickLocationFromMap(): Promise<PickedLocation | null> {
  try {
    return await locateAndPick()
  } catch (error) {
    if (isLocationPermissionDenied(error)) {
      try {
        const allowed = await promptLocationSetting()
        if (allowed) return await locateAndPick()
      } catch {
        // 用户关掉设置页或再次拒绝，保持原地点即可，不算失败。
      }
      return null
    }
    if (isUserCancelled(error)) return null
    throw error
  }
}

/** 打开地图查看/导航到指定坐标。坐标无效时返回 false，由调用方提示。 */
export function openLocationOnMap(options: {
  latitude?: number
  longitude?: number
  name?: string
  address?: string
}): boolean {
  const { latitude, longitude, name, address } = options
  if (!hasValidCoords(latitude, longitude)) return false
  uni.openLocation({
    latitude: Number(latitude),
    longitude: Number(longitude),
    name: name || '',
    address: address || name || '',
    scale: 18,
  })
  return true
}
