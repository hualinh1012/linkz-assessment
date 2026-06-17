-- Drop the keycloak_id column — the users.id column now holds the Keycloak
-- subject (sub) directly, so the separate keycloak_id is redundant.
DROP INDEX IF EXISTS "users_keycloak_id_key";
ALTER TABLE "users" DROP COLUMN IF EXISTS "keycloak_id";
