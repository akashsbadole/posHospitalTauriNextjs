import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Create mock function for Tauri invoke
export const mockInvoke = vi.fn();

// Mock the Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

// Mock data storage
const db: Record<string, unknown[]> = {
  patients: [],
  doctors: [],
  appointments: [],
  prescriptions: [],
  lab_tests: [],
  wards: [],
  beds: [],
  invoices: [],
  staff: [],
  inventory: [],
};

// Reset DB between tests
export function resetMockDb() {
  Object.keys(db).forEach(key => {
    db[key] = [];
  });
}

// Initialize with sample data
export function initMockDb() {
  db.patients = [
    { id: 1, patient_code: 'PT-12345678', full_name: 'John Doe', dob: '1990-01-01', gender: 'Male', phone: '1234567890', email: 'john@example.com', blood_group: 'O+', address: 'Test Address', status: 'Active', department: 'General', assigned_doctor_id: 1, assigned_doctor_name: 'Dr. Smith', created_at: '2024-01-01', updated_at: '2024-01-01', emergency_contact: '', emergency_phone: '', allergies: '', chronic_conditions: '', insurance_provider: '', insurance_number: '', photo_path: '' },
    { id: 2, patient_code: 'PT-87654321', full_name: 'Jane Smith', dob: '1985-05-15', gender: 'Female', phone: '0987654321', email: 'jane@example.com', blood_group: 'A+', address: 'Another Address', status: 'OPD', department: 'Cardiology', assigned_doctor_id: 2, assigned_doctor_name: 'Dr. Johnson', created_at: '2024-01-02', updated_at: '2024-01-02', emergency_contact: '', emergency_phone: '', allergies: '', chronic_conditions: '', insurance_provider: '', insurance_number: '', photo_path: '' },
  ];
  db.doctors = [
    { id: 1, staff_code: 'DR-11111111', full_name: 'Dr. Smith', specialization: 'General', availability_status: 'Available', department: 'General', phone: '1111111111', email: 'drsmith@example.com', shift: 'Morning', consultation_fee: 500, created_at: '2024-01-01' },
    { id: 2, staff_code: 'DR-22222222', full_name: 'Dr. Johnson', specialization: 'Cardiology', availability_status: 'Available', department: 'Cardiology', phone: '2222222222', email: 'drjohnson@example.com', shift: 'Afternoon', consultation_fee: 750, created_at: '2024-01-01' },
  ];
  db.appointments = [
    { id: 1, appointment_code: 'APT-11111111', patient_id: 1, doctor_id: 1, appointment_date: '2024-01-15', appointment_time: '10:00', department: 'General', reason: 'Regular checkup', status: 'Scheduled', patient_name: 'John Doe', doctor_name: 'Dr. Smith', notes: '', created_at: '2024-01-10' },
    { id: 2, appointment_code: 'APT-22222222', patient_id: 2, doctor_id: 2, appointment_date: '2024-01-16', appointment_time: '11:00', department: 'Cardiology', reason: 'Follow-up', status: 'Scheduled', patient_name: 'Jane Smith', doctor_name: 'Dr. Johnson', notes: '', created_at: '2024-01-10' },
  ];
  db.prescriptions = [
    { id: 1, rx_code: 'RX-11111111', patient_id: 1, doctor_id: 1, prescription_date: '2024-01-15', valid_until: '2024-01-30', status: 'Active', patient_name: 'John Doe', doctor_name: 'Dr. Smith', created_at: '2024-01-15' },
  ];
  db.lab_tests = [
    { id: 1, lab_code: 'LAB-11111111', patient_id: 1, test_category: 'Blood', test_name: 'Complete Blood Count', priority: 'Normal', status: 'Pending', patient_name: 'John Doe', doctor_name: 'Dr. Smith', result_value: '', result_unit: '', is_abnormal: false, notes: '', report_path: '', created_at: '2024-01-15' },
  ];
  db.wards = [
    { id: 1, ward_code: 'WD-11111111', ward_name: 'General Ward', ward_type: 'General', total_beds: 20, floor: 1, status: 'Active', created_at: '2024-01-01' },
    { id: 2, ward_code: 'WD-22222222', ward_name: 'ICU', ward_type: 'ICU', total_beds: 10, floor: 2, status: 'Active', created_at: '2024-01-01' },
  ];
  db.beds = [
    { id: 1, ward_id: 1, bed_number: 'G-001', status: 'Available', patient_id: null, admission_date: '', expected_discharge: '', created_at: '2024-01-01' },
    { id: 2, ward_id: 1, bed_number: 'G-002', status: 'Occupied', patient_id: 1, admission_date: '2024-01-10', expected_discharge: '2024-01-15', created_at: '2024-01-01' },
  ];
  db.invoices = [
    { id: 1, invoice_code: 'INV-11111111', patient_id: 1, issue_date: '2024-01-15', due_date: '2024-01-30', total: 1000, paid_amount: 500, balance: 500, status: 'Partial', payment_method: 'Cash', patient_name: 'John Doe', created_at: '2024-01-15' },
  ];
  db.staff = [
    { id: 1, staff_code: 'ST-11111111', full_name: 'Nurse Joy', role: 'Nurse', department: 'General', phone: '3333333333', email: 'nursejoy@example.com', shift: 'Morning', status: 'Active', created_at: '2024-01-01' },
  ];
  db.inventory = [
    { id: 1, item_code: 'INV-11111111', item_name: 'Paracetamol 500mg', category: 'Medicines', current_stock: 100, min_threshold: 50, unit: 'tablets', expiry_date: '2025-12-31', created_at: '2024-01-01' },
  ];
}

