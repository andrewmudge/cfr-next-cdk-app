import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as apprunner from '@aws-cdk/aws-apprunner-alpha';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class CfrNextStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 Bucket
    const bucket = new s3.Bucket(this, 'CfrPhotoBucket', {
      // You can set other bucket props here if needed
    });

    // Add bucket policy for public read access to photos
    bucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowPublicReadForPhotos',
      effect: iam.Effect.ALLOW,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:GetObject'],
      resources: [
        bucket.arnForObjects('public/photos/*'),
      ],
    }));

    // DynamoDB Table
    const approvedUsersTable = new dynamodb.Table(this, 'ApprovedEmails', {
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      tableName: 'ApprovedEmails'
    });

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
      },
      timeout: Duration.seconds(30),
    });
    bucket.grantRead(listPhotosFn);
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
      },
      timeout: Duration.seconds(30),
    });
    bucket.grantDelete(deletePhotosFn);
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
    },
    timeout: Duration.seconds(30),
  });
  bucket.grantReadWrite(uploadPhotosFn);
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
