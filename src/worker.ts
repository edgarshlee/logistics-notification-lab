import { SQS, Message } from "@aws-sdk/client-sqs";
import { setTimeout as sleep } from "node:timers/promises";
import { db, events, migrate } from "./db";

const sqs = new SQS({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL,
  useQueueUrlAsEndpoint: false,
});
const queueName = "shipment-notifications";
async function queues() {
  const dlq = await sqs.createQueue({ QueueName: queueName + "-dlq" });
  const info = await sqs.getQueueAttributes({
    QueueUrl: dlq.QueueUrl,
    AttributeNames: ["QueueArn"],
  });
  const source = await sqs.createQueue({
    QueueName: queueName,
    Attributes: {
      VisibilityTimeout: "10",
      RedrivePolicy: JSON.stringify({
        deadLetterTargetArn: info.Attributes!.QueueArn,
        maxReceiveCount: "3",
      }),
    },
  });
  return { url: source.QueueUrl!, dlq: dlq.QueueUrl! };
}

async function publish(queueUrl: string) {
  const rows = await db.query(
    "SELECT id,payload FROM outbox WHERE published_at IS NULL AND next_attempt <= now() ORDER BY next_attempt LIMIT 20",
  );
  for (const row of rows) {
    try {
      await sqs.sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(row.payload),
      });
      await db.query("UPDATE outbox SET published_at=now() WHERE id=$1", [
        row.id,
      ]);
    } catch (error) {
      await db.query(
        "UPDATE outbox SET attempts=attempts+1,next_attempt=now()+least(60,power(2,least(6,attempts))) * interval '1 second' WHERE id=$1",
        [row.id],
      );
      console.error("publish failed", row.id, error);
    }
  }
}

async function consume(queueUrl: string, message: Message) {
  const e = JSON.parse(message.Body || "null");
  if (
    !e ||
    e.schemaVersion !== 1 ||
    !Object.values(events).includes(e.eventType) ||
    typeof e.recipientId !== "string" ||
    !Number.isInteger(e.shipmentVersion) ||
    !e.eventId ||
    !e.shipmentId ||
    !Number.isFinite(Date.parse(e.occurredAt))
  )
    throw Error("Invalid shipment event");
  const rows = await db.query(
    `INSERT INTO notifications(event_id,recipient,shipment_id,event_type,occurred_at)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING event_id`,
    [e.eventId, e.recipientId, e.shipmentId, e.eventType, e.occurredAt],
  );
  console.info(
    JSON.stringify({
      action: rows.length ? "created" : "duplicate",
      eventId: e.eventId,
      shipmentId: e.shipmentId,
      receiveCount: message.Attributes?.ApproximateReceiveCount,
    }),
  );
  await sqs.deleteMessage({
    QueueUrl: queueUrl,
    ReceiptHandle: message.ReceiptHandle,
  });
}

async function loop(job: () => Promise<void>, delay: number) {
  while (true) {
    try {
      await job();
    } catch (error) {
      console.error(error);
      await sleep(1000);
    }
    if (delay) await sleep(delay);
  }
}

async function main() {
  await db.initialize();
  await migrate();
  const { url, dlq } = await queues();
  await Promise.all([
    loop(async () => {
      const [source, dead] = await Promise.all(
        [url, dlq].map((QueueUrl) =>
          sqs.getQueueAttributes({ QueueUrl, AttributeNames: ["All"] }),
        ),
      );
      const attrs = source.Attributes!;
      const sample = {
        waiting: Number(attrs.ApproximateNumberOfMessages),
        processing: Number(attrs.ApproximateNumberOfMessagesNotVisible),
        dead: Number(dead.Attributes!.ApproximateNumberOfMessages),
        visibility: Number(attrs.VisibilityTimeout),
        limit: JSON.parse(attrs.RedrivePolicy!).maxReceiveCount,
        queue: queueName,
        dlq: queueName + "-dlq",
      };
      await db.query(
        `INSERT INTO queue_snapshot(sample,sampled_at) VALUES ($1,now())
        ON CONFLICT(singleton) DO UPDATE SET sample=excluded.sample,sampled_at=excluded.sampled_at`,
        [sample],
      );
    }, 3000),
    loop(() => publish(url), 500),
    loop(async () => {
      const batch = await sqs.receiveMessage({
        QueueUrl: url,
        WaitTimeSeconds: 2,
        MaxNumberOfMessages: 10,
        MessageSystemAttributeNames: ["ApproximateReceiveCount"],
      });
      for (const message of batch.Messages || []) {
        try {
          await consume(url, message);
        } catch (error) {
          console.error(
            "consume failed",
            message.MessageId,
            message.Attributes,
            error,
          );
        }
      }
    }, 0),
  ]);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
