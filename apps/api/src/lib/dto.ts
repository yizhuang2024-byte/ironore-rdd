/**
 * DTO 序列化 —— 個資最小化在此強制執行。
 *
 * 關鍵原則：不同角色看到的欄位不同，這件事必須在 API 層決定，
 * 不能靠前端「不顯示」。前端不顯示的欄位仍在 response body 裡，
 * 打開 DevTools 就看得到。
 */

import { decryptPii, maskAddress, maskName, maskNationalId } from './crypto.js';
import { hasPermission, type AuthUser } from './rbac.js';

interface RecipientRow {
  id: string;
  caseNo: string;
  ltcCaseNo: string | null;
  name: string;
  nationalIdEnc: Uint8Array | null;
  birthDate: Date | null;
  gender: string | null;
  phone: string | null;
  addressEnc: Uint8Array | null;
  districtCode: string;
  lat: number | null;
  lng: number | null;
  geocodeQuality: string;
  cmsLevel: number;
  copayCategory: string;
  disabilityCert: boolean;
  isIndigenous: boolean;
  remoteAreaTier: string;
  serviceStartOn: Date;
  serviceEndOn: Date | null;
  status: string;
  primaryUnitId: string | null;
  supervisorId: string | null;
  medicalNotesEnc?: Uint8Array | null;
  careNotesEnc?: Uint8Array | null;
}

/**
 * 個案列表／詳情的預設序列化 —— 一律遮罩。
 * 要看明文必須另外呼叫 reveal 端點，且會寫入稽核紀錄。
 */
export function toRecipientDto(row: RecipientRow) {
  return {
    id: row.id,
    caseNo: row.caseNo,
    ltcCaseNo: row.ltcCaseNo,
    nameMasked: maskName(row.name),
    nationalIdMasked: row.nationalIdEnc ? maskNationalId(decryptPii(row.nationalIdEnc)) : null,
    birthDate: row.birthDate,
    gender: row.gender,
    phone: row.phone,
    addressMasked: row.addressEnc ? maskAddress(decryptPii(row.addressEnc)) : null,
    districtCode: row.districtCode,
    lat: row.lat,
    lng: row.lng,
    geocodeQuality: row.geocodeQuality,
    cmsLevel: row.cmsLevel,
    copayCategory: row.copayCategory,
    disabilityCert: row.disabilityCert,
    isIndigenous: row.isIndigenous,
    remoteAreaTier: row.remoteAreaTier,
    serviceStartOn: row.serviceStartOn,
    serviceEndOn: row.serviceEndOn,
    status: row.status,
    primaryUnitId: row.primaryUnitId,
    supervisorId: row.supervisorId,
  };
}

/**
 * 個資明文。呼叫端必須先確認權限並寫入稽核紀錄。
 * AUDITOR 角色刻意不具 pii:reveal 權限 —— 稽核工作不需要看個資明文。
 */
export function toRecipientPiiDto(row: RecipientRow, user: AuthUser) {
  if (!hasPermission(user, 'pii:reveal')) {
    throw new Error('缺少 pii:reveal 權限');
  }
  return {
    id: row.id,
    name: row.name,
    nationalId: row.nationalIdEnc ? decryptPii(row.nationalIdEnc) : null,
    address: row.addressEnc ? decryptPii(row.addressEnc) : null,
    medicalNotes: row.medicalNotesEnc ? decryptPii(row.medicalNotesEnc) : null,
    careNotes: row.careNotesEnc ? decryptPii(row.careNotesEnc) : null,
  };
}

interface AttendantRow {
  id: string;
  employeeNo: string;
  name: string;
  nationalIdEnc: Uint8Array | null;
  birthDate: Date | null;
  gender: string | null;
  phone: string;
  homeDistrict: string | null;
  homeLat: number | null;
  homeLng: number | null;
  employmentType: string;
  hiredOn: Date;
  resignedOn: Date | null;
  status: string;
  primaryUnitId: string | null;
  maxDailyMinutes: number;
  maxWeeklyMinutes: number;
  maxMonthlyOtMinutes: number;
}

export function toAttendantDto(row: AttendantRow) {
  return {
    id: row.id,
    employeeNo: row.employeeNo,
    // 照服員是員工不是服務對象，內部管理需要看得到全名
    name: row.name,
    nationalIdMasked: row.nationalIdEnc ? maskNationalId(decryptPii(row.nationalIdEnc)) : null,
    birthDate: row.birthDate,
    gender: row.gender,
    phone: row.phone,
    homeDistrict: row.homeDistrict,
    homeLat: row.homeLat,
    homeLng: row.homeLng,
    employmentType: row.employmentType,
    hiredOn: row.hiredOn,
    resignedOn: row.resignedOn,
    status: row.status,
    primaryUnitId: row.primaryUnitId,
    maxDailyMinutes: row.maxDailyMinutes,
    maxWeeklyMinutes: row.maxWeeklyMinutes,
    maxMonthlyOtMinutes: row.maxMonthlyOtMinutes,
  };
}

/**
 * 照服員行動端看到的個案資訊 —— 最小欄位集。
 *
 * 絕不含身分證字號、完整病史、其他個案。外勤人員需要的是
 * 「去哪裡、找誰、做什麼、要注意什麼」，不需要完整個資。
 */
export function toMobileRecipientDto(row: RecipientRow) {
  return {
    id: row.id,
    nameMasked: maskName(row.name),
    phone: row.phone,
    districtCode: row.districtCode,
    // 外勤需要完整地址才找得到門牌，這是必要的最小揭露
    address: row.addressEnc ? decryptPii(row.addressEnc) : null,
    lat: row.lat,
    lng: row.lng,
    // 照顧注意事項是執行服務所必需
    careNotes: row.careNotesEnc ? decryptPii(row.careNotesEnc) : null,
  };
}
