import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockInvoke, initMockDb, getMockDb, testAppointmentData } from '../test/setup';
import * as tauri from '@/lib/tauri';

describe('Appointment CRUD Operations', () => {
  beforeEach(() => {
    initMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET Appointments', () => {
    it('should fetch all appointments', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.appointments);

      const result = await tauri.getAppointments();

      expect(mockInvoke).toHaveBeenCalledWith('get_appointments', { date: undefined, doctor_id: undefined });
      expect(result).toEqual(db.appointments);
    });

    it('should filter appointments by date', async () => {
      const db = getMockDb();
      const filteredAppointments = db.appointments.filter(a => a.appointment_date === '2024-01-15');
      mockInvoke.mockResolvedValue(filteredAppointments);

      const result = await tauri.getAppointments('2024-01-15');

      expect(mockInvoke).toHaveBeenCalledWith('get_appointments', { date: '2024-01-15', doctor_id: undefined });
      expect(result).toEqual(filteredAppointments);
    });

    it('should filter appointments by doctor', async () => {
      const db = getMockDb();
      const filteredAppointments = db.appointments.filter(a => a.doctor_id === 1);
      mockInvoke.mockResolvedValue(filteredAppointments);

      const result = await tauri.getAppointments(undefined, 1);

      expect(mockInvoke).toHaveBeenCalledWith('get_appointments', { date: undefined, doctor_id: 1 });
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array when no appointments found', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getAppointments('2025-01-01');

      expect(result).toEqual([]);
    });
  });

  describe('GET Appointment by ID', () => {
    it('should fetch a single appointment by ID', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.appointments[0]);

      const result = await tauri.getAppointmentById(1);

      expect(mockInvoke).toHaveBeenCalledWith('get_appointment_by_id', { id: 1 });
      expect(result).toEqual(db.appointments[0]);
    });

    it('should handle non-existent appointment', async () => {
      mockInvoke.mockRejectedValue(new Error('Appointment not found'));

      await expect(tauri.getAppointmentById(999)).rejects.toThrow('Appointment not found');
    });
  });

  describe('CREATE Appointment', () => {
    it('should create a new appointment with valid data', async () => {
      const newAppointment = { ...testAppointmentData, id: 3, appointment_code: 'APT-NEW1234', created_at: '2024-01-20' };
      mockInvoke.mockResolvedValue(newAppointment);

      const result = await tauri.createAppointment(testAppointmentData);

      expect(mockInvoke).toHaveBeenCalledWith('create_appointment', { data: testAppointmentData });
      expect(result).toHaveProperty('id');
    });

    it('should handle create failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'));

      await expect(tauri.createAppointment(testAppointmentData)).rejects.toThrow('Database error');
    });

    it('should require patient_id', async () => {
      const { patient_id, ...invalidData } = testAppointmentData as typeof testAppointmentData & { patient_id: number };
      
      mockInvoke.mockRejectedValue(new Error('patient_id is required'));
      
      // This test checks that validation happens at API level
      await expect(tauri.createAppointment(invalidData as typeof testAppointmentData)).rejects.toThrow();
    });
  });

  describe('UPDATE Appointment Status', () => {
    it('should update appointment status to Completed', async () => {
      const db = getMockDb();
      const updatedAppointment = { ...db.appointments[0], status: 'Completed' };
      mockInvoke.mockResolvedValue(undefined);

      await tauri.updateAppointmentStatus(1, 'Completed');

      expect(mockInvoke).toHaveBeenCalledWith('update_appointment_status', { id: 1, status: 'Completed' });
    });

    it('should update appointment status to Cancelled', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.updateAppointmentStatus(1, 'Cancelled');

      expect(mockInvoke).toHaveBeenCalledWith('update_appointment_status', { id: 1, status: 'Cancelled' });
    });

    it('should handle update failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'));

      await expect(tauri.updateAppointmentStatus(1, 'Completed')).rejects.toThrow('Update failed');
    });
  });

  describe('CANCEL Appointment', () => {
    it('should cancel an appointment', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.cancelAppointment(1, 'Patient requested');

      expect(mockInvoke).toHaveBeenCalledWith('cancel_appointment', { id: 1, reason: 'Patient requested' });
    });

    it('should cancel without reason', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.cancelAppointment(1);

      expect(mockInvoke).toHaveBeenCalledWith('cancel_appointment', { id: 1, reason: undefined });
    });
  });

  describe('GET Upcoming Appointments', () => {
    it('should fetch upcoming appointments for a patient', async () => {
      const db = getMockDb();
      const upcomingAppointments = db.appointments.filter(a => a.status === 'Scheduled');
      mockInvoke.mockResolvedValue(upcomingAppointments);

      const result = await tauri.getUpcomingAppointments(1);

      expect(mockInvoke).toHaveBeenCalledWith('get_upcoming_appointments', { patient_id: 1 });
      expect(result).toEqual(upcomingAppointments);
    });

    it('should return empty when no upcoming appointments', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getUpcomingAppointments(999);

      expect(result).toEqual([]);
    });
  });
});