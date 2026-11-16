import { chats, db, polls } from '../db.js';
import type { ChatSettings } from '../types.js';

/** Settings of a configured chat, or null if /setup was never run there. */
export async function getChat(chatId: number): Promise<ChatSettings | null> {
  const snap = await chats().doc(String(chatId)).get();
  return snap.data() ?? null;
}

export async function updateChat(chatId: number, patch: Partial<ChatSettings>): Promise<void> {
  await chats().doc(String(chatId)).set(patch, { merge: true });
}

export async function listChats(): Promise<{ chatId: number; settings: ChatSettings }[]> {
  const snap = await chats().get();
  return snap.docs.map((doc) => ({ chatId: Number(doc.id), settings: doc.data() }));
}

const SUBCOLLECTIONS = ['members', 'checkins', 'days'];
const BATCH_LIMIT = 400;

/**
 * Moves a chat's data to its new id after Telegram upgraded the group to a supergroup.
 * Returns false when there is nothing to move or the new id is already set up.
 */
export async function migrateChat(oldId: number, newId: number): Promise<boolean> {
  const oldRef = chats().doc(String(oldId));
  const newRef = chats().doc(String(newId));
  const [oldSnap, newSnap] = await Promise.all([oldRef.get(), newRef.get()]);
  if (!oldSnap.exists || newSnap.exists) return false;

  // Message ids don't survive the upgrade, so the pinned message is re-created later.
  const { progressMessageId: _stale, ...settings } = oldSnap.data()!;
  const writes: [FirebaseFirestore.DocumentReference, FirebaseFirestore.DocumentData][] = [[newRef, settings]];
  for (const name of SUBCOLLECTIONS) {
    const snap = await oldRef.collection(name).get();
    for (const doc of snap.docs) writes.push([newRef.collection(name).doc(doc.id), doc.data()]);
  }
  const pollSnap = await polls().where('chatId', '==', oldId).get();
  for (const doc of pollSnap.docs) writes.push([doc.ref, { ...doc.data(), chatId: newId }]);

  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const [ref, data] of writes.slice(i, i + BATCH_LIMIT)) batch.set(ref, data);
    await batch.commit();
  }
  await db.recursiveDelete(oldRef);
  return true;
}
