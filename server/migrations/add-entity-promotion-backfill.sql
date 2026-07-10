-- ══════════════════════════════════════════════════════════════════════
-- Zoho Parity — Phase B: entity promotion backfill
-- ══════════════════════════════════════════════════════════════════════
-- Promotes communities.community_manager_name (a bare string) into the
-- managers table created in Phase A, and links communities.manager_id.
--
-- The string column REMAINS the write-path for existing UI — the app
-- layer keeps manager_id in sync on every community create/update
-- (server/utils/people.js). This backfill covers rows that predate the
-- sync.
--
-- Idempotent: ON CONFLICT DO NOTHING on inserts; linking only touches
-- rows where manager_id IS NULL. Safe to run on every startup.
-- ══════════════════════════════════════════════════════════════════════

-- 1. Create a manager row for every distinct non-empty name per client.
INSERT INTO managers (client_id, name, is_test)
SELECT DISTINCT c.client_id, TRIM(c.community_manager_name), COALESCE(c.is_test, FALSE)
FROM communities c
WHERE c.community_manager_name IS NOT NULL
  AND TRIM(c.community_manager_name) != ''
ON CONFLICT (client_id, name, is_test) DO NOTHING;

-- 2. Link communities to their manager row by name.
UPDATE communities c
SET manager_id = m.id
FROM managers m
WHERE c.manager_id IS NULL
  AND c.community_manager_name IS NOT NULL
  AND TRIM(c.community_manager_name) != ''
  AND m.client_id = c.client_id
  AND m.name = TRIM(c.community_manager_name)
  AND m.is_test = COALESCE(c.is_test, FALSE);

-- 3. Inherit the community's location onto the manager when the manager
--    has none yet and all their communities agree on one location.
UPDATE managers m
SET location_id = sub.location_id
FROM (
  SELECT manager_id, MIN(location_id) AS location_id
  FROM communities
  WHERE manager_id IS NOT NULL AND location_id IS NOT NULL
  GROUP BY manager_id
  HAVING COUNT(DISTINCT location_id) = 1
) sub
WHERE m.id = sub.manager_id
  AND m.location_id IS NULL;
