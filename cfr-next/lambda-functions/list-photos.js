const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const PHOTO_METADATA_TABLE = process.env.PHOTO_METADATA_TABLE;

exports.handler = async (event) => {
  try {
    const year = event.queryStringParameters?.year;
    
    if (!year) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Year parameter required' })
      };
    }

    // Query DynamoDB for photos by year
    const result = await docClient.send(new QueryCommand({
      TableName: PHOTO_METADATA_TABLE,
      KeyConditionExpression: '#year = :year',
      ExpressionAttributeNames: {
        '#year': 'year'
      },
      ExpressionAttributeValues: {
        ':year': year
      }
    }));

    // Transform DynamoDB items to photo objects
    const photos = (result.Items || []).map(item => ({
      id: item.photoId,
      url: `https://d3h0xsdn3j96uc.cloudfront.net/public/photos/${item.year}/${item.photoId}.${item.fileExtension || 'jpg'}`,
      thumbnailUrl: `https://d3h0xsdn3j96uc.cloudfront.net/public/photos/${item.year}/${item.photoId}-thumbnail.jpg`,
      smallUrl: `https://d3h0xsdn3j96uc.cloudfront.net/public/photos/${item.year}/${item.photoId}-small.jpg`,
      mediumUrl: `https://d3h0xsdn3j96uc.cloudfront.net/public/photos/${item.year}/${item.photoId}-medium.jpg`,
      caption: item.caption || '',
      uploader: item.uploader || '',
      date: item.date || '',
      year: isNaN(parseInt(item.year)) ? 0 : parseInt(item.year),
      sizes: item.sizes || ['original']
    }));

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
      body: JSON.stringify(photos)
    };
  } catch (error) {
    console.error('List photos error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};