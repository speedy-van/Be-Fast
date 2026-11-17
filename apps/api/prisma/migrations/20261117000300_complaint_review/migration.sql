ALTER TABLE "Complaint" ADD COLUMN "nonDeliveryVerifiedAt" TIMESTAMPTZ(3);

ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_nonDeliveryVerifiedAt_type_check"
    CHECK ("nonDeliveryVerifiedAt" IS NULL OR "type" = 'NOT_RECEIVED');

CREATE UNIQUE INDEX "Complaint_orderId_open_key"
    ON "Complaint" ("orderId") WHERE "status" IN ('OPEN', 'IN_PROGRESS');
