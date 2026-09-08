const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

const s3 = new S3Client({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const PHOTO_METADATA_TABLE = process.env.PHOTO_METADATA_TABLE;

// Thumbnail sizes
const SIZES = {
  thumbnail: 200,
  small: 400,
  medium: 800
};

exports.handler = async (event) => {
  try {
    const { file, filename, year, metadata } = JSON.parse(event.body);
    const fileExtension = filename.split('.').pop();
    const photoId = uuidv4();
    
    // Use year if valid, otherwise default to 'NaN' for oldies
    let folder = '2025';
    if (year && !isNaN(Number(year))) {
      folder = year;
    } else if (year) {
      folder = 'NaN';
    }

    // Parse metadata from request
    const photoMetadata = metadata ? JSON.parse(metadata) : {};
    const uploadDate = new Date().toISOString();
    
    // Convert base64 to buffer
    const fileBuffer = Buffer.from(file, 'base64');

    // Upload original image to S3
    const originalKey = `public/photos/${folder}/${photoId}.${fileExtension}`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: originalKey,
      Body: fileBuffer,
      ContentType: 'image/' + fileExtension,
      Metadata: {
        originalName: filename,
        caption: photoMetadata.caption || '',
        uploader: photoMetadata.uploader || '',
        date: photoMetadata.date || ''
      }
    }));

    // Generate and upload thumbnails
    const availableSizes = ['original'];
    for (const [sizeName, width] of Object.entries(SIZES)) {
      try {
        const resizedBuffer = await sharp(fileBuffer)
          .rotate() // Auto-rotate based on EXIF orientation
          .resize(width, null, { 
            withoutEnlargement: true,
            fit: 'inside'
          })
          .jpeg({ quality: 85, progressive: true })
          .toBuffer();
          
        const thumbnailKey = `public/photos/${folder}/${photoId}-${sizeName}.jpg`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: thumbnailKey,
          Body: resizedBuffer,
          ContentType: 'image/jpeg',
          CacheControl: 'public, max-age=31536000' // 1 year cache
        }));
        
        availableSizes.push(sizeName);
        console.log(`Generated ${sizeName} thumbnail`);
      } catch (err) {
        console.error(`Failed to generate ${sizeName} thumbnail:`, err);
      }
    }

    // Store metadata in DynamoDB
    const dynamoItem = {
      year: folder,
      photoId: photoId,
      caption: photoMetadata.caption || '',
      uploader: photoMetadata.uploader || '',
      date: photoMetadata.date || '',
      uploadDate: uploadDate,
      filename: filename,
      fileExtension: fileExtension,
      s3Key: originalKey,
      sizes: availableSizes
    };

    if (!PHOTO_METADATA_TABLE) {
      throw new Error('PHOTO_METADATA_TABLE not configured; photo was uploaded to S3 but will not appear in the gallery');
    }

    try {
      await docClient.send(new PutCommand({
        TableName: PHOTO_METADATA_TABLE,
        Item: dynamoItem
      }));
    } catch (err) {
      console.error('Photo uploaded to S3 but DynamoDB metadata write failed:', err);
      throw new Error(`Photo uploaded to S3 but failed to save metadata: ${err.message}`);
    }

    // Generate public URL
    const photoUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${originalKey}`;

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
          url: photoUrl,
          sizes: availableSizes
        }
      })
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};