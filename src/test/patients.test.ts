import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockInvoke, initMockDb, getMockDb, testPatientData } from '../test/setup';
import * as tauri from '@/lib/tauri';

describe('Patient CRUD Operations', () => {
  beforeEach(() => {
    initMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET Patients', () => {
    it('should fetch all patients', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.patients);

      const result = await tauri.getPatients();

      expect(mockInvoke).toHaveBeenCalledWith('get_patients', { search: undefined, status: undefined });
      expect(result).toEqual(db.patients);
    });

    it('should filter patients by search query', async () => {
      mockInvoke.mockResolvedValue([getMockDb().patients[0]]);

      const result = await tauri.getPatients('John');

      expect(mockInvoke).toHaveBeenCalledWith('get_patients', { search: 'John', status: undefined });
      expect(result).toHaveLength(1);
    });

    it('should filter patients by status', async () => {
      mockInvoke.mockResolvedValue(getMockDb().patients.filter(p => p.status === 'Active'));

      const result = await tauri.getPatients(undefined, 'Active');

      expect(mockInvoke).toHaveBeenCalledWith('get_patients', { search: undefined, status: 'Active' });
      expect(result.every(p => p.status === 'Active')).toBe(true);
    });

    it('should return empty array when no patients found', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getPatients('NonExistent');

      expect(result).toEqual([]);
    });
  });

  describe('GET Patient by ID', () => {
    it('should fetch a single patient by ID', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.patients[0]);

      const result = await tauri.getPatientById(1);

      expect(mockInvoke).toHaveBeenCalledWith('get_patient_by_id', { id: 1 });
      expect(result).toEqual(db.patients[0]);
    });

    it('should handle non-existent patient', async () => {
      mockInvoke.mockRejectedValue(new Error('Patient not found'));

      await expect(tauri.getPatientById(999)).rejects.toThrow('Patient not found');
    });
  });

  describe('CREATE Patient', () => {
    it('should create a new patient with valid data', async () => {
      const newPatient = { ...testPatientData, id: 3, patient_code: 'PT-NEW1234', created_at: '2024-01-20' };
      mockInvoke.mockResolvedValue(newPatient);

      const result = await tauri.createPatient(testPatientData);

      expect(mockInvoke).toHaveBeenCalledWith('create_patient', { data: testPatientData });
      expect(result).toHaveProperty('id');
      expect(result.full_name).toBe(testPatientData.full_name);
    });

    it('should create patient with default status when not provided', async () => {
      const { status, ...dataWithoutStatus } = testPatientData;
      const newPatient = { ...dataWithoutStatus, id: 3, patient_code: 'PT-NEW1234', status: 'OPD', created_at: '2024-01-20' };
      mockInvoke.mockResolvedValue(newPatient);

      const result = await tauri.createPatient(dataWithoutStatus as typeof testPatientData);

      expect(result.status).toBe('OPD');
    });

    it('should handle create failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'));

      await expect(tauri.createPatient(testPatientData)).rejects.toThrow('Database error');
    });
  });

  describe('UPDATE Patient', () => {
    it('should update patient name', async () => {
      const updatedPatient = { ...getMockDb().patients[0], full_name: 'Updated Name' };
      mockInvoke.mockResolvedValue(updatedPatient);

      const result = await tauri.updatePatient(1, { full_name: 'Updated Name' });

      expect(mockInvoke).toHaveBeenCalledWith('update_patient', { id: 1, data: { full_name: 'Updated Name' } });
      expect(result.full_name).toBe('Updated Name');
    });

    it('should update patient status', async () => {
      const updatedPatient = { ...getMockDb().patients[0], status: 'Admitted' };
      mockInvoke.mockResolvedValue(updatedPatient);

      const result = await tauri.updatePatient(1, { status: 'Admitted' });

      expect(result.status).toBe('Admitted');
    });

    it('should handle update failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'));

      await expect(tauri.updatePatient(1, { status: 'Active' })).rejects.toThrow('Update failed');
    });
  });

  describe('DELETE Patient', () => {
    it('should delete a patient successfully', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.deletePatient(1);

      expect(mockInvoke).toHaveBeenCalledWith('delete_patient', { id: 1 });
    });

    it('should handle delete failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Delete failed'));

      await expect(tauri.deletePatient(1)).rejects.toThrow('Delete failed');
    });

    it('should handle non-existent patient deletion', async () => {
      mockInvoke.mockRejectedValue(new Error('Patient not found'));

      await expect(tauri.deletePatient(999)).rejects.toThrow('Patient not found');
    });
  });

  describe('Patient Vitals', () => {
    it('should fetch patient vitals', async () => {
      const vitals = [
        { id: 1, patient_id: 1, blood_pressure_sys: 120, blood_pressure_dia: 80, heart_rate: 72, temperature: 98.6, spo2: 98, recorded_at: '2024-01-15' }
      ];
      mockInvoke.mockResolvedValue(vitals);

      const result = await tauri.getPatientVitals(1);

      expect(mockInvoke).toHaveBeenCalledWith('get_patient_vitals', { patient_id: 1 });
      expect(result).toEqual(vitals);
    });

    it('should add new vital signs', async () => {
      const newVital = { id: 2, patient_id: 1, blood_pressure_sys: 118, blood_pressure_dia: 78, heart_rate: 70, temperature: 98.4, spo2: 99 };
      mockInvoke.mockResolvedValue(newVital);

      const result = await tauri.addVitalSigns({
        patient_id: 1,
        recorded_by: 'Nurse Joy',
        blood_pressure_sys: 118,
        blood_pressure_dia: 78,
        heart_rate: 70,
        temperature: 98.4,
        spo2: 99,
      });

      expect(result).toHaveProperty('id');
    });
  });
});