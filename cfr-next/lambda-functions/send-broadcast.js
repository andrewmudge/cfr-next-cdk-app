// Sends family emails through Amazon SES. Invoked asynchronously by the Next.js app
// (lib/messaging/broadcast.ts) with { broadcastId }. The job itself lives on the
// Broadcasts table row; progress and results are written back to the same row.
//
// Job kinds:
//   email  - admin broadcast (subject/body/attachments) to an audience
//   signup - confirmation to a new sign-up + announcement to every other family registered that year

const { randomBytes } = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { SESv2Client, SendEmailCommand, GetAccountCommand } = require('@aws-sdk/client-sesv2');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const MailComposer = require('nodemailer/lib/mail-composer');

const region = process.env.AWS_REGION || 'us-east-1';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});
const sesClient = new SESv2Client({ region });
const s3 = new S3Client({ region });

const MAILING_LIST_TABLE = process.env.MAILING_LIST_TABLE || 'MailingList';
const BROADCASTS_TABLE = process.env.BROADCASTS_TABLE || 'Broadcasts';
const REG_TABLE = process.env.REGISTRATIONS_TABLE || 'ReunionRegistrations';
const ATTACHMENTS_BUCKET = process.env.ATTACHMENTS_BUCKET;
const CONFIG_SET = process.env.SES_CONFIG_SET || 'cfr-email';
const FROM_ADDRESS = process.env.SES_FROM_ADDRESS || 'reunion@churchwellreunion.com';
const FROM_NAME = process.env.SES_FROM_NAME || 'Churchwell Family Reunion';
const REPLY_TO = process.env.SES_REPLY_TO || undefined;
const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://churchwellreunion.com').replace(/\/$/, '');

const MAX_FAILURES_KEPT = 50;
const PROGRESS_EVERY = 10;

exports.handler = async (event) => {
  const broadcastId = event && event.broadcastId;
  if (!broadcastId || broadcastId === 'settings') return { ok: false, error: 'missing broadcastId' };

  // Claim the job: only a 'queued' job is sent, so a duplicate invoke can never double-send.
  let job;
  try {
    const out = await ddb.send(
      new UpdateCommand({
        TableName: BROADCASTS_TABLE,
        Key: { broadcastId },
        UpdateExpression: 'SET #s = :sending, startedAt = :now',
        ConditionExpression: '#s = :queued',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':sending': 'sending', ':queued': 'queued', ':now': new Date().toISOString() },
        ReturnValues: 'ALL_NEW',
      })
    );
    job = out.Attributes;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.warn('Broadcast not queued (already sent or missing):', broadcastId);
      return { ok: false, error: 'not queued' };
    }
    throw err;
  }

  const tally = { recipientCount: 0, sentCount: 0, failedCount: 0, skippedCount: 0, failures: [] };
  try {
    const messages = job.kind === 'signup' ? await buildSignupMessages(job) : await buildBroadcastMessages(job);
    tally.recipientCount = messages.length;
    await saveProgress(broadcastId, tally);

    const attachments = job.kind === 'email' ? await loadAttachments(job.attachments || []) : [];
    const pace = await sendInterval();

    for (let i = 0; i < messages.length; i++) {
      const started = Date.now();
      const m = messages[i];
      try {
        await sendOne({ ...m, attachments });
        tally.sentCount++;
      } catch (err) {
        console.error('Send failed', m.to, err);
        tally.failedCount++;
        if (tally.failures.length < MAX_FAILURES_KEPT) {
          tally.failures.push({ email: m.to, error: String((err && err.message) || err).slice(0, 300) });
        }
      }
      if ((i + 1) % PROGRESS_EVERY === 0) await saveProgress(broadcastId, tally);
      const wait = pace - (Date.now() - started);
      if (wait > 0 && i < messages.length - 1) await sleep(wait);
    }

    const status =
      tally.recipientCount === 0 ? 'skipped' : tally.failedCount === 0 ? 'sent' : tally.sentCount === 0 ? 'failed' : 'partial';
    await saveProgress(broadcastId, tally, status);
    return { ok: true, ...tally, status };
  } catch (err) {
    console.error('Broadcast failed', broadcastId, err);
    tally.failures.push({ email: '', error: String((err && err.message) || err).slice(0, 300) });
    await saveProgress(broadcastId, tally, 'failed');
    return { ok: false, error: String(err) };
  }
};

