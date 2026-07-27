-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('DAY_CARE', 'HOME_CARE');

-- CreateEnum
CREATE TYPE "MonthlyOtMode" AS ENUM ('STANDARD_46', 'FLEX_54_138');

-- CreateEnum
CREATE TYPE "RoundingMode" AS ENUM ('HALF_UP', 'FLOOR', 'CEIL');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'RESIGNED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ORG_ADMIN', 'SUPERVISOR', 'ADMIN_STAFF', 'ATTENDANT', 'AUDITOR');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('M', 'F', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'HOURLY', 'DISPATCH');

-- CreateEnum
CREATE TYPE "AttendantStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'RESIGNED');

-- CreateEnum
CREATE TYPE "CertType" AS ENUM ('CARE_ATTENDANT_TRAINING', 'CARE_ATTENDANT_LICENSE', 'IN_SERVICE_TRAINING', 'HEALTH_CHECK', 'CPR_FIRST_AID', 'BATH_VEHICLE', 'DEMENTIA_CARE', 'FOOT_CARE', 'DRIVER_LICENSE');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CopayCategory" AS ENUM ('GENERAL', 'LOW_MID_INCOME', 'LOW_INCOME');

-- CreateEnum
CREATE TYPE "RemoteAreaTier" AS ENUM ('NONE', 'REMOTE', 'MOUNTAIN_ISLAND');

