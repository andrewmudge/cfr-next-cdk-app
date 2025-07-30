const { S3Client, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

exports.handler = async (event) => {
  try {
    const year = event.queryStringParameters?.year;
    let prefix;
    if (year) {
      prefix = `public/photos/${year}/`;
    } else {
      prefix = 'public/photos/';
    }

    const listParams = {
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    };

    const data = await s3.send(new ListObjectsV2Command(listParams));

    // If no photos, return an empty array
    const contents = data.Contents || [];
    const photos = await Promise.all(
      contents.map(async (object) => {
        const headParams = {
          Bucket: BUCKET_NAME,
          Key: object.Key,
        };

        const metadata = await s3.send(new HeadObjectCommand(headParams));
        const photoId = object.Key.split('/').pop().split('.')[0];

        return {
          id: photoId,
          url: `https://d3h0xsdn3j96uc.cloudfront.net/${object.Key}`,
          caption: metadata.Metadata.caption || '',
          uploader: metadata.Metadata.uploader || '',
          date: metadata.Metadata.date || '',
          year: parseInt(metadata.Metadata.year || (year || '0'))
        };
      })
    );

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify(photos)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};