// ---------- Building messages ----------

/** Admin broadcast: one message per recipient, each with its own unsubscribe link. */
async function buildBroadcastMessages(job) {
  const audience = job.audience || { type: 'test' };
  const recipients = await resolveAudience(audience, job);
  const subject = audience.type === 'test' ? `[TEST] ${job.subject}` : job.subject;
  const inner = renderBody(job.body || '');
  return recipients.map((r) => {
    const unsubscribeUrl = r.unsubToken ? `${SITE_URL}/api/unsubscribe?t=${r.unsubToken}` : null;
    return {
      to: r.email,
      subject,
      html: layout({ inner, unsubscribeUrl }),
      text: `${job.body || ''}\n\n--\n${FROM_NAME}\n${SITE_URL}${unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ''}`,
      unsubscribeUrl,
    };
  });
}

async function resolveAudience(audience, job) {
  if (audience.type === 'test') {
    const email = String(job.createdBy || '').toLowerCase();
    if (!email) return [];
    const row = await getMember(email);
    return [{ email, unsubToken: row && row.unsubToken }];
  }
  if (audience.type === 'everyone') {
    const rows = await scanMembers();
    return rows.filter((r) => r.status === 'subscribed');
  }
  if (audience.type === 'thisYear') {
    const subs = await listSubmissions(String(audience.year || job.year));
    const out = [];
    for (const email of uniqueEmails(subs.map((s) => s.email))) {
      const row = await ensureMember(email, { source: 'registration' });
      if (row.status === 'subscribed') out.push(row);
    }
    return out;
  }
  if (audience.type === 'list') {
    const out = [];
    for (const email of uniqueEmails(audience.emails || [])) {
      const row = await getMember(email);
      if (row && row.status === 'subscribed') out.push(row);
    }
    return out;
  }
  throw new Error(`Unknown audience: ${audience.type}`);
}

/** Sign-up: confirmation to the new sign-up, announcement to everyone else registered this year. */
async function buildSignupMessages(job) {
  const year = String(job.year);
  const sub = await getSubmission(year, job.submissionId);
  if (!sub) throw new Error(`Submission ${job.submissionId} not found`);
  await ddb.send(
    new UpdateCommand({
      TableName: BROADCASTS_TABLE,
      Key: { broadcastId: job.broadcastId },
      UpdateExpression: 'SET submitterName = :n',
      ExpressionAttributeValues: { ':n': sub.submitterName || '' },
    })
  );
  const allSubs = await listSubmissions(year);
  const settings = await getSettings();
  const label = job.reunionLabel || `${year} Churchwell Family Reunion`;
  const families = allSubs.length;
  const people = allSubs.reduce((n, s) => n + ((s.attendees && s.attendees.length) || 0), 0);
  const messages = [];

  const newEmail = sub.email ? sub.email.toLowerCase() : '';
  if (newEmail) {
    const row = await ensureMember(newEmail, { source: 'registration', name: sub.submitterName, personId: sub.submitterPersonId });
    // A confirmation is transactional: send it unless the address bounced or complained.
    if (row.status !== 'bounced' && row.status !== 'complained') {
      messages.push(confirmationMessage(sub, label, row.unsubToken));
    }
  }

  if (settings.announceSignups !== false) {
    const others = uniqueEmails(allSubs.filter((s) => s.submissionId !== sub.submissionId).map((s) => s.email)).filter(
      (e) => e !== newEmail
    );
    for (const email of others) {
      const row = await ensureMember(email, { source: 'registration' });
      if (row.status !== 'subscribed') continue;
      messages.push(announcementMessage(email, sub, label, families, people, row.unsubToken));
    }
  }
  return messages;
}

