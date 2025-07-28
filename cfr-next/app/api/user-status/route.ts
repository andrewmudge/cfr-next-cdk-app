import { NextRequest, NextResponse } from 'next/server';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const APPROVED_EMAILS_TABLE = 'ApprovedEmails';


// Get all approved emails (users)
export async function GET() {
  try {
    // Skip database calls during build time
    if (process.env.NODE_ENV === 'production' && !process.env.AWS_EXECUTION_ENV) {
      console.log('🔍 API: Skipping database call during build time');
      return NextResponse.json([], {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

    const result = await docClient.send(new ScanCommand({
      TableName: APPROVED_EMAILS_TABLE
    }));

    const users = (result.Items || []) as { registrationDate?: string }[];
    // Optionally sort by registrationDate if present
    if (users.length > 1 && users[0].registrationDate) {
      users.sort((a, b) => {
        if (a.registrationDate && b.registrationDate) {
          return new Date(b.registrationDate).getTime() - new Date(a.registrationDate).getTime();
        }
        return 0;
      });
    }
    return NextResponse.json(users, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('🔍 API: Error fetching approved emails:', error);
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'Database connection failed. Please check authentication.'
      : 'Failed to fetch approved emails';
    return NextResponse.json(
      { error: errorMessage, details: String(error) },
      { status: 500 }
    );
  }
}


// Update user status (approve/deny)
export async function PATCH(request: NextRequest) {
  try {
    const { id, status, denialReason } = await request.json();
    if (!id || !status) {
      return NextResponse.json(
        { error: 'ID and status are required' },
        { status: 400 }
      );
    }
    // Prepare update data and expressions
    const updateData: Record<string, string> = { status };
    let updateExpression = 'set #status = :status';
    const expressionAttributeNames: Record<string, string> = { '#status': 'status' };
    const expressionAttributeValues: Record<string, string> = { ':status': status };
    if (status === 'approved') {
      updateData.approvalDate = new Date().toISOString();
      updateExpression += ', #approvalDate = :approvalDate';
      expressionAttributeNames['#approvalDate'] = 'approvalDate';
      expressionAttributeValues[':approvalDate'] = updateData.approvalDate;
    }
    if (status === 'denied') {
      updateData.denialDate = new Date().toISOString();
      updateExpression += ', #denialDate = :denialDate';
      expressionAttributeNames['#denialDate'] = 'denialDate';
      expressionAttributeValues[':denialDate'] = updateData.denialDate;
      if (denialReason) {
        updateData.denialReason = denialReason;
        updateExpression += ', #denialReason = :denialReason';
        expressionAttributeNames['#denialReason'] = 'denialReason';
        expressionAttributeValues[':denialReason'] = updateData.denialReason;
      }
    }
    await docClient.send(new UpdateCommand({
      TableName: APPROVED_EMAILS_TABLE,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    }));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update user status', details: String(error) },
      { status: 500 }
    );
  }
}
