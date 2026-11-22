-- Runs once, when the local Postgres volume is first created.
-- Extensions the architecture relies on (ARCHITECTURE §4, pgvector for embeddings).
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Separate database for tests that write data, so they never touch dev data.
CREATE DATABASE originos_test OWNER originos;
\connect originos_test
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
