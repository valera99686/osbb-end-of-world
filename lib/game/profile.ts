import {
  DEFAULT_SETTINGS,
  initialMeta,
  SAVE_KEY,
  type Meta,
  type Settings,
} from './model';
import { importSave, readSave, saveData } from './save';

export const PROFILE_BACKUP_KEY = 'osbb.save.before-reset.v1';
type ProfileStorage = Pick<Storage, 'getItem' | 'setItem'>;
type Device = Pick<Meta, 'settings' | 'sound'>;

// Audio and accessibility options belong to the device, not to the progress:
// resetting, restoring or importing a profile keeps them.
function deviceOptions(save: string | null): Device | null {
  const live = readSave(save);
  return save && !live.error
    ? { settings: live.meta.settings, sound: live.meta.sound }
    : null;
}
function customised(device: Device) {
  return (
    !device.sound ||
    (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).some(
      (key) => device.settings[key] !== DEFAULT_SETTINGS[key],
    )
  );
}
// A profile with nothing played yet (right after a reset, say) never replaces
// an existing backup, so reset -> import still restores the older progress.
function backUp(storage: ProfileStorage, current: string) {
  const live = readSave(current);
  const empty =
    !live.error && !live.run && live.meta.runs === 0 && live.meta.cores === 0;
  const old = storage.getItem(PROFILE_BACKUP_KEY);
  if (empty && old && !readSave(old).error) return;
  storage.setItem(PROFILE_BACKUP_KEY, current);
}

export function resetProfile(storage: ProfileStorage, current: string) {
  // Keep the backup before replacing the live save. Failure leaves the profile intact.
  backUp(storage, current);
  storage.setItem(
    SAVE_KEY,
    saveData({ ...initialMeta(), ...deviceOptions(current) }, null),
  );
}

export function restoreProfile(storage: ProfileStorage) {
  const backup = storage.getItem(PROFILE_BACKUP_KEY);
  if (!backup || readSave(backup).error)
    throw new Error('Invalid profile backup');
  const device = deviceOptions(storage.getItem(SAVE_KEY));
  if (device) {
    // Only the device options change; the rest is restored verbatim.
    const saved = JSON.parse(backup);
    saved.meta = { ...saved.meta, ...device };
    storage.setItem(SAVE_KEY, JSON.stringify(saved));
  } else storage.setItem(SAVE_KEY, backup);
}

// Replaces the live save with an exported code, keeping the old one as the
// same backup that "restore" uses. Invalid codes change nothing. A device the
// player has set up keeps its own options; an untouched one takes the code's.
export function importProfile(
  storage: ProfileStorage,
  current: string,
  code: string,
) {
  const imported = importSave(code);
  if (imported.error) throw new Error('Invalid profile code');
  const device = deviceOptions(current);
  const meta =
    device && customised(device)
      ? { ...imported.meta, ...device }
      : imported.meta;
  backUp(storage, current);
  storage.setItem(SAVE_KEY, saveData(meta, imported.run));
  return { ...imported, meta };
}
