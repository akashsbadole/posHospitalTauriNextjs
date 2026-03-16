import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockInvoke, initMockDb, getMockDb, testWardData } from '../test/setup';
import * as tauri from '@/lib/tauri';

describe('Ward & Bed CRUD Operations', () => {
  beforeEach(() => {
    initMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET Wards', () => {
    it('should fetch all wards', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.wards);

      const result = await tauri.getWards();

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toEqual(db.wards);
    });

    it('should return empty array when no wards found', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getWards();

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('GET Beds', () => {
    it('should fetch all beds', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.beds);

      const result = await tauri.getBeds();

      expect(mockInvoke).toHaveBeenCalledWith('get_beds', expect.objectContaining({}));
      expect(result).toEqual(db.beds);
    });

    it('should filter beds by ward ID', async () => {
      const db = getMockDb();
      const filteredBeds = db.beds.filter(b => b.ward_id === 1);
      mockInvoke.mockResolvedValue(filteredBeds);

      const result = await tauri.getBeds(1);

      expect(mockInvoke).toHaveBeenCalledWith('get_beds', { ward_id: 1 });
      expect(result.every(b => b.ward_id === 1)).toBe(true);
    });

    it('should return empty array when no beds found', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getBeds(999);

      expect(result).toEqual([]);
    });
  });

  describe('CREATE Ward', () => {
    it('should create a new ward', async () => {
      const newWard = { 
        ...testWardData, 
        id: 3, 
        ward_code: 'WD-NEW1234',
        status: 'Active',
        created_at: '2024-01-20'
      };
      mockInvoke.mockResolvedValue(newWard);

      const result = await tauri.createWard(testWardData);

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
      expect(result.ward_code).toBeDefined();
    });

    it('should handle create failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'));

      await expect(tauri.createWard(testWardData)).rejects.toThrow('Database error');
    });
  });

  describe('CREATE Ward With Beds', () => {
    it('should create a new ward with beds', async () => {
      const wardWithBeds = { 
        ...testWardData, 
        id: 3, 
        ward_code: 'WD-NEW1234',
        total_beds: 5,
        created_at: '2024-01-20'
      };
      mockInvoke.mockResolvedValue(wardWithBeds);

      const result = await tauri.createWardWithBeds(testWardData);

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
    });
  });

  describe('ADMIT Patient', () => {
    it('should admit a patient to a bed', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.admitPatient(1, 1, '2024-01-20');

      expect(mockInvoke).toHaveBeenCalledWith('admit_patient', expect.objectContaining({ 
        bed_id: 1, 
        patient_id: 1, 
        expected_discharge: '2024-01-20' 
      }));
    });

    it('should admit patient without expected discharge date', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.admitPatient(1, 1);

      expect(mockInvoke).toHaveBeenCalledWith('admit_patient', expect.objectContaining({ 
        bed_id: 1, 
        patient_id: 1, 
      }));
    });

    it('should handle admission failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Bed not available'));

      await expect(tauri.admitPatient(1, 1)).rejects.toThrow('Bed not available');
    });
  });

  describe('DISCHARGE Patient', () => {
    it('should discharge a patient from a bed', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.dischargePatient(1);

      expect(mockInvoke).toHaveBeenCalledWith('discharge_patient', { bed_id: 1 });
    });

    it('should handle discharge failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Discharge failed'));

      await expect(tauri.dischargePatient(1)).rejects.toThrow('Discharge failed');
    });
  });

  describe('TRANSFER Patient', () => {
    it('should transfer a patient between beds', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.transferPatient(1, 2);

      expect(mockInvoke).toHaveBeenCalledWith('transfer_patient', { from_bed_id: 1, to_bed_id: 2 });
    });

    it('should handle transfer failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Transfer failed'));

      await expect(tauri.transferPatient(1, 2)).rejects.toThrow('Transfer failed');
    });
  });

  describe('UPDATE Bed Status', () => {
    it('should update bed status to Available', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.updateBedStatus(1, 'Available');

      expect(mockInvoke).toHaveBeenCalledWith('update_bed_status', { bed_id: 1, status: 'Available' });
    });

    it('should update bed status to Reserved', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.updateBedStatus(1, 'Reserved');

      expect(mockInvoke).toHaveBeenCalledWith('update_bed_status', { bed_id: 1, status: 'Reserved' });
    });

    it('should handle update failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'));

      await expect(tauri.updateBedStatus(1, 'Available')).rejects.toThrow('Update failed');
    });
  });
});