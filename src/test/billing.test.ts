import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockInvoke, initMockDb, getMockDb, testInvoiceData, testInvoiceItems } from '../test/setup';
import * as tauri from '@/lib/tauri';

describe('Billing & Invoice CRUD Operations', () => {
  beforeEach(() => {
    initMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET Invoices', () => {
    it('should fetch all invoices', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.invoices);

      const result = await tauri.getInvoices();

      expect(mockInvoke).toHaveBeenCalledWith('get_invoices', { status: undefined, patient_id: undefined });
      expect(result).toEqual(db.invoices);
    });

    it('should filter invoices by status', async () => {
      const db = getMockDb();
      const filteredInvoices = db.invoices.filter(i => i.status === 'Partial');
      mockInvoke.mockResolvedValue(filteredInvoices);

      const result = await tauri.getInvoices('Partial');

      expect(mockInvoke).toHaveBeenCalledWith('get_invoices', { status: 'Partial', patient_id: undefined });
      expect(result.every(i => i.status === 'Partial')).toBe(true);
    });

    it('should filter invoices by patient ID', async () => {
      const db = getMockDb();
      const filteredInvoices = db.invoices.filter(i => i.patient_id === 1);
      mockInvoke.mockResolvedValue(filteredInvoices);

      const result = await tauri.getInvoices(undefined, 1);

      expect(mockInvoke).toHaveBeenCalledWith('get_invoices', { status: undefined, patient_id: 1 });
      expect(result).toEqual(filteredInvoices);
    });

    it('should return empty array when no invoices found', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getInvoices('Paid');

      expect(result).toEqual([]);
    });
  });

  describe('GET Invoice by ID', () => {
    it('should fetch a single invoice by ID', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.invoices[0]);

      const result = await tauri.getInvoiceById(1);

      expect(mockInvoke).toHaveBeenCalledWith('get_invoice_by_id', { id: 1 });
      expect(result).toEqual(db.invoices[0]);
    });

    it('should handle non-existent invoice', async () => {
      mockInvoke.mockRejectedValue(new Error('Invoice not found'));

      await expect(tauri.getInvoiceById(999)).rejects.toThrow('Invoice not found');
    });
  });

  describe('CREATE Invoice', () => {
    it('should create a new invoice with items', async () => {
      const newInvoice = { 
        ...testInvoiceData, 
        id: 2, 
        invoice_code: 'INV-NEW1234',
        patient_name: 'Test Patient',
        items: testInvoiceItems,
        created_at: '2024-01-20'
      };
      mockInvoke.mockResolvedValue(newInvoice);

      const result = await tauri.createInvoice(testInvoiceData, testInvoiceItems);

      expect(mockInvoke).toHaveBeenCalledWith('create_invoice', { 
        data: testInvoiceData, 
        items: testInvoiceItems 
      });
      expect(result).toHaveProperty('id');
      expect(result.invoice_code).toBeDefined();
    });

    it('should handle create failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'));

      await expect(tauri.createInvoice(testInvoiceData, testInvoiceItems))
        .rejects.toThrow('Database error');
    });

    it('should create invoice without items', async () => {
      const newInvoice = { 
        ...testInvoiceData, 
        id: 2, 
        invoice_code: 'INV-NEW1234',
        patient_name: 'Test Patient',
        items: [],
        created_at: '2024-01-20'
      };
      mockInvoke.mockResolvedValue(newInvoice);

      const result = await tauri.createInvoice(testInvoiceData, []);

      expect(result.items).toEqual([]);
    });
  });

  describe('RECORD Payment', () => {
    it('should record a payment on an invoice', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.recordPayment(1, 500, 'Cash');

      expect(mockInvoke).toHaveBeenCalledWith('record_payment', { 
        invoice_id: 1, 
        amount: 500, 
        method: 'Cash' 
      });
    });

    it('should record payment with different method', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.recordPayment(1, 500, 'Card');

      expect(mockInvoke).toHaveBeenCalledWith('record_payment', { 
        invoice_id: 1, 
        amount: 500, 
        method: 'Card' 
      });
    });

    it('should handle payment recording failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Payment failed'));

      await expect(tauri.recordPayment(1, 500, 'Cash')).rejects.toThrow('Payment failed');
    });
  });

  describe('EXPORT Invoice PDF', () => {
    it('should export invoice as PDF', async () => {
      const pdfPath = '/path/to/invoice.pdf';
      mockInvoke.mockResolvedValue(pdfPath);

      const result = await tauri.exportInvoicePdf(1);

      expect(mockInvoke).toHaveBeenCalledWith('export_invoice_pdf', { invoice_id: 1 });
      expect(result).toBe(pdfPath);
    });

    it('should handle export failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Export failed'));

      await expect(tauri.exportInvoicePdf(1)).rejects.toThrow('Export failed');
    });
  });

  describe('GET Revenue By Range', () => {
    it('should fetch revenue data for date range', async () => {
      const revenueData = [
        { date: '2024-01-01', amount: 1000 },
        { date: '2024-01-02', amount: 1500 },
      ];
      mockInvoke.mockResolvedValue(revenueData);

      const result = await tauri.getRevenueByRange('2024-01-01', '2024-01-31');

      expect(mockInvoke).toHaveBeenCalledWith('get_revenue_by_range', { 
        from: '2024-01-01', 
        to: '2024-01-31' 
      });
      expect(result).toEqual(revenueData);
    });

    it('should return empty array when no revenue data', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getRevenueByRange('2025-01-01', '2025-01-31');

      expect(result).toEqual([]);
    });
  });
});