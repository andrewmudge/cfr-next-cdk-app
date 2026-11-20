import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// Server-only: calls the site's Lambdas directly with the server's AWS keys (cfr-dev).
// The Lambdas no longer have public URLs, so browsers can't reach them; every call goes
// through a site API route that does its own checks (e.g. requireAdmin) first.

const lambda = new LambdaClient({ region: 'us-east-1' });

// Function names can be overridden with env vars; defaults are the deployed names.
export const SITE_LAMBDAS = {
  listPhotos: process.env.LIST_PHOTOS_FUNCTION || 'CfrNextStack-ListPhotosFn8D482F3F-REWfoSA3e4L3',
  deletePhotos: process.env.DELETE_PHOTOS_FUNCTION || 'CfrNextStack-DeletePhotosFn7D7A98A4-xvYIUyJsy7bn',
  uploadPhotos: process.env.UPLOAD_PHOTOS_FUNCTION || 'CfrNextStack-UploadPhotosFnA77E68A3-DfpHdnFlDVJp',
  cognitoUsers: process.env.COGNITO_USERS_FUNCTION || 'CfrNextStack-ListCognitoUsersFnDDF885A6-yodiOVLJ8XEt',
} as const;

export interface LambdaHttpResult {
  status: number;
  ok: boolean;
  /** Parsed JSON body (or the raw text if it isn't JSON). */
  data: unknown;
}

/**
 * Invokes a Lambda with a Function-URL-style event, so the handlers work unchanged.
 */
export async function invokeLambda(
  functionName: string,
  req: { method: 'GET' | 'POST'; query?: Record<string, string>; body?: unknown }
): Promise<LambdaHttpResult> {
  const event = {
    version: '2.0',
    rawPath: '/',
    rawQueryString: new URLSearchParams(req.query ?? {}).toString(),
    headers: { 'content-type': 'application/json' },
    queryStringParameters: req.query,
    requestContext: { http: { method: req.method } },
    httpMethod: req.method,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
    isBase64Encoded: false,
  };
  const out = await lambda.send(new InvokeCommand({ FunctionName: functionName, Payload: Buffer.from(JSON.stringify(event)) }));
  const text = out.Payload ? Buffer.from(out.Payload).toString('utf8') : '';
  if (out.FunctionError) throw new Error(`Lambda ${functionName} failed: ${text.slice(0, 300)}`);
  const res = text ? JSON.parse(text) : {};
  const status = typeof res.statusCode === 'number' ? res.statusCode : 200;
  let data: unknown = res.body ?? res;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      /* leave as text */
    }
  }
  return { status, ok: status >= 200 && status < 300, data };
}
