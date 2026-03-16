import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockInvoke, initMockDb, getMockDb, testStaffData } from '../test/setup';
import * as tauri from '@/lib/tauri';

describe('Staff CRUD Operations', () => {
  beforeEach(() => {
    initMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET Staff', () => {
    it('should fetch all staff members', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.staff);

      const result = await tauri.getStaff();

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toEqual(db.staff);
    });

    it('should return empty array when no staff found', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getStaff();

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('CREATE Staff', () => {
    it('should create a new staff member', async () => {
      const newStaff = { 
        ...testStaffData, 
        id: 2, 
        staff_code: 'ST-NEW1234',
        created_at: '2024-01-20'
      };
      mockInvoke.mockResolvedValue(newStaff);

      const result = await tauri.createStaff(testStaffData);

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
      expect(result.staff_code).toBeDefined();
    });

    it('should handle create failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'));

      await expect(tauri.createStaff(testStaffData)).rejects.toThrow('Database error');
    });

    it('should create staff with different roles', async () => {
      const doctorData = { 
        ...testStaffData, 
        role: 'Doctor',
        department: 'Cardiology'
      };
      const newStaff = { 
        ...doctorData, 
        id: 2, 
        staff_code: 'ST-NEW1234',
        created_at: '2024-01-20'
      };
      mockInvoke.mockResolvedValue(newStaff);

      const result = await tauri.createStaff(doctorData);

      expect(result.role).toBe('Doctor');
    });
  });

  describe('UPDATE Staff', () => {
    it('should update staff member details', async () => {
      const db = getMockDb();
      const updatedStaff = { ...db.staff[0], full_name: 'Updated Name' };
      mockInvoke.mockResolvedValue(updatedStaff);

      const result = await tauri.updateStaff(1, { full_name: 'Updated Name' });

      expect(mockInvoke).toHaveBeenCalledWith('update_staff', expect.objectContaining({ id: 1, data: { full_name: 'Updated Name' } }));
      expect(result.full_name).toBe('Updated Name');
    });

    it('should update staff department', async () => {
      const db = getMockDb();
      const updatedStaff = { ...db.staff[0], department: 'ICU' };
      mockInvoke.mockResolvedValue(updatedStaff);

      const result = await tauri.updateStaff(1, { department: 'ICU' });

      expect(result.department).toBe('ICU');
    });

    it('should update staff status', async () => {
      const db = getMockDb();
      const updatedStaff = { ...db.staff[0], status: 'Inactive' };
      mockInvoke.mockResolvedValue(updatedStaff);

      const result = await tauri.updateStaff(1, { status: 'Inactive' });

      expect(result.status).toBe('Inactive');
    });

    it('should handle update failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'));

      await expect(tauri.updateStaff(1, { status: 'Active' })).rejects.toThrow('Update failed');
    });
  });

  describe('DELETE Staff', () => {
    it('should delete a staff member', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.deleteStaff(1);

      expect(mockInvoke).toHaveBeenCalledWith('delete_staff', { id: 1 });
    });

    it('should handle delete failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Delete failed'));

      await expect(tauri.deleteStaff(1)).rejects.toThrow('Delete failed');
    });

    it('should handle non-existent staff deletion', async () => {
      mockInvoke.mockRejectedValue(new Error('Staff not found'));

      await expect(tauri.deleteStaff(999)).rejects.toThrow('Staff not found');
    });
  });

  describe('GET Doctors', () => {
    it('should fetch all doctors', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.doctors);

      const result = await tauri.getDoctors();

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toEqual(db.doctors);
    });

    it('should return empty array when no doctors found', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getDoctors();

      expect(result).toEqual([]);
    });
  });

  describe('GET Doctor by ID', () => {
    it('should fetch a single doctor by ID', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.doctors[0]);

      const result = await tauri.getDoctorById(1);

      expect(mockInvoke).toHaveBeenCalledWith('get_doctor_by_id', { id: 1 });
      expect(result).toEqual(db.doctors[0]);
    });

    it('should handle non-existent doctor', async () => {
      mockInvoke.mockRejectedValue(new Error('Doctor not found'));

      await expect(tauri.getDoctorById(999)).rejects.toThrow('Doctor not found');
    });
  });

  describe('CREATE Doctor', () => {
    it('should create a new doctor', async () => {
      const doctorData = {
        full_name: 'Dr. Test',
        specialization: 'General',
        department: 'General',
        phone: '1234567890',
        email: 'drtest@example.com',
        availability_status: 'Available' as const,
        shift: 'Morning',
        consultation_fee: 500
      };
      const newDoctor = { 
        ...doctorData, 
        id: 3, 
        staff_code: 'DR-NEW1234',
        created_at: '2024-01-20'
      };
      mockInvoke.mockResolvedValue(newDoctor);

      const result = await tauri.createDoctor(doctorData);

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
    });

    it('should handle create failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'));

      await expect(tauri.createDoctor({ 
        full_name: 'Dr. Test',
        specialization: 'General',
        department: 'General'
      } as any)).rejects.toThrow('Database error');
    });
  });

  describe('UPDATE Doctor Status', () => {
    it('should update doctor availability status', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.updateDoctorStatus(1, 'On Leave');

      expect(mockInvoke).toHaveBeenCalledWith('update_doctor_status', expect.objectContaining({ 
        id: 1, 
        status: 'On Leave' 
      }));
    });

    it('should handle update failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'));

      await expect(tauri.updateDoctorStatus(1, 'Available')).rejects.toThrow('Update failed');
    });
  });
});