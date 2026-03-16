import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockInvoke, initMockDb } from '../test/setup';
import * as tauri from '@/lib/tauri';

describe('Dashboard Operations', () => {
  beforeEach(() => {
    initMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET Dashboard Stats', () => {
    it('should fetch dashboard statistics', async () => {
      const stats = {
        total_patients: 100,
        today_appointments: 15,
        beds_occupied: 20,
        total_beds: 50,
        today_revenue: 5000,
        monthly_revenue: 50000,
        pending_labs: 5,
        rx_due_refill: 10,
        low_stock_items: 3,
        pending_claims: 2,
        discharges_today: 5,
        new_patients_this_month: 20
      };
      mockInvoke.mockResolvedValue(stats);

      const result = await tauri.getDashboardStats();

      expect(mockInvoke).toHaveBeenCalled();
      expect(result.total_patients).toBe(100);
      expect(result.today_appointments).toBe(15);
    });

    it('should return zero stats when no data', async () => {
      const stats = {
        total_patients: 0,
        today_appointments: 0,
        beds_occupied: 0,
        total_beds: 0,
        today_revenue: 0,
        monthly_revenue: 0,
        pending_labs: 0,
        rx_due_refill: 0,
        low_stock_items: 0,
        pending_claims: 0,
        discharges_today: 0,
        new_patients_this_month: 0
      };
      mockInvoke.mockResolvedValue(stats);

      const result = await tauri.getDashboardStats();

      expect(result.total_patients).toBe(0);
    });

    it('should handle failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'));

      await expect(tauri.getDashboardStats()).rejects.toThrow('Database error');
    });
  });

  describe('GET Recent Activity', () => {
    it('should fetch recent audit logs', async () => {
      const logs = [
        { id: 1, user_name: 'System', action: 'Patient registered', entity: 'patient', entity_id: 1, details: 'John Doe', timestamp: '2024-01-15 10:00:00' },
        { id: 2, user_name: 'System', action: 'Appointment created', entity: 'appointment', entity_id: 1, details: 'John Doe - Dr. Smith', timestamp: '2024-01-15 09:00:00' }
      ];
      mockInvoke.mockResolvedValue(logs);

      const result = await tauri.getRecentActivity();

      expect(mockInvoke).toHaveBeenCalledWith('get_recent_activity', { limit: 20 });
      expect(result).toEqual(logs);
    });

    it('should fetch with custom limit', async () => {
      const logs = [{ id: 1, user_name: 'System', action: 'Patient registered', entity: 'patient', entity_id: 1, details: 'John Doe', timestamp: '2024-01-15 10:00:00' }];
      mockInvoke.mockResolvedValue(logs);

      const result = await tauri.getRecentActivity(5);

      expect(mockInvoke).toHaveBeenCalledWith('get_recent_activity', { limit: 5 });
    });

    it('should return empty array when no logs', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getRecentActivity();

      expect(result).toEqual([]);
    });
  });
});

describe('Settings Operations', () => {
  beforeEach(() => {
    initMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET Setting', () => {
    it('should fetch a setting by key', async () => {
      mockInvoke.mockResolvedValue('true');

      const result = await tauri.getSetting('dark_mode');

      expect(mockInvoke).toHaveBeenCalledWith('get_setting', { key: 'dark_mode' });
      expect(result).toBe('true');
    });

    it('should return null for non-existent key', async () => {
      mockInvoke.mockResolvedValue(null);

      const result = await tauri.getSetting('non_existent');

      expect(result).toBeNull();
    });
  });

  describe('SET Setting', () => {
    it('should set a setting value', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.setSetting('dark_mode', 'true');

      expect(mockInvoke).toHaveBeenCalledWith('set_setting', { key: 'dark_mode', value: 'true' });
    });

    it('should handle set failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Set failed'));

      await expect(tauri.setSetting('key', 'value')).rejects.toThrow('Set failed');
    });
  });

  describe('GET All Settings', () => {
    it('should fetch all settings', async () => {
      const settings = [
        { key: 'dark_mode', value: 'true' },
        { key: 'language', value: 'en' }
      ];
      mockInvoke.mockResolvedValue(settings);

      const result = await tauri.getAllSettings();

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toEqual(settings);
    });
  });

  describe('BACKUP Database', () => {
    it('should backup database', async () => {
      const backupPath = '/path/to/backup.db';
      mockInvoke.mockResolvedValue(backupPath);

      const result = await tauri.backupDatabase();

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toBe(backupPath);
    });

    it('should handle backup failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Backup failed'));

      await expect(tauri.backupDatabase()).rejects.toThrow('Backup failed');
    });
  });
});

describe('Audit Operations', () => {
  beforeEach(() => {
    initMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET Audit Logs', () => {
    it('should fetch audit logs', async () => {
      const logs = [
        { id: 1, user_name: 'System', action: 'Patient registered', entity: 'patient', entity_id: 1, details: 'John Doe', timestamp: '2024-01-15 10:00:00' }
      ];
      mockInvoke.mockResolvedValue(logs);

      const result = await tauri.getAuditLogs();

      expect(mockInvoke).toHaveBeenCalledWith('get_audit_logs', { limit: undefined, entity: undefined });
      expect(result).toEqual(logs);
    });

    it('should filter by limit', async () => {
      const logs = [
        { id: 1, user_name: 'System', action: 'Patient registered', entity: 'patient', entity_id: 1, details: 'John Doe', timestamp: '2024-01-15 10:00:00' }
      ];
      mockInvoke.mockResolvedValue(logs);

      const result = await tauri.getAuditLogs(10);

      expect(mockInvoke).toHaveBeenCalledWith('get_audit_logs', { limit: 10, entity: undefined });
    });

    it('should filter by entity', async () => {
      const logs = [
        { id: 1, user_name: 'System', action: 'Patient registered', entity: 'patient', entity_id: 1, details: 'John Doe', timestamp: '2024-01-15 10:00:00' }
      ];
      mockInvoke.mockResolvedValue(logs);

      const result = await tauri.getAuditLogs(undefined, 'patient');

      expect(mockInvoke).toHaveBeenCalledWith('get_audit_logs', { limit: undefined, entity: 'patient' });
    });
  });
});

describe('Sync Operations', () => {
  beforeEach(() => {
    initMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SYNC to Cloud', () => {
    it('should sync pending changes to cloud', async () => {
      const result = { synced: 10, errors: 0 };
      mockInvoke.mockResolvedValue(result);

      const syncResult = await tauri.syncToCloud();

      expect(mockInvoke).toHaveBeenCalled();
      expect(syncResult.synced).toBe(10);
    });

    it('should handle sync with errors', async () => {
      const result = { synced: 8, errors: 2 };
      mockInvoke.mockResolvedValue(result);

      const syncResult = await tauri.syncToCloud();

      expect(syncResult.errors).toBe(2);
    });

    it('should handle sync failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Sync failed'));

      await expect(tauri.syncToCloud()).rejects.toThrow('Sync failed');
    });
  });

  describe('GET Sync Status', () => {
    it('should get sync status', async () => {
      const status = { last_sync: '2024-01-15 10:00:00', pending: 5 };
      mockInvoke.mockResolvedValue(status);

      const result = await tauri.getSyncStatus();

      expect(mockInvoke).toHaveBeenCalled();
      expect(result.pending).toBe(5);
    });
  });
});