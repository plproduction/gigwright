-- The previous migration seeded senderEmail = 'patrick@patricklamb.com',
-- but patricklamb.com isn't verified at Resend (free plan caps at 1 domain,
-- gigwright.com already occupies the slot). So sends from his account
-- 403'd at the API. Clear the seed so his fanouts fall back to the
-- standardized "Patrick Lamb via GigWright" <gigs@gigwright.com> sender,
-- which uses the already-verified gigwright.com domain.

UPDATE "User"
  SET "senderEmail" = NULL
  WHERE "email" = 'patrick@patricklamb.com';
