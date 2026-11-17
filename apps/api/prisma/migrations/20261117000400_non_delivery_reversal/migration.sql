CREATE UNIQUE INDEX "LedgerEntry_orderId_non_delivery_reversal_key"
    ON "LedgerEntry" ("orderId")
    WHERE "type" = 'ADJUSTMENT' AND "orderId" IS NOT NULL AND "reference" = 'NON_DELIVERY_REVERSAL';
