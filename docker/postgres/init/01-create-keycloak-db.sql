-- Runs once on first Postgres boot (mounted into /docker-entrypoint-initdb.d).
-- The app database (linkz_db) is created by POSTGRES_DB; Keycloak needs its own.
CREATE DATABASE keycloak_db OWNER linkz;
