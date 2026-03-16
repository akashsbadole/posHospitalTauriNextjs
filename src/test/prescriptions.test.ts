import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockInvoke, initMockDb, getMockDb, testPrescriptionData, testPrescriptionDrugs } from '../test/setup';
import * as tauri from '@/lib/tauri';

describe('Prescription CRUD Operations', () => {
  beforeEach(() => {
    initMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET Prescriptions', () => {
    it('should fetch all prescriptions', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.prescriptions);

      const result = await tauri.getPrescriptions();

      expect(mockInvoke).toHaveBeenCalledWith('get_prescriptions', expect.objectContaining({}));
      expect(result).toEqual(db.prescriptions);
    });

    it('should filter prescriptions by patient ID', async () => {
      const db = getMockDb();
      const filteredPrescriptions = db.prescriptions.filter(p => p.patient_id === 1);
      mockInvoke.mockResolvedValue(filteredPrescriptions);

      const result = await tauri.getPrescriptions(1);

      expect(mockInvoke).toHaveBeenCalledWith('get_prescriptions', { patient_id: 1 });
      expect(result).toEqual(filteredPrescriptions);
    });

    it('should return empty array when no prescriptions found', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getPrescriptions(999);

      expect(result).toEqual([]);
    });
  });

  describe('GET Prescription by ID', () => {
    it('should fetch a single prescription by ID', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.prescriptions[0]);

      const result = await tauri.getPrescriptionById(1);

      expect(mockInvoke).toHaveBeenCalledWith('get_prescription_by_id', { id: 1 });
      expect(result).toEqual(db.prescriptions[0]);
    });

    it('should handle non-existent prescription', async () => {
      mockInvoke.mockRejectedValue(new Error('Prescription not found'));

      await expect(tauri.getPrescriptionById(999)).rejects.toThrow('Prescription not found');
    });
  });

  describe('CREATE Prescription', () => {
    it('should create a new prescription with drugs', async () => {
      const newPrescription = { 
        ...testPrescriptionData, 
        id: 2, 
        rx_code: 'RX-NEW1234', 
        created_at: '2024-01-20',
        drugs: testPrescriptionDrugs
      };
      mockInvoke.mockResolvedValue(newPrescription);

      const result = await tauri.createPrescription(testPrescriptionData, testPrescriptionDrugs);

      expect(mockInvoke).toHaveBeenCalledWith('create_prescription', expect.objectContaining({}));
      expect(result).toHaveProperty('id');
      expect(result.rx_code).toBeDefined();
    });

    it('should handle create failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'));

      await expect(tauri.createPrescription(testPrescriptionData, testPrescriptionDrugs))
        .rejects.toThrow('Database error');
    });

    it('should create prescription without drugs', async () => {
      const newPrescription = { 
        ...testPrescriptionData, 
        id: 2, 
        rx_code: 'RX-NEW1234', 
        created_at: '2024-01-20',
        drugs: []
      };
      mockInvoke.mockResolvedValue(newPrescription);

      const result = await tauri.createPrescription(testPrescriptionData, []);

      expect(result.drugs).toEqual([]);
    });
  });

  describe('CANCEL Prescription', () => {
    it('should cancel a prescription', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.cancelPrescription(1);

      expect(mockInvoke).toHaveBeenCalledWith('cancel_prescription', { id: 1 });
    });

    it('should handle cancel failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Cancel failed'));

      await expect(tauri.cancelPrescription(1)).rejects.toThrow('Cancel failed');
    });
  });

  describe('REFILL Prescription', () => {
    it('should refill a prescription drug', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.refillPrescription(1, 1);

      expect(mockInvoke).toHaveBeenCalledWith('refill_prescription', { id: 1, drug_id: 1 });
    });

    it('should handle refill failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Refill failed'));

      await expect(tauri.refillPrescription(1, 1)).rejects.toThrow('Refill failed');
    });
  });

  describe('GET Due Refill Prescriptions', () => {
    it('should fetch prescriptions due for refill', async () => {
      const dueRefill = [
        { id: 1, rx_code: 'RX-11111111', patient_id: 1, status: 'Active' }
      ];
      mockInvoke.mockResolvedValue(dueRefill);

      const result = await tauri.getDueRefillRx();

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toEqual(dueRefill);
    });

    it('should return empty when no prescriptions due for refill', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getDueRefillRx();

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});