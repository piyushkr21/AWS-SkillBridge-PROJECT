import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'node:path';

class SkillBridgeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const site = new s3.Bucket(this, 'Site', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const uploads = new s3.Bucket(this, 'PrivateUploads', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: cdk.Duration.days(1) }],
    });
    const table = new dynamodb.Table(this, 'AppState', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'expires',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const userPool = new cognito.UserPool(this, 'Students', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: false },
      // Demo accounts use email as a unique username. Email ownership is not asserted.
      accountRecovery: cognito.AccountRecovery.NONE,
      passwordPolicy: { minLength: 8, requireDigits: true, requireLowercase: true, requireUppercase: true, requireSymbols: false },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, new lambda.Function(this, 'ConfirmStudentSignUp', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async (event) => { event.response.autoConfirmUser = true; event.response.autoVerifyEmail = false; return event; };'),
    }));
    const client = userPool.addClient('WebClient', {
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      refreshTokenValidity: cdk.Duration.days(7),
      enableTokenRevocation: true,
    });
    const clientResource = client.node.defaultChild as cognito.CfnUserPoolClient;
    clientResource.allowedOAuthFlowsUserPoolClient = false;
    clientResource.allowedOAuthFlows = undefined;
    clientResource.allowedOAuthScopes = undefined;
    clientResource.callbackUrLs = undefined;
    const handler = new lambdaNode.NodejsFunction(this, 'ApiHandler', {
      entry: path.join(process.cwd(), 'backend', 'handler.js'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(25),
      environment: {
        TABLE_NAME: table.tableName,
        UPLOAD_BUCKET: uploads.bucketName,
        BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID || '',
        PUBLIC_ORIGIN: '*',
      },
      bundling: { minify: true, sourceMap: true, target: 'node22' },
      logRetention: 14,
    });
    table.grantReadWriteData(handler);
    uploads.grantPut(handler, 'certificates/*');
    if (process.env.BEDROCK_MODEL_ID) {
      handler.addToRolePolicy(new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [`arn:aws:bedrock:*::foundation-model/*`, `arn:aws:bedrock:*:${this.account}:inference-profile/*`],
      }));
    }
    const api = new apigwv2.HttpApi(this, 'Api', {
      corsPreflight: { allowOrigins: ['*'], allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.PUT], allowHeaders: ['authorization', 'content-type'], maxAge: cdk.Duration.hours(1) },
    });
    const integration = new integrations.HttpLambdaIntegration('LambdaIntegration', handler);
    const jwt = new authorizers.HttpJwtAuthorizer('StudentJwt', `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`, { jwtAudience: [client.userPoolClientId] });
    for (const [method, route] of [
      [apigwv2.HttpMethod.GET, '/public/health'],
      [apigwv2.HttpMethod.GET, '/public/repos'],
      [apigwv2.HttpMethod.POST, '/public/analyze'],
      [apigwv2.HttpMethod.POST, '/public/check-proof'],
      [apigwv2.HttpMethod.POST, '/public/chat'],
    ] as [apigwv2.HttpMethod, string][]) api.addRoutes({ path: route, methods: [method], integration });
    for (const [method, route] of [
      [apigwv2.HttpMethod.GET, '/me/state'],
      [apigwv2.HttpMethod.PUT, '/me/state'],
      [apigwv2.HttpMethod.POST, '/me/upload'],
    ] as [apigwv2.HttpMethod, string][]) api.addRoutes({ path: route, methods: [method], integration, authorizer: jwt });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: { origin: origins.S3BucketOrigin.withOriginAccessControl(site), viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS },
      additionalBehaviors: Object.fromEntries(['/public/*', '/me/*'].map(route => [route, {
        origin: new origins.HttpOrigin(`${api.httpApiId}.execute-api.${this.region}.amazonaws.com`, { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      }])),
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });
    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.join(process.cwd(), 'dist'))],
      destinationBucket: site,
      distribution,
      distributionPaths: ['/*'],
      prune: false,
    });
    new cdk.CfnOutput(this, 'LiveUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new cdk.CfnOutput(this, 'SiteBucket', { value: site.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}

const app = new cdk.App();
new SkillBridgeStack(app, 'SkillBridge', { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'ap-south-1' } });
