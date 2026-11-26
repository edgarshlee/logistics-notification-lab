import "reflect-metadata";
import { DataSource } from "typeorm";

export const db = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
});
export const transitions: Record<string, string[]> = {
  registered: ["in_transit"],
  in_transit: ["exception", "delivered"],
  exception: ["in_transit"],
  delivered: [],
};
export const events: Record<string, string> = {
  in_transit: "ShipmentInTransit",
  exception: "ShipmentExceptionRaised",
  delivered: "ShipmentDelivered",
};

export async function migrate() {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(623844)");
    await tx.query(`
      CREATE TABLE IF NOT EXISTS shipments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), destination text NOT NULL,
        recipient text NOT NULL DEFAULT 'demo', status text NOT NULL DEFAULT 'registered',
        version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS history (
        shipment_id uuid REFERENCES shipments, version integer, status text NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(shipment_id,version));
      CREATE TABLE IF NOT EXISTS outbox (
        id uuid PRIMARY KEY, payload jsonb NOT NULL, published_at timestamptz,
        attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS notifications (
        event_id uuid, recipient text, shipment_id uuid REFERENCES shipments, event_type text NOT NULL,
        occurred_at timestamptz NOT NULL, read_at timestamptz, PRIMARY KEY(event_id, recipient));
    `);
    await tx.query(`CREATE TABLE IF NOT EXISTS queue_snapshot (
      singleton boolean PRIMARY KEY DEFAULT true, sample jsonb NOT NULL, sampled_at timestamptz NOT NULL);
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS stored_at timestamptz;
      ALTER TABLE notifications ALTER COLUMN stored_at SET DEFAULT now();
      CREATE TABLE IF NOT EXISTS dlq_replays (
        event_id uuid PRIMARY KEY, observed_at timestamptz NOT NULL DEFAULT now(), replayed_at timestamptz)`);
    await tx.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS note text;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS detail text;
      CREATE INDEX IF NOT EXISTS outbox_shipment_version
        ON outbox (((payload->>'shipmentId')::uuid), ((payload->>'shipmentVersion')::int))`);
    const seed = await tx.query(
      "INSERT INTO shipments(id,destination) VALUES ('00000000-0000-4000-8000-000000000001','부산 물류센터') ON CONFLICT DO NOTHING RETURNING id",
    );
    if (seed.length)
      await tx.query(
        "INSERT INTO history(shipment_id,version,status) VALUES ($1,1,'registered')",
        [seed[0].id],
      );
    await tx.query(`INSERT INTO history(shipment_id,version,status,occurred_at)
      SELECT id,1,'registered',created_at FROM shipments
      ON CONFLICT (shipment_id,version) DO NOTHING`);
  });
}
