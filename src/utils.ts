import {
  type Span,
  type SpanOptions,
  SpanStatusCode,
  type Tracer,
} from '@opentelemetry/api';
export const DATA_CHUNK_PREFIX = 'data: ';

const SENSITIVE_HEADERS = ['auth', 'secret', 'key'];

/**
 * Wrap the function with a tracing span.
 *
 * @export
 * @template TReturn
 * @param {Tracer} tracer
 * @param {string} name
 * @param {(span: Span) => TReturn} func
 * @param {?Attributes} [attributes]
 * @returns {TReturn}
 */
export function withActiveSpan<TReturn>(
  tracer: Tracer,
  name: string,
  func: (span: Span) => TReturn,
  options: SpanOptions = {},
): TReturn {
  return tracer.startActiveSpan(name, options, (span) => {
    const handleError = (err: unknown) => {
      if (err instanceof Error || typeof err === 'string') {
        span.recordException(err);
      }
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
    };

    try {
      const retval = func(span);
      // If the function returns a Promise, then wire up the span completion to
      // the completion of the promise
      if (
        typeof retval === 'object' &&
        retval !== null &&
        'then' in retval &&
        typeof retval.then === 'function'
      ) {
        return (retval as PromiseLike<unknown>).then(
          (successVal) => {
            span.end();
            return successVal;
          },
          (errorVal) => {
            handleError(errorVal);
            throw errorVal;
          },
        ) as TReturn;
      }
      // Not a promise, just end the span and return
      span.end();
      return retval;
    } catch (e) {
      handleError(e);
      throw e;
    }
  });
}

export const setHeaderAttributes = (
  span: Span,
  headers: Record<string, string | ReadonlyArray<string>> | Headers | undefined,
  prefix: string,
) => {
  if (!headers) {
    return;
  }

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    const attributeName = `${prefix}.${lowerKey}`;

    if (SENSITIVE_HEADERS.some((h) => lowerKey.includes(h))) {
      span.setAttribute(attributeName, ['xxxxxx']);
    } else {
      span.setAttribute(attributeName, Array.isArray(value) ? value : [value]);
    }
  }
};

export const isHttpProtocol = (protocol: string) =>
  protocol === 'http:' || protocol === 'https:';
