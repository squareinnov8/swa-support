-- Update intents to require verification for protected support intents
-- This aligns with the PROTECTED_INTENTS list in src/lib/verification/types.ts

UPDATE intents SET
  requires_verification = true,
  examples = ARRAY['screen is dead', 'audio not working', 'stopped working', 'broken', 'malfunction', 'not turning on', 'no sound', 'doesnt work'],
  updated_at = now()
WHERE slug = 'PRODUCT_SUPPORT';

UPDATE intents SET
  requires_verification = true,
  updated_at = now()
WHERE slug = 'FIRMWARE_UPDATE_REQUEST';

UPDATE intents SET
  requires_verification = true,
  updated_at = now()
WHERE slug = 'FIRMWARE_ACCESS_ISSUE';

UPDATE intents SET
  requires_verification = true,
  updated_at = now()
WHERE slug = 'INSTALL_GUIDANCE';

UPDATE intents SET
  requires_verification = true,
  updated_at = now()
WHERE slug = 'FUNCTIONALITY_BUG';

-- Verify the updates
SELECT slug, name, requires_verification
FROM intents
WHERE slug IN ('PRODUCT_SUPPORT', 'FIRMWARE_UPDATE_REQUEST', 'FIRMWARE_ACCESS_ISSUE', 'INSTALL_GUIDANCE', 'FUNCTIONALITY_BUG')
ORDER BY slug;
