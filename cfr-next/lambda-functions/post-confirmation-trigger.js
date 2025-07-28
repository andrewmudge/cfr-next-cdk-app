const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { randomUUID } = require('crypto');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

// No longer using UserStatus table
const APPROVED_USERS_TABLE = 'ApprovedEmails'; // Use the main app's ApprovedEmails table
const SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:122610511543:cfr-signup-notification';

exports.handler = async (event) => {
  console.log('=== PostConfirmation Trigger Started ===');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const { userAttributes, userName } = event.request;
    const email = userAttributes.email.toLowerCase();
    const givenName = userAttributes.given_name || '';
    const familyName = userAttributes.family_name || '';
    const phoneNumber = userAttributes.phone_number || '';

    console.log('Processing user:', { email, userName, givenName, familyName });

    // Check if user is in the approved list (your existing table)
    const isPreApproved = await checkIfEmailApproved(email);
    console.log('Pre-approval check result:', isPreApproved);


    // Only send SNS notification if user is NOT pre-approved
    if (!isPreApproved) {
      // Build a minimal user record for notification
      const userRecord = {
        email,
        givenName,
        familyName,
        phoneNumber,
        status: 'pending',
      };
      await sendNotification(userRecord);
    }

    // Return the event (required for Cognito triggers)
    return event;

  } catch (error) {
    console.error('Error in PostConfirmation trigger:', error);
    // Don't throw error - this would prevent user confirmation
    // Just log and continue
    return event;
  }
};

async function checkIfEmailApproved(email) {
  try {
    console.log('Checking if email is pre-approved:', email);
    // Scan the ApprovedEmails table for the email (case-insensitive, try lower and original)
    const scanLower = await docClient.send(new (require('@aws-sdk/lib-dynamodb').ScanCommand)({
      TableName: APPROVED_USERS_TABLE,
      FilterExpression: '#email = :email',
      ExpressionAttributeNames: { '#email': 'email' },
      ExpressionAttributeValues: { ':email': email.toLowerCase() }
    }));
    if (scanLower.Items && scanLower.Items.length > 0) {
      console.log('Pre-approval result: found (lowercase)', { email });
      return true;
    }
    const scanOrig = await docClient.send(new (require('@aws-sdk/lib-dynamodb').ScanCommand)({
      TableName: APPROVED_USERS_TABLE,
      FilterExpression: '#email = :email',
      ExpressionAttributeNames: { '#email': 'email' },
      ExpressionAttributeValues: { ':email': email }
    }));
    const isApproved = scanOrig.Items && scanOrig.Items.length > 0;
    console.log('Pre-approval result:', { email, isApproved, recordsFound: scanOrig.Items?.length });
    return isApproved;
  } catch (error) {
    console.error('Error checking pre-approval:', error);
    // Default to pending if check fails
    return false;
  }
}

async function sendNotification(userRecord) {
  try {
    console.log('Attempting to send SNS notification...');
    
    const statusText = userRecord.status === 'approved' ? 'Account: Active' : 'Account: Pending';
    const message = `New user has confirmed their email:

Name: ${userRecord.givenName} ${userRecord.familyName}
Email: ${userRecord.email}
Phone: ${userRecord.phoneNumber}
Status: ${statusText}

Please review at: https://churchwellreunion.com/admin
`;

    const response = await snsClient.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Message: message,
      Subject: `CFR New User Signup - ${statusText}`
    }));

    console.log('SNS response:', response);
    console.log('SNS notification sent successfully');
    
  } catch (error) {
    console.error('SNS error:', error);
    console.error('Error type:', typeof error);
    // Don't throw - we don't want SNS failures to break user confirmation
  }
}
