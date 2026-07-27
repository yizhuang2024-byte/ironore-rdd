/**
 * 地理與路程估算。
 *
 * ⚠️ 本模組產出的是**近似值**，不是實際路網導航結果。
 *    Phase 1 刻意不依賴任何付費地圖 API，也不依賴任何需要 API key 的服務 ——
 *    系統在完全沒有外部服務的情況下必須能跑。
 *
 *    因此「路程來不及」規則 (R07) 永遠只能是 WARN，不可能是 BLOCK。
 *    UI 必須把估算結果標示為「粗估」並附上 confidence。
 *
 *    Phase 3 若需要精確路程，建議自架 OSRM + 台灣 OSM extract，
 *    屆時只需替換 estimateTravelMinutes 的實作，介面不變。
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** 行政區的路況分級 —— 影響平均車速 */
export type DistrictSpeedTier = 'URBAN_CORE' | 'URBAN' | 'SUBURBAN';

export interface DistrictInfo {
  code: string;
  name: string;
  centroid: LatLng;
  /** 相鄰行政區代碼 */
  adjacent: string[];
  speedTier: DistrictSpeedTier;
}

/** 路程估算所需的政策參數，全部來自 OrgPolicy，程式不寫死。 */
export interface TravelPolicy {
  detourFactor: number;
  speedKmhUrbanCore: number;
  speedKmhUrban: number;
  speedKmhSuburban: number;
  parkingBufferMinutes: number;
  sameDistrictMinutes: number;
  adjacentDistrictMinutes: number;
  farDistrictMinutes: number;
}

export const DEFAULT_TRAVEL_POLICY: TravelPolicy = {
  detourFactor: 1.35,
  speedKmhUrbanCore: 15,
  speedKmhUrban: 20,
  speedKmhSuburban: 30,
  parkingBufferMinutes: 8,
  sameDistrictMinutes: 15,
  adjacentDistrictMinutes: 30,
  farDistrictMinutes: 45,
};

/**
 * 估算結果的可信度。
 * UI 應據此決定是否標示「粗估」——只有 COORDINATES 值得讓督導認真看待。
 */
export type TravelConfidence = 'COORDINATES' | 'DISTRICT_ADJACENCY' | 'UNKNOWN';

export interface TravelEstimate {
  minutes: number;
  confidence: TravelConfidence;
  /** 供訊息顯示的距離（公里），僅在有座標時提供 */
  distanceKm?: number;
}

export interface TravelEndpoint {
  coords?: LatLng | null;
  districtCode?: string | null;
}

const EARTH_RADIUS_KM = 6371;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/** 兩點間大圓距離（公里）。 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function speedFor(tier: DistrictSpeedTier, policy: TravelPolicy): number {
  switch (tier) {
    case 'URBAN_CORE':
      return policy.speedKmhUrbanCore;
    case 'URBAN':
      return policy.speedKmhUrban;
    case 'SUBURBAN':
      return policy.speedKmhSuburban;
  }
}

/**
 * 估算 from → to 的移動時間（分鐘）。
 *
 * 演算法：
 *  1. 雙方皆有座標 → haversine × 迂迴係數 ÷ 目的地路況車速，再加停車緩衝
 *  2. 任一方缺座標 → 退回行政區鄰接表（同區／相鄰／其他）
 *  3. 連行政區都不知道 → 用最保守的 farDistrictMinutes
 */
export function estimateTravelMinutes(
  from: TravelEndpoint,
  to: TravelEndpoint,
  policy: TravelPolicy = DEFAULT_TRAVEL_POLICY,
  districts?: ReadonlyMap<string, DistrictInfo>,
): TravelEstimate {
  if (from.coords && to.coords) {
    const straightKm = haversineKm(from.coords, to.coords);
    const routeKm = straightKm * policy.detourFactor;
    const tier =
      (to.districtCode ? districts?.get(to.districtCode)?.speedTier : undefined) ?? 'URBAN';
    const minutes = (routeKm / speedFor(tier, policy)) * 60 + policy.parkingBufferMinutes;
    return {
      minutes: Math.ceil(minutes),
      confidence: 'COORDINATES',
      distanceKm: Math.round(routeKm * 10) / 10,
    };
  }

  if (from.districtCode && to.districtCode) {
    let base: number;
    if (from.districtCode === to.districtCode) {
      base = policy.sameDistrictMinutes;
    } else if (districts?.get(from.districtCode)?.adjacent.includes(to.districtCode)) {
      base = policy.adjacentDistrictMinutes;
    } else {
      base = policy.farDistrictMinutes;
    }
    return {
      minutes: Math.ceil(base + policy.parkingBufferMinutes),
      confidence: 'DISTRICT_ADJACENCY',
    };
  }

  return {
    minutes: Math.ceil(policy.farDistrictMinutes + policy.parkingBufferMinutes),
    confidence: 'UNKNOWN',
  };
}

/** 由行政區清單建立查詢 Map。 */
export function buildDistrictIndex(list: readonly DistrictInfo[]): Map<string, DistrictInfo> {
  return new Map(list.map((d) => [d.code, d]));
}
