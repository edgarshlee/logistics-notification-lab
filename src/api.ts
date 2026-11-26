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
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { db, events, migrate, transitions } from "./db";

@Controller("api")
class LogisticsController {
  @Get("shipments")
  list() {
    return db.query("SELECT * FROM shipments ORDER BY created_at DESC");
  }

  @Get("shipments/:id")
  async detail(@Param("id", ParseUUIDPipe) id: string) {
    const history = await db.query(
      "SELECT version,status,occurred_at FROM history WHERE shipment_id=$1 ORDER BY version",
      [id],
    );
    if (!history.length) throw new NotFoundException();
    return history;
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
    @Body() input: { status: string; version: number },
  ) {
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
        "INSERT INTO history(shipment_id,version,status) VALUES ($1,$2,$3) RETURNING occurred_at",
        [id, version, input.status],
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
