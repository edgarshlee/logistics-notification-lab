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

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 장애 실험실 스위치: none | consume | publish
async function fault() {
  const [row] = await db.query("SELECT value FROM lab_settings WHERE key='fault'");
  return row?.value || "none";
}
async function logConsume(eventId: unknown, action: string, message: Message, error?: unknown) {
  await db.query(
    "INSERT INTO consume_log(event_id,action,receive_count,error) VALUES ($1,$2,$3,$4)",
    [
      typeof eventId === "string" && uuid.test(eventId) ? eventId : null,
      action,
      Number(message.Attributes?.ApproximateReceiveCount) || null,
      error instanceof Error ? error.message.slice(0, 200) : null,
    ],
  );
}

async function publish(queueUrl: string) {
  const rows = await db.query(
    "SELECT id,payload FROM outbox WHERE published_at IS NULL AND next_attempt <= now() ORDER BY next_attempt LIMIT 20",
  );
  const failing = rows.length > 0 && (await fault()) === "publish";
  for (const row of rows) {
    try {
      if (failing) throw Error("장애 주입: SQS 발행 실패");
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

async function consume(queueUrl: string, message: Message, failing: boolean) {
  const e = JSON.parse(message.Body || "null");
  // 삭제하지 않은 메시지는 가시성 타임아웃 뒤 다시 수신되고, 3회째 실패하면 SQS가 DLQ로 옮긴다.
  if (failing) throw Error("장애 주입: 알림 저장 실패");
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
    `INSERT INTO notifications(event_id,recipient,shipment_id,event_type,occurred_at,detail)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING event_id`,
    [
      e.eventId,
      e.recipientId,
      e.shipmentId,
      e.eventType,
      e.occurredAt,
      typeof e.reason === "string" ? e.reason.slice(0, 100) : null,
    ],
  );
  await logConsume(e.eventId, rows.length ? "created" : "duplicate", message);
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

// DLQ를 VisibilityTimeout 0으로 엿봐 화면용 목록을 맞춘다. 메시지는 그대로 남는다.
async function peekDlq(dlq: string) {
  const peek = await sqs.receiveMessage({ QueueUrl: dlq, MaxNumberOfMessages: 10, VisibilityTimeout: 0 });
  const found = new Map<string, unknown>();
  for (const m of peek.Messages || []) {
    try {
      const e = JSON.parse(m.Body || "null");
      if (uuid.test(e?.eventId)) found.set(e.eventId, e);
    } catch {}
  }
  await db.transaction(async (tx) => {
    await tx.query("DELETE FROM dlq_messages WHERE NOT (event_id = ANY($1::uuid[]))", [[...found.keys()]]);
    for (const [id, body] of found)
      await tx.query("INSERT INTO dlq_messages(event_id,body) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, body]);
  });
  await db.query("DELETE FROM consume_log WHERE id <= (SELECT max(id) - 500 FROM consume_log)");
}

// 화면에서 요청한 재처리(replay)·중복 전달(duplicate)을 수행한다. 이벤트 ID는 그대로 유지한다.
async function runCommands(url: string, dlq: string) {
  const commands = await db.query(
    "SELECT id,kind,event_id FROM lab_commands WHERE done_at IS NULL ORDER BY id LIMIT 5",
  );
  for (const c of commands) {
    let error: string | null = null;
    try {
      if (c.kind === "duplicate") {
        const [row] = await db.query("SELECT payload FROM outbox WHERE id=$1", [c.event_id]);
        if (!row) throw Error("아웃박스에 없는 이벤트입니다.");
        await sqs.sendMessage({ QueueUrl: url, MessageBody: JSON.stringify(row.payload) });
      } else {
        const batch = await sqs.receiveMessage({ QueueUrl: dlq, MaxNumberOfMessages: 10, VisibilityTimeout: 5 });
        let target: Message | undefined;
        for (const m of batch.Messages || []) {
          let id;
          try {
            id = JSON.parse(m.Body || "null")?.eventId;
          } catch {}
          if (!target && id === c.event_id) target = m;
          else await sqs.changeMessageVisibility({ QueueUrl: dlq, ReceiptHandle: m.ReceiptHandle, VisibilityTimeout: 0 });
        }
        if (!target) throw Error("DLQ에서 메시지를 찾지 못했습니다. 잠시 뒤 다시 시도하세요.");
        await sqs.sendMessage({ QueueUrl: url, MessageBody: target.Body! });
        await sqs.deleteMessage({ QueueUrl: dlq, ReceiptHandle: target.ReceiptHandle });
        await db.query("DELETE FROM dlq_messages WHERE event_id=$1", [c.event_id]);
        await db.query(
          `INSERT INTO dlq_replays(event_id,replayed_at) VALUES ($1,now())
          ON CONFLICT (event_id) DO UPDATE SET replayed_at=now()`,
          [c.event_id],
        );
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await db.query("UPDATE lab_commands SET done_at=now(),error=$2 WHERE id=$1", [c.id, error]);
  }
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
      await peekDlq(dlq);
    }, 3000),
    loop(() => publish(url), 500),
    loop(() => runCommands(url, dlq), 1000),
    loop(async () => {
      const batch = await sqs.receiveMessage({
        QueueUrl: url,
        WaitTimeSeconds: 2,
        MaxNumberOfMessages: 10,
        MessageSystemAttributeNames: ["ApproximateReceiveCount"],
      });
      const failing = !!batch.Messages?.length && (await fault()) === "consume";
      for (const message of batch.Messages || []) {
        try {
          await consume(url, message, failing);
        } catch (error) {
          let eventId;
          try {
            eventId = JSON.parse(message.Body || "null")?.eventId;
          } catch {}
          await logConsume(eventId, "failed", message, error).catch(() => {});
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
