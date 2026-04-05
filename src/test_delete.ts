import { invoke } from '@tauri-apps/api/core';

async function testDelete() {
  try {
    // This should now work without providing 'requester' due to Option<String> in Rust
    await invoke('delete_patient', { id: 9999 });
    console.log('Success (Expected failure due to missing record, but not argument error)');
  } catch (e) {
    console.log('Result:', e);
  }
}

testDelete();