function confirmationMessage(sub, label, unsubToken) {
  const attendees = sub.attendees || [];
  const attendeeCents = attendees.reduce((n, a) => n + (a.duesCents || 0), 0);
  const total = sub.duesTotalCents || 0;
  const dogCents = Math.max(0, total - attendeeCents);
  const rows = attendees.map((a) => [a.displayName, dollars(a.duesCents || 0)]);
  if (sub.dogs) rows.push([`${sub.dogs} ${sub.dogs === 1 ? 'dog' : 'dogs'}`, dollars(dogCents)]);

  const tableRows = rows
    .map(
      ([name, amt]) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(name)}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${esc(amt)}</td></tr>`
    )
    .join('');
  const inner = `
    <p>Hi ${esc(firstName(sub.submitterName))},</p>
    <p>You're signed up for the <strong>${esc(label)}</strong>. Here's who's coming:</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:12px 0">${tableRows}
      <tr><td style="padding:8px 0;font-weight:bold">Total dues</td><td style="padding:8px 0;text-align:right;font-weight:bold">${esc(dollars(total))}</td></tr>
    </table>
    ${total > 0 ? `<p>You can pay dues on Venmo at <a href="https://venmo.com/churchwellreunion">@churchwellreunion</a>.</p>` : ''}
    <p>Need to change something? Just reply to this email.</p>
    <p>See you there!</p>`;
  const unsubscribeUrl = unsubToken ? `${SITE_URL}/api/unsubscribe?t=${unsubToken}` : null;
  const text = [
    `Hi ${firstName(sub.submitterName)},`,
    '',
    `You're signed up for the ${label}. Here's who's coming:`,
    ...rows.map(([n, a]) => `  - ${n}: ${a}`),
    `Total dues: ${dollars(total)}`,
    total > 0 ? '\nYou can pay dues on Venmo at @churchwellreunion (https://venmo.com/churchwellreunion).' : '',
    '\nNeed to change something? Just reply to this email.',
    '\nSee you there!',
    `\n--\n${FROM_NAME}\n${SITE_URL}`,
  ].join('\n');
  return {
    to: sub.email.toLowerCase(),
    subject: `You're signed up for the ${label}!`,
    html: layout({ inner, unsubscribeUrl }),
    text,
    unsubscribeUrl,
  };
}

function announcementMessage(to, sub, label, families, people, unsubToken) {
  const n = (sub.attendees && sub.attendees.length) || 0;
  const who = `${sub.submitterName} just signed up ${n === 1 ? '1 person' : `${n} people`}`;
  const so = `That makes ${families} ${families === 1 ? 'family' : 'families'} and ${people} ${people === 1 ? 'person' : 'people'} coming so far.`;
  const inner = `
    <p style="font-size:18px"><strong>${esc(who)}</strong> for the ${esc(label)}!</p>
    <p>${esc(so)}</p>
    <p>Haven't signed everyone up yet? <a href="${SITE_URL}/#register">Sign up on the site</a>.</p>`;
  const unsubscribeUrl = unsubToken ? `${SITE_URL}/api/unsubscribe?t=${unsubToken}` : null;
  return {
    to,
    subject: `${sub.submitterName} is coming to the reunion!`,
    html: layout({ inner, unsubscribeUrl }),
    text: `${who} for the ${label}!\n\n${so}\n\nSign up: ${SITE_URL}/#register\n\n--\n${FROM_NAME}${
      unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ''
    }`,
    unsubscribeUrl,
  };
}

// ---------- Sending ----------

async function sendOne({ to, subject, html, text, unsubscribeUrl, attachments }) {
  if (!to) throw new Error('No recipient');
  const mail = {
    from: { name: FROM_NAME, address: FROM_ADDRESS },
    to,
    replyTo: REPLY_TO,
    subject,
    html,
    text,
    attachments: (attachments || []).map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    headers: {},
  };
  if (unsubscribeUrl) {
    // Set directly: MailComposer ignores nodemailer's `list` option (only the full Mailer handles it).
    mail.headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    mail.headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const raw = await new MailComposer(mail).compile().build();
  await sesClient.send(
    new SendEmailCommand({
      Destination: { ToAddresses: [to] },
      Content: { Raw: { Data: raw } },
      ConfigurationSetName: CONFIG_SET,
    })
  );
}

/** Milliseconds between sends, from the account's SES send rate (1/s in the sandbox). */
async function sendInterval() {
  try {
    const acct = await sesClient.send(new GetAccountCommand({}));
    const rate = (acct.SendQuota && acct.SendQuota.MaxSendRate) || 1;
    return Math.ceil(1000 / Math.max(1, rate * 0.8)); // stay under the limit
  } catch (err) {
    console.warn('GetAccount failed; sending at 1/s', err);
    return 1000;
  }
}

async function loadAttachments(list) {
  const out = [];
  for (const a of list) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: ATTACHMENTS_BUCKET, Key: a.key }));
    const content = Buffer.from(await obj.Body.transformToByteArray());
    out.push({ filename: a.filename, contentType: a.contentType || obj.ContentType, content });
  }
  return out;
}

