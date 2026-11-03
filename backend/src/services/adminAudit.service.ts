import { AdminAuditModel, type AdminAuditAction } from '../models';

/**
 * Best-effort writer for the admin audit trail.
 *
 * An audit write must NEVER break the admin action it records: the action on
 * the real resource has already succeeded when this runs, so any failure here
 * is logged and swallowed. Callers fire it after the mutation, not before.
 */
export async function recordAdminAction(row: {
  adminId: string;
  action: AdminAuditAction;
  targetType: string;
  targetId: string;
  detail?: string | null;
}): Promise<void> {
  try {
    await AdminAuditModel.create({
      admin: row.adminId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      detail: row.detail?.slice(0, 500) ?? null,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[audit] FAILED to record ${row.action} by ${row.adminId} on ${row.targetType}/${row.targetId}:`,
      (error as Error).message,
    );
  }
}
