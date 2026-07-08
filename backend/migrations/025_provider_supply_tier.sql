-- 025_provider_supply_tier.sql
-- Durable provider supply tiers for Tareq trial/on-demand credit policy.
--
-- supply_tier is backend-visible only:
--   - dcp_owned: DCP-operated native capacity
--   - provider: community/native provider capacity
--   - on_demand: externally brokered on-demand capacity requiring paid credit
--
-- Keep is_burst as the safety fallback for existing burst-backed rows.

ALTER TABLE providers ADD COLUMN supply_tier TEXT DEFAULT 'provider';

UPDATE providers
   SET supply_tier = 'on_demand'
 WHERE COALESCE(is_burst, 0) = 1
   AND COALESCE(NULLIF(TRIM(supply_tier), ''), 'provider') != 'on_demand';

UPDATE providers
   SET supply_tier = 'provider'
 WHERE COALESCE(is_burst, 0) = 0
   AND (
     supply_tier IS NULL
     OR TRIM(supply_tier) = ''
     OR LOWER(TRIM(supply_tier)) NOT IN ('dcp_owned', 'provider', 'on_demand')
   );

