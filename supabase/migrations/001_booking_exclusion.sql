-- Local PostgreSQL shape for a hosted club database.
-- The running app uses SQLite with the same overlap rule inside a transaction.
-- Apply this file when a Postgres instance is available. Do not point the frontend at an empty URL and call it deployed.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE booking_resources (
  booking_id uuid NOT NULL,
  resource_id text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL,
  PRIMARY KEY (booking_id, resource_id),
  CONSTRAINT no_overlap EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'confirmed')
);
