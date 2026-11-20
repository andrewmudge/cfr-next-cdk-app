import { ScanCommand, type ScanCommandOutput } from '@aws-sdk/lib-dynamodb';
import { docClient, listFamilyMemberRecords, type SubmissionRecord } from '@/lib/reunion-db';
import { getAllApprovedUsersServer } from '@/lib/dynamodb-server';
import { upsertMembers, type MemberSource, type UpsertInput } from '@/lib/messaging/mailing-list';

const REG_TABLE = process.env.REGISTRATIONS_TABLE || 'ReunionRegistrations';

async function allSubmissions(): Promise<SubmissionRecord[]> {
  const items: SubmissionRecord[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out: ScanCommandOutput = await docClient.send(
      new ScanCommand({
        TableName: REG_TABLE,
        FilterExpression: 'begins_with(sk, :p) AND attribute_exists(email)',
        ExpressionAttributeValues: { ':p': 'SUBMISSION#' },
        ExclusiveStartKey,
      })
    );
    items.push(...((out.Items as SubmissionRecord[]) ?? []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/**
 * Seed / refresh the mailing list from everything the site already knows:
 * family members (living), every year's sign-ups, and approved site accounts.
 * Safe to re-run: existing rows keep their status (see upsertMembers).
 */
export async function syncMailingListFromSite() {
  const [members, submissions, accounts] = await Promise.all([
    listFamilyMemberRecords(true),
    allSubmissions(),
    getAllApprovedUsersServer(),
  ]);
  const groups: [MemberSource, UpsertInput[]][] = [
    [
      'family',
      members
        .filter((m) => m.email && !m.deceased)
        .map((m) => ({ email: m.email!, name: m.displayName, personId: m.personId })),
    ],
    [
      'registration',
      submissions.filter((s) => s.email).map((s) => ({ email: s.email!, name: s.submitterName, personId: s.submitterPersonId })),
    ],
    [
      'account',
      accounts
        .filter((a) => a.email && a.isActive !== false)
        .map((a) => ({ email: a.email, name: [a.givenName, a.familyName].filter(Boolean).join(' ') || undefined })),
    ],
  ];
  const result: Record<string, { added: number; updated: number; skipped: number }> = {};
  for (const [source, entries] of groups) result[source] = await upsertMembers(entries, source);
  return result;
}