-- CreateEnum
CREATE TYPE "GeocodeQuality" AS ENUM ('NONE', 'DISTRICT_CENTROID', 'ROOFTOP', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentCategory" AS ENUM ('CARE_PROFESSIONAL', 'TRANSPORT', 'ASSISTIVE_DEVICE', 'RESPITE');

-- CreateEnum
CREATE TYPE "PaymentUnitType" AS ENUM ('PER_TIME', 'PER_HOUR', 'PER_DAY', 'PER_ITEM');

-- CreateEnum
CREATE TYPE "CarePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('UNASSIGNED', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'PERSONAL', 'SICK', 'MENSTRUAL', 'OFFICIAL', 'BEREAVEMENT', 'MARRIAGE', 'MATERNITY', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CheckMethod" AS ENUM ('GPS', 'NFC', 'QR', 'MANUAL', 'PHONE');

-- CreateEnum
CREATE TYPE "RecordReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AMENDED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'READ', 'EXPORT', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'OVERRIDE');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "ltcCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceUnit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitType" "UnitType" NOT NULL DEFAULT 'HOME_CARE',
    "serviceAreas" TEXT[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "normalDailyMinutes" INTEGER NOT NULL DEFAULT 480,
    "maxDailyMinutes" INTEGER NOT NULL DEFAULT 720,
    "normalWeeklyMinutes" INTEGER NOT NULL DEFAULT 2400,
    "monthlyOtMode" "MonthlyOtMode" NOT NULL DEFAULT 'STANDARD_46',
    "monthlyOtMinutes" INTEGER NOT NULL DEFAULT 2760,
    "flexOtMonthMinutes" INTEGER NOT NULL DEFAULT 3240,
    "flexOtQuarterMinutes" INTEGER NOT NULL DEFAULT 8280,
    "restBreakAfterMinutes" INTEGER NOT NULL DEFAULT 240,
    "restBreakMinutes" INTEGER NOT NULL DEFAULT 30,
    "minShiftGapMinutes" INTEGER NOT NULL DEFAULT 660,
    "enforceSevenDayRest" BOOLEAN NOT NULL DEFAULT true,
    "idleGapCountsAsWorkThresholdMinutes" INTEGER NOT NULL DEFAULT 60,
    "detourFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.35,
    "speedKmhUrbanCore" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "speedKmhUrban" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "speedKmhSuburban" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "parkingBufferMinutes" INTEGER NOT NULL DEFAULT 8,
    "sameDistrictMinutes" INTEGER NOT NULL DEFAULT 15,
    "adjacentDistrictMinutes" INTEGER NOT NULL DEFAULT 30,
    "farDistrictMinutes" INTEGER NOT NULL DEFAULT 45,
    "roundingMode" "RoundingMode" NOT NULL DEFAULT 'HALF_UP',
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "OrgPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mustChangePw" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(6),
    "lastLoginAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "unitId" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendant" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "employeeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nationalIdEnc" BYTEA,
    "nationalIdBidx" TEXT,
    "nationalIdKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "birthDate" DATE,
    "gender" "Gender",
    "phone" TEXT NOT NULL,
    "addressEnc" BYTEA,
    "homeDistrict" TEXT,
    "homeLat" DOUBLE PRECISION,
    "homeLng" DOUBLE PRECISION,
    "employmentType" "EmploymentType" NOT NULL,
    "hiredOn" DATE NOT NULL,
    "resignedOn" DATE,
    "status" "AttendantStatus" NOT NULL DEFAULT 'ACTIVE',
    "primaryUnitId" TEXT,
    "maxDailyMinutes" INTEGER NOT NULL DEFAULT 480,
    "maxWeeklyMinutes" INTEGER NOT NULL DEFAULT 2400,
    "maxMonthlyOtMinutes" INTEGER NOT NULL DEFAULT 2760,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Attendant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendantServiceArea" (
    "id" TEXT NOT NULL,
    "attendantId" TEXT NOT NULL,
    "districtCode" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AttendantServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendantAvailability" (
    "id" TEXT NOT NULL,
    "attendantId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "AttendantAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "attendantId" TEXT NOT NULL,
    "certType" "CertType" NOT NULL,
    "certNo" TEXT,
    "issuedOn" DATE,
    "expiresOn" DATE,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareRecipient" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "caseNo" TEXT NOT NULL,
    "ltcCaseNo" TEXT,
    "name" TEXT NOT NULL,
    "nationalIdEnc" BYTEA,
    "nationalIdBidx" TEXT,
    "nationalIdKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "birthDate" DATE,
    "gender" "Gender",
    "phone" TEXT,
    "addressEnc" BYTEA,
    "districtCode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geocodeQuality" "GeocodeQuality" NOT NULL DEFAULT 'NONE',
    "cmsLevel" INTEGER NOT NULL,
    "copayCategory" "CopayCategory" NOT NULL,
    "disabilityCert" BOOLEAN NOT NULL DEFAULT false,
    "isIndigenous" BOOLEAN NOT NULL DEFAULT false,
    "remoteAreaTier" "RemoteAreaTier" NOT NULL DEFAULT 'NONE',
    "serviceStartOn" DATE NOT NULL,
    "serviceEndOn" DATE,
    "status" "RecipientStatus" NOT NULL DEFAULT 'ACTIVE',
    "primaryUnitId" TEXT,
    "supervisorId" TEXT,
    "medicalNotesEnc" BYTEA,
    "careNotesEnc" BYTEA,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CareRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipientContact" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RecipientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipientUnavailability" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "weekday" INTEGER,
    "specificDate" DATE,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "reason" TEXT,

    CONSTRAINT "RecipientUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "sourceRef" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentItem" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "PaymentCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "priceRemote" INTEGER,
    "unitType" "PaymentUnitType" NOT NULL DEFAULT 'PER_TIME',
    "standardMinutes" INTEGER,
    "minMinutes" INTEGER,
    "maxPerDay" INTEGER,
    "maxPerMonth" INTEGER,
    "isAddOn" BOOLEAN NOT NULL DEFAULT false,
    "addOnPercent" INTEGER,
    "requiredCerts" "CertType"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PaymentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsQuota" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "cmsLevel" INTEGER NOT NULL,
    "category" "PaymentCategory" NOT NULL,
    "monthlyAmount" INTEGER NOT NULL,

    CONSTRAINT "CmsQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopayRate" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "copayCategory" "CopayCategory" NOT NULL,
    "category" "PaymentCategory" NOT NULL,
    "ratePermille" INTEGER NOT NULL,

    CONSTRAINT "CopayRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlan" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "planNo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "cmsLevel" INTEGER NOT NULL,
    "copayCategory" "CopayCategory" NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "monthlyQuota" INTEGER NOT NULL,
    "status" "CarePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanItem" (
    "id" TEXT NOT NULL,
    "carePlanId" TEXT NOT NULL,
    "paymentItemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "approvedPerMonth" INTEGER NOT NULL,
    "approvedPerWeek" INTEGER,
    "preferredMinutes" INTEGER,
    "note" TEXT,

    CONSTRAINT "CarePlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringPattern" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "attendantId" TEXT,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "itemCodes" TEXT[],
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceVisit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "unitId" TEXT,
    "recipientId" TEXT NOT NULL,
    "attendantId" TEXT,
    "sourcePatternId" TEXT,
    "serviceDate" DATE NOT NULL,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "cancelReason" TEXT,
    "substituteForId" TEXT,
    "travelFromVisitId" TEXT,
    "estTravelMinutes" INTEGER,
    "conflictSummary" JSONB,
    "overriddenBy" TEXT,
    "overrideReason" TEXT,
    "lockedAt" TIMESTAMPTZ(6),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ServiceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitItem" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "paymentItemId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "VisitItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "attendantId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRecord" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "checkInAt" TIMESTAMPTZ(6),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInMethod" "CheckMethod",
    "checkOutAt" TIMESTAMPTZ(6),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "checkOutMethod" "CheckMethod",
    "actualMinutes" INTEGER,
    "gpsDeviationM" INTEGER,
    "actualItems" JSONB,
    "narrative" TEXT,
    "abnormalFlag" BOOLEAN NOT NULL DEFAULT false,
    "abnormalNote" TEXT,
    "signatureUrl" TEXT,
    "photoUrls" TEXT[],
    "offlineClientId" TEXT,
    "submittedAt" TIMESTAMPTZ(6),
    "syncedAt" TIMESTAMPTZ(6),
    "reviewStatus" "RecordReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "subjectRecipientId" TEXT,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_taxId_key" ON "Organization"("taxId");

-- CreateIndex
CREATE INDEX "ServiceUnit_orgId_idx" ON "ServiceUnit"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgPolicy_orgId_key" ON "OrgPolicy"("orgId");

-- CreateIndex
CREATE INDEX "User_orgId_status_idx" ON "User"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_orgId_account_key" ON "User"("orgId", "account");

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_unitId_key" ON "UserRole"("userId", "role", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attendant_userId_key" ON "Attendant"("userId");

-- CreateIndex
CREATE INDEX "Attendant_orgId_status_idx" ON "Attendant"("orgId", "status");

-- CreateIndex
CREATE INDEX "Attendant_orgId_primaryUnitId_status_idx" ON "Attendant"("orgId", "primaryUnitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Attendant_orgId_employeeNo_key" ON "Attendant"("orgId", "employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Attendant_orgId_nationalIdBidx_key" ON "Attendant"("orgId", "nationalIdBidx");

-- CreateIndex
CREATE INDEX "AttendantServiceArea_districtCode_idx" ON "AttendantServiceArea"("districtCode");

-- CreateIndex
CREATE UNIQUE INDEX "AttendantServiceArea_attendantId_districtCode_key" ON "AttendantServiceArea"("attendantId", "districtCode");

-- CreateIndex
CREATE INDEX "AttendantAvailability_attendantId_weekday_idx" ON "AttendantAvailability"("attendantId", "weekday");

-- CreateIndex
CREATE INDEX "Certification_attendantId_certType_idx" ON "Certification"("attendantId", "certType");

-- CreateIndex
CREATE INDEX "Certification_expiresOn_idx" ON "Certification"("expiresOn");

-- CreateIndex
CREATE INDEX "CareRecipient_orgId_status_districtCode_idx" ON "CareRecipient"("orgId", "status", "districtCode");

-- CreateIndex
CREATE INDEX "CareRecipient_supervisorId_status_idx" ON "CareRecipient"("supervisorId", "status");

-- CreateIndex
CREATE INDEX "CareRecipient_orgId_primaryUnitId_status_idx" ON "CareRecipient"("orgId", "primaryUnitId", "status");

-- CreateIndex
CREATE INDEX "CareRecipient_orgId_cmsLevel_idx" ON "CareRecipient"("orgId", "cmsLevel");

-- CreateIndex
CREATE UNIQUE INDEX "CareRecipient_orgId_caseNo_key" ON "CareRecipient"("orgId", "caseNo");

-- CreateIndex
CREATE UNIQUE INDEX "CareRecipient_orgId_nationalIdBidx_key" ON "CareRecipient"("orgId", "nationalIdBidx");

-- CreateIndex
CREATE INDEX "RecipientContact_recipientId_idx" ON "RecipientContact"("recipientId");

-- CreateIndex
CREATE INDEX "RecipientUnavailability_recipientId_idx" ON "RecipientUnavailability"("recipientId");

-- CreateIndex
CREATE INDEX "PaymentSchedule_effectiveFrom_idx" ON "PaymentSchedule"("effectiveFrom");

-- CreateIndex
CREATE INDEX "PaymentItem_scheduleId_category_idx" ON "PaymentItem"("scheduleId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentItem_scheduleId_code_key" ON "PaymentItem"("scheduleId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CmsQuota_scheduleId_cmsLevel_category_key" ON "CmsQuota"("scheduleId", "cmsLevel", "category");

-- CreateIndex
CREATE UNIQUE INDEX "CopayRate_scheduleId_copayCategory_category_key" ON "CopayRate"("scheduleId", "copayCategory", "category");

-- CreateIndex
CREATE INDEX "CarePlan_recipientId_status_idx" ON "CarePlan"("recipientId", "status");

-- CreateIndex
CREATE INDEX "CarePlan_effectiveFrom_effectiveTo_idx" ON "CarePlan"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "CarePlanItem_carePlanId_idx" ON "CarePlanItem"("carePlanId");

-- CreateIndex
CREATE UNIQUE INDEX "CarePlanItem_carePlanId_paymentItemId_key" ON "CarePlanItem"("carePlanId", "paymentItemId");

-- CreateIndex
CREATE INDEX "RecurringPattern_recipientId_isActive_idx" ON "RecurringPattern"("recipientId", "isActive");

-- CreateIndex
CREATE INDEX "RecurringPattern_attendantId_weekday_idx" ON "RecurringPattern"("attendantId", "weekday");

-- CreateIndex
CREATE INDEX "ServiceVisit_orgId_serviceDate_idx" ON "ServiceVisit"("orgId", "serviceDate");

-- CreateIndex
CREATE INDEX "ServiceVisit_attendantId_serviceDate_idx" ON "ServiceVisit"("attendantId", "serviceDate");

-- CreateIndex
CREATE INDEX "ServiceVisit_recipientId_serviceDate_idx" ON "ServiceVisit"("recipientId", "serviceDate");

-- CreateIndex
CREATE INDEX "ServiceVisit_attendantId_startAt_endAt_idx" ON "ServiceVisit"("attendantId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "ServiceVisit_orgId_status_serviceDate_idx" ON "ServiceVisit"("orgId", "status", "serviceDate");

-- CreateIndex
CREATE INDEX "ServiceVisit_unitId_serviceDate_idx" ON "ServiceVisit"("unitId", "serviceDate");

-- CreateIndex
CREATE INDEX "ServiceVisit_sourcePatternId_serviceDate_idx" ON "ServiceVisit"("sourcePatternId", "serviceDate");

-- CreateIndex
CREATE INDEX "VisitItem_visitId_idx" ON "VisitItem"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitItem_visitId_paymentItemId_key" ON "VisitItem"("visitId", "paymentItemId");

-- CreateIndex
CREATE INDEX "LeaveRequest_attendantId_startAt_endAt_idx" ON "LeaveRequest"("attendantId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRecord_visitId_key" ON "ServiceRecord"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRecord_offlineClientId_key" ON "ServiceRecord"("offlineClientId");

-- CreateIndex
CREATE INDEX "ServiceRecord_reviewStatus_idx" ON "ServiceRecord"("reviewStatus");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_subjectRecipientId_createdAt_idx" ON "AuditLog"("subjectRecipientId", "createdAt");

-- AddForeignKey
ALTER TABLE "ServiceUnit" ADD CONSTRAINT "ServiceUnit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgPolicy" ADD CONSTRAINT "OrgPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendant" ADD CONSTRAINT "Attendant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendantServiceArea" ADD CONSTRAINT "AttendantServiceArea_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "Attendant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendantAvailability" ADD CONSTRAINT "AttendantAvailability_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "Attendant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "Attendant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipientContact" ADD CONSTRAINT "RecipientContact_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CareRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipientUnavailability" ADD CONSTRAINT "RecipientUnavailability_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CareRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentItem" ADD CONSTRAINT "PaymentItem_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "PaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsQuota" ADD CONSTRAINT "CmsQuota_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "PaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopayRate" ADD CONSTRAINT "CopayRate_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "PaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CareRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "PaymentSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_paymentItemId_fkey" FOREIGN KEY ("paymentItemId") REFERENCES "PaymentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringPattern" ADD CONSTRAINT "RecurringPattern_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CareRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CareRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "Attendant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitItem" ADD CONSTRAINT "VisitItem_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitItem" ADD CONSTRAINT "VisitItem_paymentItemId_fkey" FOREIGN KEY ("paymentItemId") REFERENCES "PaymentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "Attendant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ServiceVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
