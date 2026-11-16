import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type CollectionReference } from 'firebase-admin/firestore';
import type { ChatSettings, Checkin, DayDoc, Member, PollDoc, Slot } from './types.js';

initializeApp({ credential: applicationDefault() });

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

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
