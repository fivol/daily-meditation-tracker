import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, type CollectionReference } from 'firebase-admin/firestore';
import type { ChatSettings, Checkin, DayDoc, Member, PollDoc, Slot } from './types.js';

// In containers the key comes base64-encoded in an env variable; locally, from a file
// pointed to by GOOGLE_APPLICATION_CREDENTIALS.
const encodedKey = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
initializeApp({
  credential: encodedKey
    ? cert(JSON.parse(Buffer.from(encodedKey, 'base64').toString('utf8')))
    : applicationDefault(),
});

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

/**
 * A map for a merge write, or undefined (skipped thanks to ignoreUndefinedProperties) when empty:
 * with `merge: true` an empty map replaces the stored one instead of merging into it.
 */
export const mergeMap = <T>(map: Record<string, T>) => (Object.keys(map).length > 0 ? map : undefined);

const typed = <T>(ref: CollectionReference) => ref as CollectionReference<T>;

export const chats = () => typed<ChatSettings>(db.collection('chats'));
export const members = (chatId: number) =>
  typed<Member>(db.collection(`chats/${chatId}/members`));
export const checkins = (chatId: number) =>
  typed<Checkin>(db.collection(`chats/${chatId}/checkins`));
export const days = (chatId: number) => typed<DayDoc>(db.collection(`chats/${chatId}/days`));
export const polls = () => typed<PollDoc>(db.collection('polls'));
/** Users who started the bot in private, so it can DM them. */
export const users = () => typed<{ canDm: boolean }>(db.collection('users'));

/** Deterministic id: one check-in per member, day and slot. */
export const checkinId = (date: string, userId: number, slot: Slot) =>
  `${date}_${userId}_${slot}`;
