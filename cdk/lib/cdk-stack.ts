import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Stack, StackProps, CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as apprunner from '@aws-cdk/aws-apprunner-alpha';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class CfrNextStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 Bucket
    const bucket = new s3.Bucket(this, 'CfrPhotoBucket', {
      // The admin console uploads email attachments straight from the browser (presigned PUT);
      // the Churchwell Chronicle form uploads photos the same way (presigned POST, size-capped).
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: [
            'https://churchwellreunion.com',
            'https://www.churchwellreunion.com',
            'https://*.vercel.app',
            'http://localhost:3000',
          ],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        // Attachments are only needed while a send runs; keep them a month for re-sends.
        { id: 'ExpireEmailAttachments', prefix: 'email-attachments/', expiration: Duration.days(30) },
      ],
    });

    // Add bucket policy for public read access to photos
    bucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowPublicReadForPhotos',
      effect: iam.Effect.ALLOW,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:GetObject'],
      resources: [
        bucket.arnForObjects('public/photos/*'),
        // Finalized Churchwell Chronicle PDFs (photos under chronicle/ stay private).
        bucket.arnForObjects('public/chronicle/*'),
      ],
    }));

    // DynamoDB Table for approved users
    const approvedUsersTable = new dynamodb.Table(this, 'ApprovedEmails', {
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      tableName: 'ApprovedEmails'
    });

    // DynamoDB Table for photo metadata
    const photoMetadataTable = new dynamodb.Table(this, 'PhotoMetadata', {
      partitionKey: { name: 'year', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'photoId', type: dynamodb.AttributeType.STRING },
      tableName: 'PhotoMetadata'
    });

    // DynamoDB Table: family members used for sign-up name autocomplete
    const familyMembersTable = new dynamodb.Table(this, 'FamilyMembers', {
      partitionKey: { name: 'personId', type: dynamodb.AttributeType.STRING },
      tableName: 'FamilyMembers',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      // The family tree is edited on the site; this lets us restore the table to any point in the last 35 days.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // DynamoDB Table: reunion registrations (year + PERSON#id / SUBMISSION#id)
    const registrationsTable = new dynamodb.Table(this, 'ReunionRegistrations', {
      partitionKey: { name: 'year', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      tableName: 'ReunionRegistrations',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // DynamoDB Table: Churchwell Chronicle newsletter (issueId + ENTRY#… / META)
    const chronicleTable = new dynamodb.Table(this, 'ChronicleEntries', {
      partitionKey: { name: 'issueId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      tableName: 'ChronicleEntries',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // ---------- Email (SES) ----------

    // The master email list: the source of truth for family-wide emails.
    const mailingListTable = new dynamodb.Table(this, 'MailingList', {
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      tableName: 'MailingList',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });
    // Unsubscribe links carry a random token, looked up here.
    mailingListTable.addGlobalSecondaryIndex({
      indexName: 'byUnsubToken',
      partitionKey: { name: 'unsubToken', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    // Email send history + status (and one 'settings' item).
    const broadcastsTable = new dynamodb.Table(this, 'Broadcasts', {
      partitionKey: { name: 'broadcastId', type: dynamodb.AttributeType.STRING },
      tableName: 'Broadcasts',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const EMAIL_DOMAIN = 'churchwellreunion.com';
    // DNS for this domain is hosted at Vercel: the DKIM CNAMEs and MAIL FROM MX/TXT
    // records shown in the SES console must be added there by hand.
    const emailIdentity = new ses.EmailIdentity(this, 'EmailDomainIdentity', {
      identity: ses.Identity.domain(EMAIL_DOMAIN),
      mailFromDomain: `mail.${EMAIL_DOMAIN}`,
      dkimSigning: true,
    });

    const emailConfigSet = new ses.ConfigurationSet(this, 'EmailConfigSet', {
      configurationSetName: 'cfr-email',
      suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
      // VDM engagement tracking is on at the account level; it rewrites links through
      // awstrack.me and adds a tracking pixel, which hurts deliverability for a new domain.
      vdmOptions: { engagementMetrics: false },
    });
    const defaultBus = events.EventBus.fromEventBusName(this, 'DefaultEventBus', 'default');
    emailConfigSet.addEventDestination('BouncesAndComplaints', {
      destination: ses.EventDestination.eventBus(defaultBus),
      events: [ses.EmailSendingEvent.BOUNCE, ses.EmailSendingEvent.COMPLAINT],
    });

    const configSetArn = `arn:aws:ses:${this.region}:${this.account}:configuration-set/${emailConfigSet.configurationSetName}`;
    const sesSendPolicy = new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: [emailIdentity.emailIdentityArn, configSetArn],
    });

    const lambdaCode = lambda.Code.fromAsset(path.join(__dirname, '../../cfr-next/lambda-functions'));

    // Sends admin broadcasts and sign-up emails. Invoked asynchronously by the Next.js app.
    const sendBroadcastFn = new lambda.Function(this, 'SendBroadcastFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'send-broadcast.handler',
      code: lambdaCode,
      environment: {
        MAILING_LIST_TABLE: mailingListTable.tableName,
        BROADCASTS_TABLE: broadcastsTable.tableName,
        REGISTRATIONS_TABLE: 'ReunionRegistrations',
        ATTACHMENTS_BUCKET: bucket.bucketName,
        SES_CONFIG_SET: emailConfigSet.configurationSetName,
        SES_FROM_ADDRESS: `reunion@${EMAIL_DOMAIN}`,
        SES_FROM_NAME: 'Churchwell Family Reunion',
        SES_REPLY_TO: 'mudge.andrew@gmail.com',
        PUBLIC_SITE_URL: `https://www.${EMAIL_DOMAIN}`, // www is canonical; the bare domain redirects
      },
      timeout: Duration.minutes(15),
      memorySize: 1024,
      retryAttempts: 0, // never double-send; failures are recorded on the Broadcast row
    });
    sendBroadcastFn.addToRolePolicy(sesSendPolicy);
    sendBroadcastFn.addToRolePolicy(new iam.PolicyStatement({ actions: ['ses:GetAccount'], resources: ['*'] }));
    mailingListTable.grantReadWriteData(sendBroadcastFn);
    broadcastsTable.grantReadWriteData(sendBroadcastFn);
    bucket.grantRead(sendBroadcastFn, 'email-attachments/*');
    sendBroadcastFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem', 'dynamodb:Query'],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/ReunionRegistrations`],
    }));

    // Marks bounced / complained addresses on the mailing list.
    const emailEventsFn = new lambda.Function(this, 'EmailEventsFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'email-events.handler',
      code: lambdaCode,
      environment: { MAILING_LIST_TABLE: mailingListTable.tableName },
      timeout: Duration.seconds(30),
    });
    mailingListTable.grantReadWriteData(emailEventsFn);
    new events.Rule(this, 'SesBounceComplaintRule', {
      eventPattern: { source: ['aws.ses'], detailType: ['Email Bounced', 'Email Complaint Received'] },
      targets: [new targets.LambdaFunction(emailEventsFn)],
    });

    new CfnOutput(this, 'SendBroadcastFunctionName', { value: sendBroadcastFn.functionName });
    new CfnOutput(this, 'AttachmentsBucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'EmailIdentityName', { value: emailIdentity.emailIdentityName });

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'CfrUserPool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });


    // Lambda for listing photos
    const listPhotosFn = new lambda.Function(this, 'ListPhotosFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'list-photos.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../cfr-next/lambda-functions')),
      environment: {
        S3_BUCKET_NAME: bucket.bucketName,
        PHOTO_METADATA_TABLE: photoMetadataTable.tableName,
      },
      timeout: Duration.seconds(30),
    });
    bucket.grantRead(listPhotosFn);
    photoMetadataTable.grantReadData(listPhotosFn);
    // Public invoke permission for Lambda Function URL
    new lambda.CfnPermission(this, 'ListPhotosFnUrlPublicInvoke', {
      action: 'lambda:InvokeFunctionUrl',
      functionName: listPhotosFn.functionName,
      principal: '*',
      functionUrlAuthType: 'NONE',
    });

    // Lambda for deleting photos
    const deletePhotosFn = new lambda.Function(this, 'DeletePhotosFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'delete-photos.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../cfr-next/lambda-functions')),
      environment: {
        S3_BUCKET_NAME: bucket.bucketName,
        PHOTO_METADATA_TABLE: photoMetadataTable.tableName,
      },
      timeout: Duration.seconds(30),
    });
    bucket.grantDelete(deletePhotosFn);
    photoMetadataTable.grantWriteData(deletePhotosFn);
    // Public invoke permission for Lambda Function URL
    new lambda.CfnPermission(this, 'DeletePhotosFnUrlPublicInvoke', {
      action: 'lambda:InvokeFunctionUrl',
      functionName: deletePhotosFn.functionName,
      principal: '*',
      functionUrlAuthType: 'NONE',
    });


    // Lambda for listing and deleteing Cognito users
    const listCognitoUsersFn = new lambda.Function(this, 'ListCognitoUsersFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'list-cognito-users.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../cfr-next/lambda-functions')),
      environment: {
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        // AWS_REGION is automatically set by Lambda runtime
      },
      timeout: Duration.seconds(30),
    });
    // IAM permissions for Cognito ListUsers and DeleteUsers
    listCognitoUsersFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:ListUsers', 'cognito-idp:AdminDeleteUser'],
      resources: [userPool.userPoolArn],
    }));
    // Public invoke permission for Lambda Function URL
    new lambda.CfnPermission(this, 'ListCognitoUsersFnUrlPublicInvoke', {
      action: 'lambda:InvokeFunctionUrl',
      functionName: listCognitoUsersFn.functionName,
      principal: '*',
      functionUrlAuthType: 'NONE',
    });

    // Lambda for uploading photos
    const uploadPhotosFn = new lambda.Function(this, 'UploadPhotosFn', {
    runtime: lambda.Runtime.NODEJS_20_X,
    handler: 'upload-photos.handler',
    code: lambda.Code.fromAsset(path.join(__dirname, '../../cfr-next/lambda-functions')),
    environment: {
      S3_BUCKET_NAME: bucket.bucketName,
      PHOTO_METADATA_TABLE: photoMetadataTable.tableName,
    },
    timeout: Duration.seconds(60),
    memorySize: 1536, // Increased for image processing with sharp
  });
  bucket.grantReadWrite(uploadPhotosFn);
  photoMetadataTable.grantWriteData(uploadPhotosFn);
  // Public invoke permission for Lambda Function URL
  new lambda.CfnPermission(this, 'UploadPhotosFnUrlPublicInvoke', {
    action: 'lambda:InvokeFunctionUrl',
    functionName: uploadPhotosFn.functionName,
    principal: '*',
    functionUrlAuthType: 'NONE',
  });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
      authFlows: { userPassword: true, userSrp: true },
    });

    new CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });

    // App Runner Role
    const appRunnerRole = new iam.Role(this, 'AppRunnerServiceRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
    });

    bucket.grantReadWrite(appRunnerRole);
    approvedUsersTable.grantReadWriteData(appRunnerRole);
    familyMembersTable.grantReadWriteData(appRunnerRole);
    registrationsTable.grantReadWriteData(appRunnerRole);

    // The Next.js app talks to DynamoDB with the cfr-dev IAM user's access keys,
    // so it also needs read/write on the sign-up tables.
    const cfrDevUser = iam.User.fromUserName(this, 'CfrDevUser', 'cfr-dev');
    familyMembersTable.grantReadWriteData(cfrDevUser);
    registrationsTable.grantReadWriteData(cfrDevUser);
    // ...and to the email list, send history, attachment uploads and queueing sends.
    mailingListTable.grantReadWriteData(cfrDevUser);
    broadcastsTable.grantReadWriteData(cfrDevUser);
    bucket.grantPut(cfrDevUser, 'email-attachments/*');
    // ...and to the Churchwell Chronicle: entries, uploaded photos and finalized PDFs.
    chronicleTable.grantReadWriteData(cfrDevUser);
    bucket.grantReadWrite(cfrDevUser, 'chronicle/*');
    bucket.grantReadWrite(cfrDevUser, 'public/chronicle/*');
    sendBroadcastFn.grantInvoke(cfrDevUser);

    // App Runner Service (placeholder image initially)
    new apprunner.Service(this, 'MyNextAppService', {
      source: apprunner.Source.fromEcrPublic({
        imageConfiguration: { port: 3000 },
        imageIdentifier: 'public.ecr.aws/aws-containers/hello-app-runner:latest',
      }),
      accessRole: appRunnerRole,

    });
    // SNS Topic (reference existing)
    const signupNotificationTopic = sns.Topic.fromTopicArn(this, 'SignupNotificationTopic', 'arn:aws:sns:us-east-1:122610511543:cfr-signup-notification');
    // Lambda for Cognito Post Confirmation Trigger
    const postConfirmationFn = new lambda.Function(this, 'CfrPostConfirmationFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'post-confirmation-trigger.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../cfr-next/lambda-functions')),
      environment: {
        APPROVED_USERS_TABLE: approvedUsersTable.tableName,
        SNS_TOPIC_ARN: signupNotificationTopic.topicArn,
      },
      timeout: Duration.seconds(30),
    });

    // Grant Lambda access to DynamoDB and SNS
    approvedUsersTable.grantReadData(postConfirmationFn);
    signupNotificationTopic.grantPublish(postConfirmationFn);

    // Attach Lambda as Cognito Post Confirmation Trigger
    userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, postConfirmationFn);
  }
}
