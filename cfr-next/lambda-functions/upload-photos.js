const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

exports.handler = async (event) => {
  try {
    const { file, filename, year } = JSON.parse(event.body);
    const fileExtension = filename.split('.').pop();
    const photoId = uuidv4();
    // Use year if valid, otherwise default to 'NaN' for oldies
    let folder = '2025';
    if (year && !isNaN(Number(year))) {
      folder = year;
    } else if (year) {
      folder = 'NaN';
    }
    const s3Key = `public/photos/${folder}/${photoId}.${fileExtension}`;

    // Upload image to S3
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: Buffer.from(file, 'base64'),
      ContentType: 'image/' + fileExtension,
      Metadata: {
        originalName: filename
      }
    };
    await s3.send(new PutObjectCommand(uploadParams));

    // Generate public URL
    const photoUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${s3Key}`;

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({
        success: true,
        photo: {
          id: photoId,
          url: photoUrl
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};