-- Reverses 0010: drops the IdentityMesh tables and their data, and the OAuth attempt purpose columns.
ALTER TABLE core.oauth_states DROP CONSTRAINT IF EXISTS oauth_states_purpose_ck;
--> statement-breakpoint
ALTER TABLE core.oauth_states DROP COLUMN IF EXISTS profile_id;
--> statement-breakpoint
ALTER TABLE core.oauth_states DROP COLUMN IF EXISTS purpose;
--> statement-breakpoint
DROP TABLE IF EXISTS trust.identity_reviews;
--> statement-breakpoint
DROP TABLE IF EXISTS trust.identity_proofs;
--> statement-breakpoint
DROP TABLE IF EXISTS trust.profiles;
