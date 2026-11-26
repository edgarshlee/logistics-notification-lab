import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { db, events, migrate, transitions } from "./db";

@Controller("api")
class LogisticsController {
  @Get("shipments")
  list(@Query("q") q?: string) {
    // 도착지 부분 일치 또는 운송 번호(UUID) 앞자리 일치. LIKE 특수문자는 그대로 검색한다.
    const term = (typeof q === "string" ? q.trim() : "").slice(0, 100);
    const pattern = term.replace(/[\\%_]/g, "\\$&");
    return db.query(
      `SELECT s.*, h.occurred_at AS updated_at FROM shipments s
      JOIN LATERAL (SELECT occurred_at FROM history WHERE shipment_id=s.id
        ORDER BY version DESC LIMIT 1) h ON true
      WHERE $1 = '' OR s.destination ILIKE '%' || $2 || '%' OR s.id::text LIKE lower($2) || '%'
      ORDER BY s.created_at DESC`,
      [term, pattern],
    );
  }

  @Get("shipments/:id")
  async detail(@Param("id", ParseUUIDPipe) id: string) {
    const [[shipment], history] = await Promise.all([
      db.query("SELECT * FROM shipments WHERE id=$1", [id]),
      // 각 상태 버전이 만든 아웃박스 이벤트와 그 이벤트로 저장된 알림을 함께 조회해 추적 타임라인을 만든다.
      db.query(
        `SELECT h.version,h.status,h.note,h.occurred_at,
          o.id AS event_id,o.payload->>'eventType' AS event_type,o.published_at,o.attempts,o.next_attempt,
          n.stored_at,n.read_at
        FROM history h
        LEFT JOIN outbox o ON (o.payload->>'shipmentId')::uuid=h.shipment_id
          AND (o.payload->>'shipmentVersion')::int=h.version
        LEFT JOIN notifications n ON n.event_id=o.id AND n.recipient=o.payload->>'recipientId'
        WHERE h.shipment_id=$1 ORDER BY h.version`,
        [id],
      ),
    ]);
    if (!shipment) throw new NotFoundException();
    return { shipment, history };
  }

  @Post("shipments")
  create(@Body("destination") destination: unknown) {
    if (
      typeof destination !== "string" ||
      !destination.trim() ||
      destination.trim().length > 100
    )
      throw new BadRequestException("도착지를 1~100자로 입력하세요.");
    return db.transaction(async (tx) => {
      const [shipment] = await tx.query(
        "INSERT INTO shipments(destination) VALUES ($1) RETURNING *",
        [destination.trim()],
      );
      await tx.query(
        "INSERT INTO history(shipment_id,version,status) VALUES ($1,1,$2)",
        [shipment.id, shipment.status],
      );
      return shipment;
    });
  }

  @Patch("shipments/:id")
  change(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: { status: string; version: number; reason?: unknown },
  ) {
    let reason: string | null = null;
    if (input.status === "exception") {
      if (
        typeof input.reason !== "string" ||
        !input.reason.trim() ||
        input.reason.trim().length > 100
      )
        throw new BadRequestException("예외 사유를 1~100자로 입력하세요.");
      reason = input.reason.trim();
    }
    return db.transaction(async (tx) => {
      const [current] = await tx.query(
        "SELECT * FROM shipments WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!current) throw new NotFoundException();
      if (input.version !== current.version)
        throw new ConflictException(
          "배송 정보가 갱신되었습니다. 최신 상태에서 다시 시도하세요.",
        );
      if (!transitions[current.status].includes(input.status))
        throw new BadRequestException("허용되지 않는 상태 변경입니다.");
      const version = current.version + 1;
      await tx.query("UPDATE shipments SET status=$2,version=$3 WHERE id=$1", [
        id,
        input.status,
        version,
      ]);
      const [row] = await tx.query(
        "INSERT INTO history(shipment_id,version,status,note) VALUES ($1,$2,$3,$4) RETURNING occurred_at",
        [id, version, input.status, reason],
      );
      if (current.status !== "exception") {
        const eventId = randomUUID();
        const event = {
          eventId,
          shipmentId: id,
          recipientId: current.recipient,
          schemaVersion: 1,
          shipmentVersion: version,
          eventType: events[input.status],
          occurredAt: row.occurred_at,
          // 선택 필드: schemaVersion 1 소비자는 알 수 없는 필드를 무시한다.
          ...(reason && { reason }),
        };
        await tx.query("INSERT INTO outbox(id,payload) VALUES ($1,$2)", [
          eventId,
          event,
        ]);
      }
      return { ...current, status: input.status, version };
    });
  }

  @Get("operations")
  async operations() {
    const [snapshot, events, replays] = await Promise.all([
      db.query("SELECT sample,sampled_at FROM queue_snapshot"),
      db.query(`SELECT o.id,s.destination,o.payload->>'eventType' AS type,o.published_at,
        n.event_id IS NOT NULL AS stored,n.stored_at FROM outbox o
        JOIN shipments s ON s.id=(o.payload->>'shipmentId')::uuid
        LEFT JOIN notifications n ON n.event_id=o.id AND n.recipient=o.payload->>'recipientId'
        ORDER BY (o.payload->>'occurredAt')::timestamptz DESC LIMIT 15`),
      db.query("SELECT * FROM dlq_replays ORDER BY observed_at DESC LIMIT 5"),
    ]);
    return { snapshot: snapshot[0] || null, events, replays };
  }

  @Get("summary")
  async summary() {
    const [row] = await db.query(`SELECT
      (SELECT count(*)::int FROM notifications WHERE recipient='demo' AND read_at IS NULL) AS unread,
      (SELECT count(*)::int FROM outbox WHERE published_at IS NULL) AS pending_outbox,
      q.sample, q.sampled_at, extract(epoch FROM now()-q.sampled_at)::float8 AS sample_age
      FROM (SELECT 1) one LEFT JOIN queue_snapshot q ON true`);
    return {
      unread: row.unread,
      pendingOutbox: row.pending_outbox,
      queue: row.sample,
      sampledAt: row.sampled_at,
      sampleAge: row.sample_age,
    };
  }

  @Get("notifications")
  inbox() {
    return db.query(
      "SELECT n.*,s.destination FROM notifications n JOIN shipments s ON s.id=n.shipment_id WHERE n.recipient='demo' ORDER BY occurred_at DESC,event_id",
    );
  }

  @Patch("notifications/:id/read")
  async read(@Param("id", ParseUUIDPipe) id: string) {
    const result = await db.query(
      "UPDATE notifications SET read_at=coalesce(read_at,now()) WHERE event_id=$1 AND recipient='demo' RETURNING event_id",
      [id],
    );
    if (!result[1]) throw new NotFoundException();
    return { read: true };
  }
}
@Module({ controllers: [LogisticsController] })
class AppModule {}
async function main() {
  await db.initialize();
  await migrate();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(__dirname, "public"));
  await app.listen(3000, "0.0.0.0");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  process.exit(1);
});
