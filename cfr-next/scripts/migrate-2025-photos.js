const { S3Client, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const s3 = new S3Client({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const PHOTO_METADATA_TABLE = process.env.PHOTO_METADATA_TABLE || 'PhotoMetadata';
const YEAR = process.env.YEAR || '2025';

async function migrate() {
  console.log(`Starting migration for ${YEAR} photos...`);
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Table: ${PHOTO_METADATA_TABLE}`);
  
  try {
    // List all objects in the 2025 folder
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: `public/photos/${YEAR}/`
    }));

    const objects = listResult.Contents || [];
    console.log(`Found ${objects.length} photos to migrate`);

    let migratedCount = 0;
    let errorCount = 0;

    for (const obj of objects) {
      try {
        // Get S3 object metadata
        const headResult = await s3.send(new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key
        }));

        // Extract photoId from key (public/photos/2025/photoId.ext)
        const keyParts = obj.Key.split('/');
        const photoIdWithExt = keyParts[keyParts.length - 1];
        const photoId = photoIdWithExt.split('.')[0];
        const fileExtension = photoIdWithExt.split('.').pop();

        // Build DynamoDB item from S3 metadata
        const dynamoItem = {
          year: YEAR,
          photoId: photoId,
          caption: headResult.Metadata?.caption || '',
          uploader: headResult.Metadata?.uploader || '',
          date: headResult.Metadata?.date || '',
          uploadDate: obj.LastModified?.toISOString() || new Date().toISOString(),
          filename: headResult.Metadata?.originalname || photoIdWithExt,
          fileExtension: fileExtension,
          s3Key: obj.Key
        };

        // Write to DynamoDB
        await docClient.send(new PutCommand({
          TableName: PHOTO_METADATA_TABLE,
          Item: dynamoItem
        }));

        migratedCount++;
        console.log(`✓ Migrated ${photoId} (${migratedCount}/${objects.length})`);
      } catch (error) {
        errorCount++;
        console.error(`✗ Failed to migrate ${obj.Key}:`, error.message);
      }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total: ${objects.length}`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
if (!BUCKET_NAME) {
  console.error('Error: S3_BUCKET_NAME environment variable is required');
  console.log('Usage: S3_BUCKET_NAME=your-bucket-name node migrate-2025-photos.js');
  process.exit(1);
}

migrate().then(() => {
  console.log('\nMigration script finished');
  process.exit(0);
}).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
