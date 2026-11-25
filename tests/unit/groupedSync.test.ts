import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatChangeSnapshotFilename,
  formatFullBackupFilename,
  shouldTriggerFullBackup,
  GROUPED_BACKUPS_FOLDER_NAME,
  MAX_CHANGE_HISTORY_RETENTION,
  FULL_BACKUP_CHANGE_THRESHOLD,
} from '../../src/lib/googleDriveService';
import { db, DBEntityChangeEvent } from '../../src/db/client';
import { Tenant } from '../../src/db/schema';

describe('Smart Grouped Sync', () => {
  beforeEach(async () => {
    await db.wipeAllDataAsync();
  });

  it('uses expected retention and folder constants', () => {
    expect(GROUPED_BACKUPS_FOLDER_NAME).toBe('RentFlow Grouped Backups');
    expect(MAX_CHANGE_HISTORY_RETENTION).toBe(20);
    expect(FULL_BACKUP_CHANGE_THRESHOLD).toBe(10);
  });

  it('formats encrypted change snapshot filename matching [entity]_[action]_[timestamp].enc', () => {
    const sampleDate = new Date(Date.UTC(2026, 10, 24, 14, 30, 0));
    expect(formatChangeSnapshotFilename('tenant', 'add', sampleDate)).toBe(
      'tenant_add_2026-11-24_1430.enc'
    );
    expect(formatChangeSnapshotFilename('lease', 'edit', sampleDate)).toBe(
      'lease_edit_2026-11-24_1430.enc'
    );
    expect(formatChangeSnapshotFilename('property', 'delete', sampleDate)).toBe(
      'property_delete_2026-11-24_1430.enc'
    );
  });

  it('formats full session backup filename matching FULL_BACKUP_YYYY-MM-DD.enc', () => {
    const sampleDate = new Date(Date.UTC(2026, 10, 24, 14, 30, 0));
    expect(formatFullBackupFilename(sampleDate)).toBe('FULL_BACKUP_2026-11-24.enc');
  });

  it('triggers full backup after 10 small changes or 24 hours', () => {
    const now = Date.UTC(2026, 10, 25, 12, 0, 0);
    const recentIso = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const staleIso = new Date(now - 24 * 60 * 60 * 1000 - 1000).toISOString();

    expect(shouldTriggerFullBackup(3, recentIso, now)).toBe(false);
    expect(shouldTriggerFullBackup(10, recentIso, now)).toBe(true);
    expect(shouldTriggerFullBackup(1, staleIso, now)).toBe(true);
    expect(shouldTriggerFullBackup(0, null, now)).toBe(true);
  });

  it('emits structured entity change events for add, edit, and delete with accurate before snapshots', () => {
    const events: DBEntityChangeEvent[] = [];
    const unsubscribe = db.onEntityChange((evt) => events.push(evt));

    try {
      db.insertItem<Tenant>('tenants', {
        id: 'ten_grp_1',
        org_id: 'org_1',
        name: 'Amina Tariq',
        phone: '+92 300 1112233',
        email: 'amina@example.com',
        id_type: 'CNIC',
        id_number: '35202-1112233-4',
      });

      db.updateItem<Tenant>('tenants', 'ten_grp_1', {
        phone: '+92 300 9998877',
      });

      db.softDeleteItem('tenants', 'ten_grp_1');

      expect(events).toHaveLength(3);
      expect(events[0].entity).toBe('tenant');
      expect(events[0].action).toBe('add');
      expect(events[0].recordId).toBe('ten_grp_1');
      expect(events[0].before).toBeNull();
      expect(events[0].after?.name).toBe('Amina Tariq');

      expect(events[1].action).toBe('edit');
      expect(events[1].before?.phone).toBe('+92 300 1112233');
      expect(events[1].after?.phone).toBe('+92 300 9998877');

      expect(events[2].action).toBe('delete');
      expect(events[2].before?.name).toBe('Amina Tariq');
      expect(events[2].after?.deleted_at).toBeTypeOf('number');
    } finally {
      unsubscribe();
    }
  });
});
