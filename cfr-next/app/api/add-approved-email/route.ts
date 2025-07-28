import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const APPROVED_EMAILS_TABLE = 'ApprovedEmails';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    // Add email to DynamoDB table
    await docClient.send(new PutCommand({
      TableName: APPROVED_EMAILS_TABLE,
      Item: {
        email: email.toLowerCase(),
        status: 'approved',
        approvalDate: new Date().toISOString(),
      },
    }));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add approved email', details: String(error) }, { status: 500 });
  }
}
