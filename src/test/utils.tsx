import React, { ReactElement, ReactNode } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';

// Create a custom render that wraps components with necessary providers
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: 0,
    },
  },
});

interface WrapperProps {
  children: ReactNode;
}

function AllProviders({ children }: WrapperProps) {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster position="top-right" richColors />
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export * from '@testing-library/react';

// Custom render method
export function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
): RenderResult {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Helper to simulate user events
export async function fillForm(
  container: HTMLElement,
  fields: Record<string, string>
) {
  const { userEvent } = await import('@testing-library/user-event');
  for (const [label, value] of Object.entries(fields)) {
    const input = container.querySelector(`[name="${label}"]`) as HTMLInputElement;
    if (input) {
      await userEvent.clear(input);
      await userEvent.type(input, value);
    }
  }
}

// Helper to wait for loading states
export async function waitForLoadingToFinish() {
  await new Promise(resolve => setTimeout(resolve, 100));
}

// Helper to mock a successful API response
export function mockApiSuccess<T>(data: T) {
  return Promise.resolve(data);
}

// Helper to mock an API error
export function mockApiError(message: string) {
  return Promise.reject(new Error(message));
}

// Generate a unique ID for test data
export function generateId(prefix: string = 'TEST'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Test data factories
export const createPatient = (overrides = {}) => ({
  id: generateId('PT'),
  patient_code: generateId('PT'),
  full_name: 'Test Patient',
  dob: '1990-01-01',
  gender: 'Male',
  phone: '1234567890',
  email: 'test@example.com',
  blood_group: 'O+',
  address: 'Test Address',
  emergency_contact: 'Emergency',
  emergency_phone: '0987654321',
  allergies: '',
  chronic_conditions: '',
  department: 'General',
  assigned_doctor_id: 1,
  assigned_doctor_name: 'Dr. Test',
  status: 'Active' as const,
  insurance_provider: '',
  insurance_number: '',
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  photo_path: '',
  ...overrides,
});

export const createAppointment = (overrides = {}) => ({
  id: generateId('APT'),
  appointment_code: generateId('APT'),
  patient_id: 1,
  doctor_id: 1,
  appointment_date: '2024-01-15',
  appointment_time: '10:00',
  department: 'General',
  reason: 'Test appointment',
  status: 'Scheduled' as const,
  patient_name: 'Test Patient',
  doctor_name: 'Dr. Test',
  notes: '',
  created_at: '2024-01-10',
  ...overrides,
});

export const createPrescription = (overrides = {}) => ({
  id: generateId('RX'),
  rx_code: generateId('RX'),
  patient_id: 1,
  doctor_id: 1,
  prescription_date: '2024-01-15',
  valid_until: '2024-01-30',
  status: 'Active' as const,
  patient_name: 'Test Patient',
  doctor_name: 'Dr. Test',
  drugs: [],
  created_at: '2024-01-15',
  ...overrides,
});

export const createLabTest = (overrides = {}) => ({
  id: generateId('LAB'),
  lab_code: generateId('LAB'),
  patient_id: 1,
  test_category: 'Blood',
  test_name: 'Complete Blood Count',
  priority: 'Normal' as const,
  status: 'Pending' as const,
  patient_name: 'Test Patient',
  doctor_name: 'Dr. Test',
  result_value: '',
  result_unit: '',
  is_abnormal: false,
  notes: '',
  created_at: '2024-01-15',
  ...overrides,
});

export const createWard = (overrides = {}) => ({
  id: generateId('WD'),
  ward_code: generateId('WD'),
  ward_name: 'Test Ward',
  ward_type: 'General',
  total_beds: 10,
  floor: 1,
  status: 'Active' as const,
  created_at: '2024-01-01',
  ...overrides,
});

export const createBed = (overrides = {}) => ({
  id: generateId('BED'),
  ward_id: 1,
  bed_number: 'G-001',
  status: 'Available' as const,
  patient_id: null,
  admission_date: '',
  expected_discharge: '',
  created_at: '2024-01-01',
  ...overrides,
});

export const createInvoice = (overrides = {}) => ({
  id: generateId('INV'),
  invoice_code: generateId('INV'),
  patient_id: 1,
  patient_name: 'Test Patient',
  issue_date: '2024-01-15',
  due_date: '2024-01-30',
  total: 1000,
  paid_amount: 0,
  balance: 1000,
  status: 'Pending' as const,
  payment_method: 'Cash',
  items: [],
  created_at: '2024-01-15',
  ...overrides,
});

export const createStaff = (overrides = {}) => ({
  id: generateId('ST'),
  staff_code: generateId('ST'),
  full_name: 'Test Staff',
  role: 'Nurse',
  phone: '1234567890',
  email: 'test@staff.com',
  department: 'General',
  shift: 'Morning',
  status: 'Active' as const,
  created_at: '2024-01-01',
  ...overrides,
});

export const createInventoryItem = (overrides = {}) => ({
  id: generateId('INV'),
  item_code: generateId('INV'),
  item_name: 'Test Item',
  category: 'Medicines',
  current_stock: 100,
  min_threshold: 20,
  unit: 'tablets',
  expiry_date: '2025-12-31',
  created_at: '2024-01-01',
  ...overrides,
});

// Check for console errors in tests
export function expectNoConsoleErrors() {
  const errors: string[] = [];
  const originalError = console.error;
  
  console.error = (...args: unknown[]) => {
    errors.push(args.join(' '));
    originalError.call(console, ...args);
  };
  
  return {
    check: () => {
      console.error = originalError;
      // Filter out expected React warnings
      const unexpectedErrors = errors.filter(e => 
        !e.includes('Warning:') && 
        !e.includes('act()')
      );
      expect(unexpectedErrors).toHaveLength(0);
    },
  };
}