import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { getLowStockItems } from './tauri';

let permissionChecked = false;

export async function checkNotificationPermission(): Promise<boolean> {
  if (permissionChecked) return true;
  
  let permissionGranted = await isPermissionGranted();
  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === 'granted';
  }
  permissionChecked = true;
  return permissionGranted;
}

export async function sendLowStockNotification(): Promise<void> {
  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) return;

  try {
    const lowStockItems = await getLowStockItems();
    if (lowStockItems.length > 0) {
      const itemNames = lowStockItems.slice(0, 3).map(i => i.name).join(', ');
      const moreText = lowStockItems.length > 3 ? ` and ${lowStockItems.length - 3} more` : '';
      sendNotification({
        title: 'Low Stock Alert',
        body: `${lowStockItems.length} items low: ${itemNames}${moreText}`,
      });
    }
  } catch (e) {
    console.error('Failed to send notification:', e);
  }
}

export async function sendLabResultNotification(patientName: string, testName: string): Promise<void> {
  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) return;

  sendNotification({
    title: 'Lab Result Ready',
    body: `Result for ${patientName} - ${testName} is ready`,
  });
}

export async function sendAppointmentReminder(patientName: string, time: string): Promise<void> {
  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) return;

  sendNotification({
    title: 'Appointment Reminder',
    body: `Appointment with ${patientName} at ${time}`,
  });
}
