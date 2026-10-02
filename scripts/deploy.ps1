param(
  [Parameter(Mandatory = $true)][string]$Profile,
  [Parameter(Mandatory = $true)][string]$AccountId,
  [string]$Region = 'us-east-1'
)
$ErrorActionPreference = 'Stop'
$identityJson = aws sts get-caller-identity --profile $Profile --region $Region --output json
if ($LASTEXITCODE -ne 0) { throw 'AWS profile is not signed in.' }
$identity = $identityJson | ConvertFrom-Json
if ($identity.Account -ne $AccountId) { throw "AWS account mismatch: expected $AccountId, got $($identity.Account)." }
if ($identity.Arn -match ':root$') { throw 'Refusing deployment with the AWS account root user.' }
$env:AWS_PROFILE = $Profile
$env:AWS_REGION = $Region
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
npm run infra:bundle
if ($LASTEXITCODE -ne 0) { throw 'CDK app bundle failed.' }
npx cdk bootstrap
if ($LASTEXITCODE -ne 0) { throw 'CDK bootstrap failed.' }
npx cdk synth --strict
if ($LASTEXITCODE -ne 0) { throw 'CDK synthesis failed.' }
npx cdk diff
if ($LASTEXITCODE -ne 0) { throw 'CDK diff failed.' }
npx cdk deploy SkillBridge --require-approval never --outputs-file .deploy-outputs.json
if ($LASTEXITCODE -ne 0) { throw 'CDK deployment failed.' }
$outputs = Get-Content -LiteralPath '.deploy-outputs.json' -Raw | ConvertFrom-Json
$stack = $outputs.SkillBridge
$config = @{ apiUrl = $stack.LiveUrl; userPoolId = $stack.UserPoolId; userPoolClientId = $stack.UserPoolClientId; region = $Region } | ConvertTo-Json -Compress
Set-Content -LiteralPath 'dist/config.json' -Value $config -Encoding utf8
aws s3 cp 'dist/config.json' "s3://$($stack.SiteBucket)/config.json" --profile $Profile --region $Region --content-type application/json --cache-control 'no-store'
if ($LASTEXITCODE -ne 0) { throw 'Runtime config upload failed.' }
aws cloudfront create-invalidation --distribution-id $stack.DistributionId --profile $Profile --paths '/*'
if ($LASTEXITCODE -ne 0) { throw 'CloudFront invalidation failed.' }
Write-Output $stack.LiveUrl
