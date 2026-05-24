-- Per-bandleader payment-method preferences.
-- When the array is empty (the default), the application layer treats it
-- as "every supported method except ZELLE." Bandleaders can opt Zelle
-- back in or remove methods they don't actually use on the Settings page.
ALTER TABLE "User" ADD COLUMN "enabledPaymentMethods" TEXT[] DEFAULT ARRAY[]::TEXT[];
