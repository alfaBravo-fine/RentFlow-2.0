import { db } from '../db/client';
import { SyncQueueItem } from '../db/schema';
import { encryptData, decryptData, EncryptedPayload } from './crypto';

export interface SyncStatus {
  lastSyncAt: number | null;
  pendingCount: number;
  isSyncing: boolean;
  error: string | null;
}

class SyncEngine {
  private passphrase = 'rentflow_local_master_key';

  public getPendingCount(): number {
    try {
      const queue = db.getRawTable<SyncQueueItem>('sync_queue');
      return queue.filter((item) => !item.synced).length;
    } catch {
      return 0;
    }
  }

  public async exportEncryptedSnapshot(): Promise<EncryptedPayload> {
    await db.flush();
    const backupData = db.exportAllData();

    const payloadString = JSON.stringify({
      version: 1,
      timestamp: Date.now(),
      data: backupData,
    });

    return encryptData(payloadString, this.passphrase);
  }

  public async importEncryptedSnapshot(payload: EncryptedPayload): Promise<boolean> {
    try {
      const decryptedString = await decryptData(payload, this.passphrase);
      const parsed = JSON.parse(decryptedString);

      if (!parsed.data || typeof parsed.data !== 'object') {
        throw new Error('Invalid backup file payload');
      }

      await db.importAllDataAsync(parsed.data);
      return true;
    } catch (e) {
      console.error('Failed to import backup snapshot:', e);
      throw e;
    }
  }

  public markQueueSynced() {
    try {
      db.markSyncQueueSynced();
    } catch (e) {
      console.error('Error marking queue synced', e);
    }
  }
}

export const syncEngine = new SyncEngine();
