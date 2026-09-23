import { Cause } from 'effect';
import {
  HttpClientError,
  type HttpClientRequest,
  type HttpClientResponse,
} from 'effect/unstable/http';

import { AccountError } from './account-contracts';

// Never copy error messages, causes, headers, bodies, or URL queries into output.
export const accountRequestError = (
  category: NonNullable<AccountError['diagnostic']>['category'],
  message: string,
  request: HttpClientRequest.HttpClientRequest,
  response?: HttpClientResponse.HttpClientResponse,
  code: typeof AccountError.fields.code.Type = 'Remote',
) => {
  const ray = response?.headers['cf-ray'];

  const requestId =
    ray !== undefined && /^[a-f0-9]{16,32}-[A-Z]{3}$/.test(ray)
      ? ray
      : undefined;

  return new AccountError({
    code,
    message,
    diagnostic: {
      category,
      method: request.method,
      endpoint: URL.parse(request.url)?.pathname ?? '[invalid URL]',
      status: response?.status,
      requestId,
    },
  });
};

export const accountTransportError = (
  error: HttpClientError.HttpClientError | Cause.TimeoutError,
  request: HttpClientRequest.HttpClientRequest,
) =>
  accountRequestError(
    Cause.isTimeoutError(error) ? 'Timeout' : error.reason._tag,
    Cause.isTimeoutError(error)
      ? 'Account request timed out after 30 seconds. No automatic retry was made.'
      : 'Account request failed. No automatic retry was made.',
    request,
    HttpClientError.isHttpClientError(error) ? error.response : undefined,
  );
