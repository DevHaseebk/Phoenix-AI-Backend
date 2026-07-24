import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto';

export interface RecordAuditLogEntryParams {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  /** Any JSON-serializable value - kept loose (rather than
   * Prisma.InputJsonValue) so callers can pass plain interfaces/DTOs
   * without fighting InputJsonObject's index-signature requirement. */
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntryItem {
  id: string;
  adminUserId: string;
  adminUserEmail: string | null;
  adminUserName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}

/**
 * Single write path for every admin-mutating endpoint's audit trail - the
 * point of centralizing here is that no controller/service anywhere else
 * calls `prisma.auditLogEntry.create()` directly, so the shape (and any
 * future cross-cutting concern, e.g. redacting a metadata field) only needs
 * to change in one place. Callers pass adminUserId (from @CurrentUser(),
 * never inferred) plus whatever before/after metadata is cheaply available
 * at their call site - see docs/16_Claude_Code_Handover.md for why this is
 * a per-endpoint call rather than a fully generic interceptor.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordAuditLogEntryParams): Promise<void> {
    await this.prisma.auditLogEntry.create({
      data: {
        adminUserId: params.adminUserId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        metadata: (params.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }

  async list(query: ListAuditLogQueryDto): Promise<{
    items: AuditLogEntryItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.AuditLogEntryWhereInput = {
      ...(query.adminUserId ? { adminUserId: query.adminUserId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [entries, total] = await Promise.all([
      this.prisma.auditLogEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          adminUser: { select: { email: true, fullName: true } },
        },
      }),
      this.prisma.auditLogEntry.count({ where }),
    ]);

    return {
      items: entries.map((entry) => ({
        id: entry.id,
        adminUserId: entry.adminUserId,
        adminUserEmail: entry.adminUser?.email ?? null,
        adminUserName: entry.adminUser?.fullName ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
      })),
      total,
      page,
      limit,
    };
  }
}
