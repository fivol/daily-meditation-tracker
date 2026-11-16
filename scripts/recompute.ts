// Rebuilds cached member aggregates from check-ins and day snapshots.
// Usage: npm run recompute -- <chatId> [userId]
import { recomputeMember } from '../src/services/jobs.js';
import { listMembers } from '../src/services/members.js';

const [chatIdArg, userIdArg] = process.argv.slice(2);
if (!chatIdArg) {
  console.error('Usage: npm run recompute -- <chatId> [userId]');
  process.exit(1);
}
const chatId = Number(chatIdArg);
const userIds = userIdArg ? [Number(userIdArg)] : (await listMembers(chatId)).map((m) => m.userId);
for (const userId of userIds) {
  await recomputeMember(chatId, userId);
  console.log(`Recomputed ${userId}`);
}
process.exit(0);
