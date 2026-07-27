import { describe, expect, it } from 'vitest';
import {
  buildDistrictIndex,
  DEFAULT_TRAVEL_POLICY,
  estimateTravelMinutes,
  haversineKm,
  type DistrictInfo,
} from './geo.js';

const districts: DistrictInfo[] = [
  {
    code: 'A',
    name: '大安區',
    centroid: { lat: 25.026, lng: 121.543 },
    adjacent: ['B'],
    speedTier: 'URBAN_CORE',
  },
  {
    code: 'B',
    name: '信義區',
    centroid: { lat: 25.033, lng: 121.572 },
    adjacent: ['A'],
    speedTier: 'URBAN',
  },
  {
    code: 'C',
    name: '文山區',
    centroid: { lat: 24.989, lng: 121.57 },
    adjacent: [],
    speedTier: 'SUBURBAN',
  },
];
const index = buildDistrictIndex(districts);

describe('haversineKm', () => {
  it('同一點距離為 0', () => {
    expect(haversineKm({ lat: 25, lng: 121 }, { lat: 25, lng: 121 })).toBe(0);
  });

  it('對稱性', () => {
    const a = { lat: 25.026, lng: 121.543 };
    const b = { lat: 25.033, lng: 121.572 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });

  it('大安區到信義區約 3 公里', () => {
    const d = haversineKm(districts[0]!.centroid, districts[1]!.centroid);
    expect(d).toBeGreaterThan(2.5);
    expect(d).toBeLessThan(3.5);
  });

  it('緯度一度約 111 公里', () => {
    expect(haversineKm({ lat: 25, lng: 121 }, { lat: 26, lng: 121 })).toBeCloseTo(111.19, 1);
  });
});

describe('estimateTravelMinutes — 有座標', () => {
  it('回傳 COORDINATES 可信度與距離', () => {
    const r = estimateTravelMinutes(
      { coords: districts[0]!.centroid, districtCode: 'A' },
      { coords: districts[1]!.centroid, districtCode: 'B' },
      DEFAULT_TRAVEL_POLICY,
      index,
    );
    expect(r.confidence).toBe('COORDINATES');
    expect(r.distanceKm).toBeGreaterThan(0);
    expect(r.minutes).toBeGreaterThan(DEFAULT_TRAVEL_POLICY.parkingBufferMinutes);
  });

  it('同一地點仍需停車緩衝時間', () => {
    const p = { lat: 25.026, lng: 121.543 };
    const r = estimateTravelMinutes({ coords: p }, { coords: p }, DEFAULT_TRAVEL_POLICY, index);
    expect(r.minutes).toBe(DEFAULT_TRAVEL_POLICY.parkingBufferMinutes);
  });

  it('目的地為市中心時因車速較慢而耗時較長', () => {
    const from = { coords: { lat: 25.0, lng: 121.5 } };
    const toCore = { coords: { lat: 25.05, lng: 121.5 }, districtCode: 'A' }; // URBAN_CORE 15km/h
    const toSuburb = { coords: { lat: 25.05, lng: 121.5 }, districtCode: 'C' }; // SUBURBAN 30km/h
    const core = estimateTravelMinutes(from, toCore, DEFAULT_TRAVEL_POLICY, index);
    const suburb = estimateTravelMinutes(from, toSuburb, DEFAULT_TRAVEL_POLICY, index);
    expect(core.minutes).toBeGreaterThan(suburb.minutes);
  });

  it('距離越遠時間越長（單調性）', () => {
    const from = { coords: { lat: 25.0, lng: 121.5 } };
    const near = estimateTravelMinutes(from, { coords: { lat: 25.01, lng: 121.5 } });
    const far = estimateTravelMinutes(from, { coords: { lat: 25.1, lng: 121.5 } });
    expect(far.minutes).toBeGreaterThan(near.minutes);
  });

  it('回傳值恆為非負整數', () => {
    const r = estimateTravelMinutes(
      { coords: { lat: 25, lng: 121 } },
      { coords: { lat: 25.5, lng: 121.5 } },
    );
    expect(Number.isInteger(r.minutes)).toBe(true);
    expect(r.minutes).toBeGreaterThanOrEqual(0);
  });
});

describe('estimateTravelMinutes — 無座標時退回行政區鄰接表', () => {
  it('同一行政區', () => {
    const r = estimateTravelMinutes(
      { districtCode: 'A' },
      { districtCode: 'A' },
      DEFAULT_TRAVEL_POLICY,
      index,
    );
    expect(r.confidence).toBe('DISTRICT_ADJACENCY');
    expect(r.minutes).toBe(
      DEFAULT_TRAVEL_POLICY.sameDistrictMinutes + DEFAULT_TRAVEL_POLICY.parkingBufferMinutes,
    );
  });

  it('相鄰行政區', () => {
    const r = estimateTravelMinutes(
      { districtCode: 'A' },
      { districtCode: 'B' },
      DEFAULT_TRAVEL_POLICY,
      index,
    );
    expect(r.minutes).toBe(
      DEFAULT_TRAVEL_POLICY.adjacentDistrictMinutes + DEFAULT_TRAVEL_POLICY.parkingBufferMinutes,
    );
  });

  it('非相鄰行政區', () => {
    const r = estimateTravelMinutes(
      { districtCode: 'A' },
      { districtCode: 'C' },
      DEFAULT_TRAVEL_POLICY,
      index,
    );
    expect(r.minutes).toBe(
      DEFAULT_TRAVEL_POLICY.farDistrictMinutes + DEFAULT_TRAVEL_POLICY.parkingBufferMinutes,
    );
  });

  it('僅一方有座標時仍退回行政區判斷', () => {
    const r = estimateTravelMinutes(
      { coords: { lat: 25, lng: 121 }, districtCode: 'A' },
      { districtCode: 'B' },
      DEFAULT_TRAVEL_POLICY,
      index,
    );
    expect(r.confidence).toBe('DISTRICT_ADJACENCY');
  });

  it('連行政區都缺時採最保守估計並標為 UNKNOWN', () => {
    const r = estimateTravelMinutes({}, {}, DEFAULT_TRAVEL_POLICY, index);
    expect(r.confidence).toBe('UNKNOWN');
    expect(r.minutes).toBe(
      DEFAULT_TRAVEL_POLICY.farDistrictMinutes + DEFAULT_TRAVEL_POLICY.parkingBufferMinutes,
    );
  });

  it('未提供行政區索引時，不同區一律視為非相鄰', () => {
    const r = estimateTravelMinutes({ districtCode: 'A' }, { districtCode: 'B' });
    expect(r.minutes).toBe(
      DEFAULT_TRAVEL_POLICY.farDistrictMinutes + DEFAULT_TRAVEL_POLICY.parkingBufferMinutes,
    );
  });
});
