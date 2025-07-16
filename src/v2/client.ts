import { type Span, SpanKind, trace } from '@opentelemetry/api';
import type {
  DdnConfigV2,
  ExecuteRequestV2,
  PromptQlExecutionResult,
  QueryRequestV2,
  QueryResponse,
  QueryResponseChunk,
} from '../promptql';
import {
  DEFAULT_PROMPTQL_BASE_URL,
  type FetchOptions,
  PromptQLError,
} from '../types';
import { readQueryStream } from '../utils/query-stream';
import {
  isHttpProtocol,
  joinUrlPaths,
  validateResponse,
  validateResponseAndDecodeJson,
  withActiveSpan,
} from '../utils/utils';
import type {
  PromptQLClientConfigV2,
  PromptQLClientV2,
  PromptQLExecuteRequestV2,
  PromptQLQueryRequestV2,
} from './types';

const UUID_REGEX =
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

/**
 * Create an HTTP client that implements the PromptQL API version 2.
 *
 * @param {PromptQLClientConfigV2} options
 * @returns {PromptQLClientV2}
 */
export const createPromptQLClientV2 = (
  options: PromptQLClientConfigV2,
): PromptQLClientV2 => {
  const tracer = trace.getTracer('promptql-nodejs-sdk');
  const fetchFn = typeof options.fetch === 'function' ? options.fetch : fetch;
  const baseUrl = new URL(
    !options.baseUrl ? DEFAULT_PROMPTQL_BASE_URL : options.baseUrl,
  );

  if (!isHttpProtocol(baseUrl.protocol)) {
    throw new Error(`invalid promptql url: ${baseUrl}`);
  }

  const clientHeaders = {
    ...(options.headers ?? {}),
    Authorization: `Bearer ${options.apiKey}`,
  };

  const defaultTimezone =
    options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const buildDdnConfigV2 = async (
    span: Span,
    ddn?: Partial<DdnConfigV2> | null,
  ): Promise<DdnConfigV2> => {
    const defaultConfig = !options.ddn
      ? {}
      : typeof options.ddn === 'function'
        ? await options.ddn()
        : options.ddn;

    const build_id = ddn?.build_id || defaultConfig?.build_id;
    const build_version = ddn?.build_version || defaultConfig?.build_version;

    if (build_id && !UUID_REGEX.test(build_id)) {
      throw new PromptQLError(
        [],
        '`ddn.build_id` must be null or a valid uuid',
      );
    }

    if (build_id) {
      span.setAttribute('promptql.request.ddn_build_id', build_id);
    }

    if (build_version) {
      span.setAttribute('promptql.request.ddn_build_version', build_version);
    }

    return {
      build_id,
      build_version,
      headers: {
        ...(defaultConfig?.headers ?? {}),
        ...(ddn?.headers ?? {}),
      },
    };
  };

  const queryRaw = async (
    span: Span,
    { ddn, ...rest }: PromptQLQueryRequestV2,
    stream: boolean,
    queryOptions?: FetchOptions,
  ): Promise<Response> => {
    if (
      !rest.interactions.length ||
      rest.interactions.every((interaction) => !interaction.user_message.text)
    ) {
      throw new PromptQLError(
        [],
        'require at least 1 interaction with non-empty user message content',
      );
    }

    const timezone = rest.timezone || defaultTimezone;

    span.setAttributes({
      'promptql.request.interactions_length': rest.interactions.length,
      'promptql.request.artifacts_length': rest.artifacts?.length ?? 0,
      'promptql.request.timezone': timezone,
      'promptql.request.version': 'v2',
    });

    const ddnConfig = await buildDdnConfigV2(span, ddn);

    const url = new URL(baseUrl);
    url.pathname = joinUrlPaths(url.pathname, 'query');

    return fetchFn(url, {
      ...queryOptions,
      method: 'POST',
      headers: {
        ...clientHeaders,
        ...queryOptions?.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...rest,
        ddn: ddnConfig,
        timezone,
        version: 'v2',
        stream,
      } as QueryRequestV2),
    }).then(validateResponse);
  };

  const query = (
    body: PromptQLQueryRequestV2,
    queryOptions?: FetchOptions,
  ): Promise<QueryResponse> =>
    withActiveSpan(
      tracer,
      'PromptQL Query',
      (span) => {
        return queryRaw(span, body, false, queryOptions)
          .then((response) => response.json())
          .then((rawData) => {
            const data = rawData as QueryResponse;

            span.setAttributes({
              'promptql.response.assistant_actions_length':
                data.assistant_actions.length,
              'promptql.response.modified_artifacts_length':
                data.modified_artifacts.length,
            });

            return data;
          });
      },
      {
        kind: SpanKind.CLIENT,
      },
    );

  const queryStream = async (
    body: PromptQLQueryRequestV2,
    callback?: (data: QueryResponseChunk) => void | Promise<void>,
    queryOptions?: FetchOptions,
  ): Promise<Response> =>
    withActiveSpan(
      tracer,
      'PromptQL Query Stream',
      async (span) => {
        const response = await queryRaw(span, body, true, queryOptions);

        const responseSize = await readQueryStream(
          response,
          callback,
          queryOptions?.signal,
        );

        if (responseSize > 0) {
          span.setAttribute('http.response.body.size', responseSize);
        }

        return response;
      },
      {
        kind: SpanKind.CLIENT,
      },
    );

  const executeProgram = async (
    { ddn, artifacts, ...others }: PromptQLExecuteRequestV2,
    executeOptions?: FetchOptions,
  ): Promise<PromptQlExecutionResult> =>
    withActiveSpan(
      tracer,
      'PromptQL Execute Program',
      async (span) => {
        if (!others.code) {
          throw new PromptQLError([], '`code` is required');
        }

        const ddnConfig = await buildDdnConfigV2(span, ddn);
        const url = new URL(baseUrl.toString());
        url.pathname = joinUrlPaths(url.pathname, 'execute_program');

        span.setAttribute(
          'promptql.request.artifacts_length',
          artifacts?.length ?? 0,
        );

        return fetchFn(url, {
          ...executeOptions,
          headers: {
            ...clientHeaders,
            ...executeOptions?.headers,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify({
            ...others,
            version: 'v2',
            ddn: ddnConfig,
            artifacts: artifacts ?? [],
          } as ExecuteRequestV2),
        })
          .then(validateResponseAndDecodeJson<PromptQlExecutionResult>)
          .then((data) => {
            span.setAttributes({
              'promptql.response.accessed_artifact_ids':
                data.accessed_artifact_ids,
              'promptql.response.modified_artifacts_length':
                data.modified_artifacts.length,
            });

            return data;
          });
      },
      {
        kind: SpanKind.CLIENT,
      },
    );

  return {
    query,
    queryStream,
    executeProgram,
  };
};
