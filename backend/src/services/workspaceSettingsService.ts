import { eq } from 'drizzle-orm';
import { db, workspace_settings } from '../db';

export interface StatusConfig {
  value: string;
  label: string;
  color: string;
  requiresReason?: boolean;
}

export const DEFAULT_STATUSES: StatusConfig[] = [
  { value: 'on_track',  label: 'On Track',   color: 'var(--ink)',    requiresReason: false },
  { value: 'delayed',   label: 'Delayed',     color: '#C47B2A',      requiresReason: true  },
  { value: 'finished',  label: 'Finished',    color: 'var(--ink)',   requiresReason: false },
  { value: 'cancelled', label: 'Cancelled',   color: 'var(--faint)', requiresReason: false },
];

export async function getWorkspaceSettings(workspaceId: string): Promise<{ task_update_statuses: StatusConfig[] }> {
  const row = await db.query.workspace_settings.findFirst({
    where: eq(workspace_settings.workspace_id, workspaceId),
  });
  if (!row || !row.task_update_statuses || row.task_update_statuses === '[]') {
    return { task_update_statuses: DEFAULT_STATUSES };
  }
  try {
    const parsed = JSON.parse(row.task_update_statuses) as StatusConfig[];
    return { task_update_statuses: parsed.length > 0 ? parsed : DEFAULT_STATUSES };
  } catch {
    return { task_update_statuses: DEFAULT_STATUSES };
  }
}

export async function upsertWorkspaceSettings(workspaceId: string, statuses: StatusConfig[]): Promise<void> {
  await db.insert(workspace_settings)
    .values({ workspace_id: workspaceId, task_update_statuses: JSON.stringify(statuses) })
    .onConflictDoUpdate({
      target: workspace_settings.workspace_id,
      set: { task_update_statuses: JSON.stringify(statuses), updated_at: new Date() },
    });
}