// Get mock data
export function getMockDb() {
  return db;
}

// Helper to create test patient data
export const testPatientData = {
  full_name: 'Test Patient',
  dob: '1995-05-20',
  gender: 'Male',
  phone: '9999999999',
  email: 'test@patient.com',
  blood_group: 'B+',
  address: '123 Test Street',
  emergency_contact: 'Emergency Contact',
  emergency_phone: '8888888888',
  allergies: 'None',
  chronic_conditions: 'None',
  department: 'General',
  assigned_doctor_id: 1,
  status: 'Active',
  insurance_provider: 'Test Insurance',
  insurance_number: 'POL123',
};

// Helper to create test appointment data
export const testAppointmentData = {
  patient_id: 1,
  doctor_id: 1,
  appointment_date: '2024-02-01',
  appointment_time: '10:00',
  department: 'General',
  reason: 'Regular checkup',
};

// Helper to create test prescription data
export const testPrescriptionData = {
  patient_id: 1,
  doctor_id: 1,
  prescription_date: '2024-01-15',
  valid_until: '2024-01-30',
  status: 'Active',
};

// Helper to create test prescription drugs
export const testPrescriptionDrugs = [
  { drug_name: 'Paracetamol', dosage: '500mg', frequency: '3 times a day', duration: '5 days', instructions: 'Take after food' },
  { drug_name: 'Vitamin C', dosage: '1000mg', frequency: '1 time a day', duration: '30 days', instructions: 'Morning' },
];

// Helper to create test lab test data
export const testLabTestData = {
  patient_id: 1,
  test_category: 'Blood',
  test_name: 'Hemoglobin Test',
  priority: 'Normal',
};

// Helper to create test ward data
export const testWardData = {
  ward_name: 'Test Ward',
  ward_type: 'General',
  total_beds: 15,
  floor: 1,
};

// Helper to create test invoice data
export const testInvoiceData = {
  patient_id: 1,
  issue_date: '2024-01-15',
  due_date: '2024-01-30',
  total: 1000,
  paid_amount: 0,
  balance: 1000,
  status: 'Pending',
  payment_method: 'Cash',
};

// Helper to create test invoice items
export const testInvoiceItems = [
  { description: 'Consultation Fee', category: 'Service', quantity: 1, unit_price: 500, total: 500 },
  { description: 'Medicine', category: 'Pharmacy', quantity: 1, unit_price: 500, total: 500 },
];

// Helper to create test staff data
export const testStaffData = {
  full_name: 'Test Staff',
  role: 'Nurse',
  phone: '9999999999',
  email: 'test@staff.com',
  department: 'General',
  shift: 'Morning',
  status: 'Active',
};

// Helper to create test inventory data
export const testInventoryData = {
  item_name: 'Test Item',
  category: 'Medicines',
  current_stock: 100,
  min_threshold: 20,
  unit: 'tablets',
  expiry_date: '2025-12-31',
};

// Initialize mock DB on load
initMockDb();