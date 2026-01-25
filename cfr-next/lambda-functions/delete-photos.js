const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const s3 = new S3Client({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const PHOTO_METADATA_TABLE = process.env.PHOTO_METADATA_TABLE;

exports.handler = async (event) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const keys = body.keys;
    
    if (!Array.isArray(keys) || keys.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'No photo keys provided' })
      };
    }

    // Delete from both S3 and DynamoDB
    for (const key of keys) {
      // Delete from S3
      await s3.send(new DeleteObjectCommand({ 
        Bucket: BUCKET_NAME, 
        Key: key 
      }));

      // Extract year and photoId from S3 key (format: public/photos/{year}/{photoId}.ext)
      const keyParts = key.split('/');
      if (keyParts.length >= 4) {
        const year = keyParts[2];
        const photoIdWithExt = keyParts[3];
        const photoId = photoIdWithExt.split('.')[0];

        // Delete from DynamoDB
        await docClient.send(new DeleteCommand({
          TableName: PHOTO_METADATA_TABLE,
          Key: {
            year: year,
            photoId: photoId
          }
        }));
      }
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Delete error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};