// ---------- Data ----------

async function getMember(email) {
  const out = await ddb.send(new GetCommand({ TableName: MAILING_LIST_TABLE, Key: { email } }));
  return out.Item || null;
}

/** Fetch a mailing-list row, creating it (subscribed) if this address isn't on the list yet. */
async function ensureMember(email, { source, name, personId } = {}) {
  const existing = await getMember(email);
  if (existing) return existing;
  const now = new Date().toISOString();
  const row = {
    email,
    name: name || undefined,
    personId: personId || undefined,
    sources: [source || 'registration'],
    status: 'subscribed',
    unsubToken: randomBytes(16).toString('hex'),
    addedAt: now,
    updatedAt: now,
  };
  try {
    await ddb.send(
      new PutCommand({ TableName: MAILING_LIST_TABLE, Item: row, ConditionExpression: 'attribute_not_exists(email)' })
    );
    return row;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return getMember(email);
    throw err;
  }
}

async function scanMembers() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: MAILING_LIST_TABLE, ExclusiveStartKey }));
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function listSubmissions(year) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: REG_TABLE,
        KeyConditionExpression: '#y = :y AND begins_with(sk, :p)',
        ExpressionAttributeNames: { '#y': 'year' },
        ExpressionAttributeValues: { ':y': year, ':p': 'SUBMISSION#' },
        ExclusiveStartKey,
      })
    );
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function getSubmission(year, submissionId) {
  const out = await ddb.send(new GetCommand({ TableName: REG_TABLE, Key: { year, sk: `SUBMISSION#${submissionId}` } }));
  return out.Item || null;
}

async function getSettings() {
  const out = await ddb.send(new GetCommand({ TableName: BROADCASTS_TABLE, Key: { broadcastId: 'settings' } }));
  return out.Item || {};
}

async function saveProgress(broadcastId, tally, status) {
  const sets = ['recipientCount = :r', 'sentCount = :s', 'failedCount = :f', 'failures = :fl'];
  const vals = { ':r': tally.recipientCount, ':s': tally.sentCount, ':f': tally.failedCount, ':fl': tally.failures };
  const names = {};
  if (status) {
    sets.push('#st = :st', 'finishedAt = :fin');
    vals[':st'] = status;
    vals[':fin'] = new Date().toISOString();
    names['#st'] = 'status';
  }
  await ddb.send(
    new UpdateCommand({
      TableName: BROADCASTS_TABLE,
      Key: { broadcastId },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeValues: vals,
      ...(status ? { ExpressionAttributeNames: names } : {}),
    })
  );
}

// ---------- Rendering ----------

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const dollars = (cents) => (cents === 0 ? 'FREE' : `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`);
const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || 'there';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function uniqueEmails(list) {
  const seen = new Set();
  for (const e of list) {
    const v = String(e || '').trim().toLowerCase();
    if (v && v.includes('@')) seen.add(v);
  }
  return [...seen];
}

/** Admin-typed plain text -> safe HTML: paragraphs, line breaks, **bold**, and clickable links. */
function renderBody(text) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((para) => {
      let h = esc(para.trim());
      h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      h = h.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)'"])/g, '<a href="$1">$1</a>');
      h = h.replace(/\n/g, '<br>');
      return h ? `<p style="margin:0 0 16px">${h}</p>` : '';
    })
    .join('');
}

function layout({ inner, unsubscribeUrl }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1ea">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#222;font-size:16px;line-height:1.5">
        <tr><td align="center" style="background:#1e293b;padding:20px">
          <img src="${SITE_URL}/CFR_LOGO_25.png" alt="Churchwell Family Reunion" width="120" style="display:block;max-width:120px;height:auto;border:0">
        </td></tr>
        <tr><td style="padding:28px 28px 12px">${inner}</td></tr>
        <tr><td style="padding:16px 28px 28px;font-size:12px;color:#777;border-top:1px solid #eee">
          You're getting this because you're on the Churchwell Family Reunion email list.
          Reply to this email to reach the reunion organizers.<br>
          <a href="${SITE_URL}" style="color:#777">churchwellreunion.com</a>
          ${unsubscribeUrl ? ` &middot; <a href="${unsubscribeUrl}" style="color:#777">Unsubscribe</a>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
