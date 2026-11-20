// SES bounce / complaint events (via EventBridge) -> mark the address on the mailing list
// so the admin console shows it and broadcasts skip it. SES's own account suppression
// list also stops sends to these addresses; this keeps our list in sync with it.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }));
const MAILING_LIST_TABLE = process.env.MAILING_LIST_TABLE || 'MailingList';

exports.handler = async (event) => {
  const detail = (event && event.detail) || {};
  let status = null;
  let emails = [];
  let reason = '';

  if (detail.eventType === 'Bounce' && detail.bounce) {
    // Transient bounces (mailbox full, etc.) will be retried by the next send; only permanent ones stick.
    if (detail.bounce.bounceType !== 'Permanent') return { skipped: 'transient bounce' };
    status = 'bounced';
    emails = (detail.bounce.bouncedRecipients || []).map((r) => r.emailAddress);
    reason = detail.bounce.bounceSubType || 'Permanent';
  } else if (detail.eventType === 'Complaint' && detail.complaint) {
    status = 'complained';
    emails = (detail.complaint.complainedRecipients || []).map((r) => r.emailAddress);
    reason = detail.complaint.complaintFeedbackType || 'complaint';
  } else {
    return { skipped: detail.eventType || 'unknown' };
  }

  const now = new Date().toISOString();
  for (const raw of emails) {
    const email = String(raw || '').trim().toLowerCase();
    if (!email) continue;
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: MAILING_LIST_TABLE,
          Key: { email },
          UpdateExpression: 'SET #s = :s, statusReason = :r, updatedAt = :now',
          ConditionExpression: 'attribute_exists(email)',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':s': status, ':r': reason, ':now': now },
        })
      );
      console.log(`Marked ${email} as ${status} (${reason})`);
    } catch (err) {
      if (err.name !== 'ConditionalCheckFailedException') throw err;
      console.warn('Not on mailing list:', email);
    }
  }
  return { status, count: emails.length };
};
