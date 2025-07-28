import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Create DynamoDB client for server-side usage with IAM user credentials (from environment or default provider chain)
const client = new DynamoDBClient({
  region: 'us-east-1',
  // credentials will be automatically picked up from environment variables or AWS config
});

const docClient = DynamoDBDocumentClient.from(client);

// Get the table name from environment or use the correct default
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'ApprovedEmails';
console.log('🔍 Using DynamoDB table:', TABLE_NAME);

export interface ApprovedUserRecord {
  id: string;
  email: string;
  givenName: string;
  familyName: string;
  phoneNumber?: string;
  isActive: boolean;
  createdDate: string;
}

export const checkUserApprovalServer = async (email: string): Promise<boolean> => {
  try {
    console.warn('🔍 SERVER: Checking approval for email:', email);
    console.warn('🔍 SERVER: Table name:', TABLE_NAME);
    
    // First try to query with lowercase email
    const scanCommand = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: '#email = :email',
      ExpressionAttributeNames: {
        '#email': 'email'
      },
      ExpressionAttributeValues: {
        ':email': email.toLowerCase()
      }
    });
    
    const result = await docClient.send(scanCommand);
    console.warn('🔍 SERVER: DynamoDB scan result:', result);
    
    if (result.Items && result.Items.length > 0) {
      const user = result.Items[0];
      console.warn('🔍 SERVER: Found user:', user);
      return true;
    }
    
    // If not found with lowercase, try original case
    const scanCommand2 = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: '#email = :email',
      ExpressionAttributeNames: {
        '#email': 'email'
      },
      ExpressionAttributeValues: {
        ':email': email
      }
    });
    
    const result2 = await docClient.send(scanCommand2);
    console.warn('🔍 SERVER: DynamoDB scan result (original case):', result2);
    
    if (result2.Items && result2.Items.length > 0) {
      const user = result2.Items[0];
      console.warn('🔍 SERVER: Found user (original case):', user);
      return true;
    }
    
    // If still not found, scan all records for debugging
    const scanAllCommand = new ScanCommand({
      TableName: TABLE_NAME
    });
    
    const allResult = await docClient.send(scanAllCommand);
    console.warn('🔍 SERVER: All records in table:', allResult.Items);
    
    return false;
  } catch (error) {
    console.error('🔍 SERVER: Error checking user approval:', error);
    return false;
  }
};

export const getAllApprovedUsersServer = async (): Promise<ApprovedUserRecord[]> => {
  try {
    const scanCommand = new ScanCommand({
      TableName: TABLE_NAME
    });
    
    const result = await docClient.send(scanCommand);
    return (result.Items || []) as ApprovedUserRecord[];
  } catch (error) {
    console.error('🔍 SERVER: Error getting all approved users:', error);
    return [];
  }
};
