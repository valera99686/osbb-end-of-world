import { initialMeta, readSave, saveData, SAVE_KEY } from './model';

export const PROFILE_BACKUP_KEY = 'osbb.save.before-reset.v1';
type ProfileStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function resetProfile(storage: ProfileStorage, current: string) {
  // Keep the backup before replacing the live save. Failure leaves the profile intact.
  storage.setItem(PROFILE_BACKUP_KEY, current);
  storage.setItem(SAVE_KEY, saveData(initialMeta(), null));
}

export function restoreProfile(storage: ProfileStorage) {
  const backup = storage.getItem(PROFILE_BACKUP_KEY);
  if (!backup || readSave(backup).error)
    throw new Error('Invalid profile backup');
  storage.setItem(SAVE_KEY, backup);
}
