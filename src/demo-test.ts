import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { SQS } from "@aws-sdk/client-sqs";
import { db } from "./db";

const sqs = new SQS({
  endpoint: process.env.AWS_ENDPOINT_URL,
  useQueueUrlAsEndpoint: false,
});
const service = "http://api:3000/api/";
async function request(path: string, method = "GET", body?: object) {
  return fetch(service + path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function until<T>(
  check: () => Promise<T | undefined>,
  description: string,
  timeout = 20000,
): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value !== undefined) return value;
    await sleep(300);
  }
  throw Error("Timed out: " + description);
}
async function test() {
  await db.initialize();
  const created = await request("shipments", "POST", {
    destination: "검증 센터",
  });
  assert.equal(created.status, 201);
  const shipment = await created.json();
  const path = "shipments/" + shipment.id;
  assert.equal(
    (await request(path, "PATCH", { status: "delivered", version: 1 })).status,
    400,
  );
  const start = () =>
    request(path, "PATCH", { status: "in_transit", version: 1 });
  assert.deepEqual(
    (await Promise.all([start(), start()])).map((r) => r.status).sort(),
    [200, 409],
  );
  const findNotice = async (id: string) => {
    const rows = await (await request("notifications")).json();
    return rows.find((n: any) => n.event_id === id);
  };
  const [{ payload: event }] = await db.query(
    "SELECT payload FROM outbox WHERE payload->>'shipmentId'=$1",
    [shipment.id],
  );
  await until(() => findNotice(event.eventId), "notification");
  const queue = (await sqs.getQueueUrl({ QueueName: "shipment-notifications" }))
    .QueueUrl!;
  await sqs.sendMessage({
    QueueUrl: queue,
    MessageBody: JSON.stringify(event),
  });
  assert.equal(
    (await request("notifications/" + event.eventId + "/read", "PATCH")).status,
    200,
  );
  for (const [index, status] of [
    "exception",
    "in_transit",
    "delivered",
  ].entries()) {
    assert.equal(
      (await request(path, "PATCH", { version: index + 2, status })).status,
      200,
    );
  }
  assert.equal((await (await request(path)).json()).length, 5);
  await until(async () => {
    const rows = (await (await request("notifications")).json()).filter(
      (n: any) => n.shipment_id === shipment.id,
    );
    return rows.length === 3 &&
      rows.some((n: any) => n.event_id === event.eventId && n.read_at)
      ? true
      : undefined;
  }, "three distinct alerts including read receipt");
  console.log(
    "PASS shipment lifecycle, concurrent transitions, inbox and read receipt",
  );

  // A valid event refers to a shipment that will only exist after repair.
  const delayed = { ...event, eventId: randomUUID(), shipmentId: randomUUID() };
  await sqs.sendMessage({
    QueueUrl: queue,
    MessageBody: JSON.stringify(delayed),
  });
  const dlq = (
    await sqs.getQueueUrl({ QueueName: "shipment-notifications-dlq" })
  ).QueueUrl!;
  const message = await until(
    async () => {
      const batch = await sqs.receiveMessage({
        QueueUrl: dlq,
        WaitTimeSeconds: 1,
        VisibilityTimeout: 3,
      });
      return batch.Messages?.find(
        (m) => JSON.parse(m.Body!).eventId === delayed.eventId,
      );
    },
    "automatic DLQ routing",
    90000,
  );
  await db.query("INSERT INTO dlq_replays(event_id) VALUES ($1)", [
    delayed.eventId,
  ]);
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO shipments(id,destination,status,version) VALUES ($1,'복구 검증 센터','in_transit',2)",
      [delayed.shipmentId],
    );
    await tx.query(
      "INSERT INTO history(shipment_id,version,status) VALUES ($1,1,'registered'),($1,2,'in_transit')",
      [delayed.shipmentId],
    );
  });
  // Replay this test event only, preserving its business identifier.
  await sqs.sendMessage({ QueueUrl: queue, MessageBody: message.Body });
  await sqs.deleteMessage({
    QueueUrl: dlq,
    ReceiptHandle: message.ReceiptHandle,
  });
  await until(() => findNotice(delayed.eventId), "replayed notification");
  await db.query("UPDATE dlq_replays SET replayed_at=now() WHERE event_id=$1", [
    delayed.eventId,
  ]);
  console.log("PASS DLQ routing and selective replay");
}
test()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (db.isInitialized) await db.destroy();
    sqs.destroy();
  });
