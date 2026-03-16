import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockInvoke, initMockDb, getMockDb, testInventoryData } from '../test/setup';
import * as tauri from '@/lib/tauri';

describe('Inventory CRUD Operations', () => {
  beforeEach(() => {
    initMockDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET Inventory', () => {
    it('should fetch all inventory items', async () => {
      const db = getMockDb();
      mockInvoke.mockResolvedValue(db.inventory);

      const result = await tauri.getInventory();

      expect(mockInvoke).toHaveBeenCalledWith('get_inventory', { category: undefined });
      expect(result).toEqual(db.inventory);
    });

    it('should filter inventory by category', async () => {
      const db = getMockDb();
      const filteredInventory = db.inventory.filter(i => i.category === 'Medicines');
      mockInvoke.mockResolvedValue(filteredInventory);

      const result = await tauri.getInventory('Medicines');

      expect(mockInvoke).toHaveBeenCalledWith('get_inventory', { category: 'Medicines' });
      expect(result.every(i => i.category === 'Medicines')).toBe(true);
    });

    it('should return empty array when no inventory items found', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getInventory('NonExistent');

      expect(result).toEqual([]);
    });
  });

  describe('GET Low Stock Items', () => {
    it('should fetch items with low stock', async () => {
      const lowStock = [
        { id: 1, item_code: 'INV-11111111', item_name: 'Paracetamol', current_stock: 10, min_threshold: 50 }
      ];
      mockInvoke.mockResolvedValue(lowStock);

      const result = await tauri.getLowStockItems();

      expect(mockInvoke).toHaveBeenCalled();
      expect(result).toEqual(lowStock);
    });

    it('should return empty array when no low stock items', async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await tauri.getLowStockItems();

      expect(result).toEqual([]);
    });
  });

  describe('CREATE Inventory Item', () => {
    it('should create a new inventory item', async () => {
      const newItem = { 
        ...testInventoryData, 
        id: 2, 
        item_code: 'INV-NEW1234',
        created_at: '2024-01-20'
      };
      mockInvoke.mockResolvedValue(newItem);

      const result = await tauri.createInventoryItem(testInventoryData);

      expect(mockInvoke).toHaveBeenCalledWith('create_inventory_item', { data: testInventoryData });
      expect(result).toHaveProperty('id');
      expect(result.item_code).toBeDefined();
    });

    it('should handle create failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'));

      await expect(tauri.createInventoryItem(testInventoryData)).rejects.toThrow('Database error');
    });

    it('should create item with different category', async () => {
      const equipmentData = { 
        ...testInventoryData, 
        category: 'Equipment',
        current_stock: 5,
        min_threshold: 2
      };
      const newItem = { 
        ...equipmentData, 
        id: 2, 
        item_code: 'INV-NEW1234',
        created_at: '2024-01-20'
      };
      mockInvoke.mockResolvedValue(newItem);

      const result = await tauri.createInventoryItem(equipmentData);

      expect(result.category).toBe('Equipment');
    });
  });

  describe('UPDATE Stock', () => {
    it('should add stock to an item', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.updateStock(1, 50, 'add');

      expect(mockInvoke).toHaveBeenCalledWith('update_stock', { 
        item_id: 1, 
        quantity: 50, 
        operation: 'add' 
      });
    });

    it('should subtract stock from an item', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.updateStock(1, 20, 'subtract');

      expect(mockInvoke).toHaveBeenCalledWith('update_stock', { 
        item_id: 1, 
        quantity: 20, 
        operation: 'subtract' 
      });
    });

    it('should handle update failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Insufficient stock'));

      await expect(tauri.updateStock(1, 1000, 'subtract')).rejects.toThrow('Insufficient stock');
    });

    it('should handle non-existent item', async () => {
      mockInvoke.mockRejectedValue(new Error('Item not found'));

      await expect(tauri.updateStock(999, 10, 'add')).rejects.toThrow('Item not found');
    });
  });

  describe('DELETE Inventory Item', () => {
    it('should delete an inventory item', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await tauri.deleteInventoryItem(1);

      expect(mockInvoke).toHaveBeenCalledWith('delete_inventory_item', { id: 1 });
    });

    it('should handle delete failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Delete failed'));

      await expect(tauri.deleteInventoryItem(1)).rejects.toThrow('Delete failed');
    });

    it('should handle non-existent item deletion', async () => {
      mockInvoke.mockRejectedValue(new Error('Item not found'));

      await expect(tauri.deleteInventoryItem(999)).rejects.toThrow('Item not found');
    });
  });
});