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

/**
 * A convenient function to set header attributes to the current span.
 *
 * @param {Span} span
 * @param {(Record<string, string | ReadonlyArray<string>> | Headers | undefined)} headers
 * @param {string} prefix
 */
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

/**
 * Check if the url protocol is http(s)
 *
 * @param {string} protocol
 * @returns {(boolean)}
 */
export const isHttpProtocol = (protocol: string): boolean =>
  protocol === 'http:' || protocol === 'https:';

/**
 * Join URL paths
 *
 * @param {...string[]} fragments
 * @returns {string}
 */
export const joinUrlPaths = (...fragments: string[]): string => {
  const result = fragments
    .map((item) => trim(item, '/'))
    .filter((item) => item)
    .join('/');

  return `/${result}`;
};

const trim = (input: string, char: string): string => {
  const result = trimStart(input, char);
  return trimEnd(result, char);
};

const trimStart = (input: string, char: string): string => {
  for (let i = 0; i < input.length; i++) {
    if (input[i] === char) {
      continue;
    }

    return input.substring(i);
  }

  return '';
};

const trimEnd = (input: string, char: string): string => {
  for (let i = input.length - 1; i >= 0; i--) {
    if (input[i] === char) {
      continue;
    }

    return input.substring(0, i + 1);
  }

  return '';
};
