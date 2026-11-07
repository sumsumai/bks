-- Double-booking prevention at the database level: no two live bookings for the same staff member may overlap.
-- The application also checks availability first (for a friendly error), but this constraint is the guarantee,
-- including under concurrent requests from the web, the owner app and every agent channel.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("staff_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" IN ('pending', 'confirmed'));
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_valid_range" CHECK ("ends_at" > "starts_at");
