import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockInvoke, initMockDb, getMockDb, testLabTestData } from '../test/setup';
import * as tauri from '@/lib/tauri';

describe('Lab Test CRUD Operations', () => {
  beforeEach(() => {
    initMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET Lab Tests', () => {
    it('should fetch all lab tests', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.lab_tests);

      const result = await tauri.getLabTests();

      expect(mockInvoke).toHaveBeenCalledWith('get_lab_tests', { status: undefined, patient_id: undefined });
      expect(result).toEqual(db.lab_tests);
    });

    it('should filter lab tests by status', async () => {
      const db = getMockDb();
      const filteredLabTests = db.lab_tests.filter(l => l.status === 'Pending');
      mockInvoke.mockResolvedValue(filteredLabTests);

      const result = await tauri.getLabTests('Pending');

      expect(mockInvoke).toHaveBeenCalledWith('get_lab_tests', { status: 'Pending', patient_id: undefined });
      expect(result.every(l => l.status === 'Pending')).toBe(true);
    });

    it('should filter lab tests by patient ID', async () => {
      const db = getMockDb();
      const filteredLabTests = db.lab_tests.filter(l => l.patient_id === 1);
      mockInvoke.mockResolvedValue(filteredLabTests);

      const result = await tauri.getLabTests(undefined, 1);

      expect(mockInvoke).toHaveBeenCalledWith('get_lab_tests', { status: undefined, patient_id: 1 });
      expect(result).toEqual(filteredLabTests);
    });

    it('should return empty array when no lab tests found', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getLabTests('Reviewed');

      expect(result).toEqual([]);
    });
  });

  describe('CREATE Lab Test', () => {
    it('should create a new lab test with valid data', async () => {
      const newLabTest = { 
        ...testLabTestData, 
        id: 2, 
        lab_code: 'LAB-NEW1234', 
        status: 'Pending',
        created_at: '2024-01-20'
      };
      mockInvoke.mockResolvedValue(newLabTest);

      const result = await tauri.createLabTest(testLabTestData);

      expect(mockInvoke).toHaveBeenCalledWith('create_lab_test', { data: testLabTestData });
      expect(result).toHaveProperty('id');
      expect(result.lab_code).toBeDefined();
    });

    it('should handle create failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'));

      await expect(tauri.createLabTest(testLabTestData)).rejects.toThrow('Database error');
    });

    it('should create lab test with different priority', async () => {
      const urgentLabTest = { ...testLabTestData, priority: 'Urgent' as const };
      const newLabTest = { 
        ...urgentLabTest, 
        id: 2, 
        lab_code: 'LAB-NEW1234', 
        status: 'Pending',
        created_at: '2024-01-20'
      };
      mockInvoke.mockResolvedValue(newLabTest);

      const result = await tauri.createLabTest(urgentLabTest);

      expect(result.priority).toBe('Urgent');
    });
  });

  describe('UPDATE Lab Result', () => {
    it('should update lab test result', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const resultData = {
        result_value: '14.5',
        result_unit: 'g/dL',
        is_abnormal: false,
        notes: 'Normal range'
      };

      await tauri.updateLabResult(1, resultData);

      expect(mockInvoke).toHaveBeenCalledWith('update_lab_result', { id: 1, result: resultData });
    });

    it('should mark result as abnormal', async () => {
      mockInvoke.mockResolvedValue(undefined);

      const resultData = {
        result_value: '18.5',
        result_unit: 'g/dL',
        is_abnormal: true,
        notes: 'Above normal range'
      };

      await tauri.updateLabResult(1, resultData);

      expect(mockInvoke).toHaveBeenCalledWith('update_lab_result', { id: 1, result: resultData });
    });

    it('should handle update failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'));

      const resultData = {
        result_value: '14.5',
        result_unit: 'g/dL',
        is_abnormal: false
      };

      await expect(tauri.updateLabResult(1, resultData)).rejects.toThrow('Update failed');
    });
  });

  describe('UPDATE Lab Status', () => {
    it('should update lab test status to Ready', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.updateLabStatus(1, 'Ready');

      expect(mockInvoke).toHaveBeenCalledWith('update_lab_status', { id: 1, status: 'Ready' });
    });

    it('should update lab test status to Reviewed', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.updateLabStatus(1, 'Reviewed');

      expect(mockInvoke).toHaveBeenCalledWith('update_lab_status', { id: 1, status: 'Reviewed' });
    });

    it('should handle status update failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Status update failed'));

      await expect(tauri.updateLabStatus(1, 'Ready')).rejects.toThrow('Status update failed');
    });
  });

  describe('UPLOAD Lab Report', () => {
    it('should upload lab report file', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.uploadLabReport(1, '/path/to/report.pdf');

      expect(mockInvoke).toHaveBeenCalledWith('upload_lab_report', { lab_id: 1, file_path: '/path/to/report.pdf' });
    });

    it('should handle upload failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Upload failed'));

      await expect(tauri.uploadLabReport(1, '/path/to/report.pdf')).rejects.toThrow('Upload failed');
    });
  });
});