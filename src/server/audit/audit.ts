import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

/** Append-only. Pass a transaction client so the audit row commits atomically with the change. */
export async function writeAudit(db: Db, e: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: { actorId: e.actorId ?? null, action: e.action, entityType: e.entityType, entityId: e.entityId, metadata: e.metadata },
  });
}
