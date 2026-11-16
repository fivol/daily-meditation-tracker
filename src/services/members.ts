import type { User } from 'grammy/types';
import { members } from '../db.js';
import { emptyStats } from '../stats.js';
import type { Member } from '../types.js';

/** Members already known to exist, to avoid a read on every group message. */
const known = new Set<string>();

function profile(user: User) {
  return { firstName: user.first_name, lastName: user.last_name, username: user.username };
}

/** Creates the member on first contact; refreshes the name on later calls. */
export async function ensureMember(chatId: number, user: User, today: string): Promise<Member> {
  const ref = members(chatId).doc(String(user.id));
  const snap = await ref.get();
  if (snap.exists) {
    const member = { ...snap.data()!, ...profile(user) };
    await ref.set(profile(user), { merge: true });
    known.add(`${chatId}:${user.id}`);
    return member;
  }
  const member: Member = {
    ...emptyStats(),
    ...profile(user),
    userId: user.id,
    joinedDate: today,
    status: 'active',
  };
  await ref.set(member);
  known.add(`${chatId}:${user.id}`);
  return member;
}

/** Cheap variant for frequent events such as group messages. */
export async function touchMember(chatId: number, user: User, today: string): Promise<void> {
  if (known.has(`${chatId}:${user.id}`)) return;
  await ensureMember(chatId, user, today);
}

/** Member (re)joined the chat: a removed member becomes active again with stats kept. */
export async function markJoined(chatId: number, user: User, today: string): Promise<Member> {
  const member = await ensureMember(chatId, user, today);
  if (member.status !== 'removed') return member;
  const patch = { status: 'active' as const, missedInRow: 0 };
  await members(chatId).doc(String(user.id)).set(patch, { merge: true });
  return { ...member, ...patch };
}

export async function markLeft(chatId: number, userId: number): Promise<void> {
  const ref = members(chatId).doc(String(userId));
  if ((await ref.get()).exists) await ref.set({ status: 'removed' }, { merge: true });
}

export async function getMember(chatId: number, userId: number): Promise<Member | null> {
  const snap = await members(chatId).doc(String(userId)).get();
  return snap.data() ?? null;
}

export async function findByUsername(chatId: number, username: string): Promise<Member | null> {
  const snap = await members(chatId).where('username', '==', username.replace(/^@/, '')).limit(1).get();
  return snap.docs[0]?.data() ?? null;
}

export async function listMembers(chatId: number): Promise<Member[]> {
  const snap = await members(chatId).get();
  return snap.docs.map((doc) => doc.data());
}

export async function updateMember(chatId: number, userId: number, patch: Partial<Member>): Promise<void> {
  await members(chatId).doc(String(userId)).set(patch, { merge: true });
}
