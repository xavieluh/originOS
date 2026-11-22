-- Reverses 0002. Destroys agents, grants and consent records.
DROP TABLE IF EXISTS core.permission_grants, core.consents, core.agents CASCADE;
