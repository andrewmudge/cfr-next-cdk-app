const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const sharp = require('sharp');

const s3 = new S3Client({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const PHOTO_METADATA_TABLE = process.env.PHOTO_METADATA_TABLE || 'PhotoMetadata';
const YEAR = process.env.YEAR || '2023';

const SIZES = {
  thumbnail: 200,
  small: 400,
  medium: 800
};

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function generateThumbnails() {
  console.log(`Starting thumbnail generation for ${YEAR} photos...`);
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Table: ${PHOTO_METADATA_TABLE}`);
  
  try {
    // List all objects in the year folder
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: `public/photos/${YEAR}/`
    }));

    // Filter for original photos only (no existing thumbnails)
    const originalPhotos = (listResult.Contents || []).filter(obj => 
      !obj.Key.includes('-thumbnail') && 
      !obj.Key.includes('-small') && 
      !obj.Key.includes('-medium')
    );
    
    console.log(`Found ${originalPhotos.length} original photos to process`);

    let processedCount = 0;
    let errorCount = 0;

    for (const obj of originalPhotos) {
      try {
        // Extract photoId and extension from key
        const keyParts = obj.Key.split('/');
        const photoIdWithExt = keyParts[keyParts.length - 1];
        const photoId = photoIdWithExt.split('.')[0];
        const fileExtension = photoIdWithExt.split('.').pop();

        console.log(`Processing ${photoId}...`);

        // Download original photo
        const getResult = await s3.send(new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key
        }));

        const fileBuffer = await streamToBuffer(getResult.Body);

        // Generate thumbnails
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
              
            const thumbnailKey = `public/photos/${YEAR}/${photoId}-${sizeName}.jpg`;
            await s3.send(new PutObjectCommand({
              Bucket: BUCKET_NAME,
              Key: thumbnailKey,
              Body: resizedBuffer,
              ContentType: 'image/jpeg',
              CacheControl: 'public, max-age=31536000'
            }));
            
            availableSizes.push(sizeName);
          } catch (err) {
            console.error(`  ✗ Failed to generate ${sizeName}:`, err.message);
          }
        }

        // Update DynamoDB with sizes
        await docClient.send(new UpdateCommand({
          TableName: PHOTO_METADATA_TABLE,
          Key: {
            year: YEAR,
            photoId: photoId
          },
          UpdateExpression: 'SET sizes = :sizes',
          ExpressionAttributeValues: {
            ':sizes': availableSizes
          }
        }));

        processedCount++;
        console.log(`  ✓ Generated thumbnails for ${photoId} (${processedCount}/${originalPhotos.length})`);
      } catch (error) {
        errorCount++;
        console.error(`  ✗ Failed to process ${obj.Key}:`, error.message);
      }
    }

    console.log('\n=== Thumbnail Generation Complete ===');
    console.log(`Successfully processed: ${processedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total: ${originalPhotos.length}`);
  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    process.exit(1);
  }
}

// Run generation
if (!BUCKET_NAME) {
  console.error('Error: S3_BUCKET_NAME environment variable is required');
  console.log('Usage: YEAR=2023 S3_BUCKET_NAME=your-bucket-name node generate-thumbnails.js');
  process.exit(1);
}

generateThumbnails().then(() => {
  console.log('\nThumbnail generation script finished');
  process.exit(0);
}).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
