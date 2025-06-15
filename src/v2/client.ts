import { type Span, SpanKind, trace } from '@opentelemetry/api';
import type {
  DdnConfig,
  DdnConfigV2,
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
import {
  isHttpProtocol,
  joinUrlPaths,
  validateResponse,
  withActiveSpan,
} from '../utils/utils';
import type { PromptQLExecuteRequest } from '../v1';
import {
  buildDdnConfigV1,
  executeProgram,
  readQueryStream,
} from '../v1/client';
import type {
  PromptQLClientConfigV2,
  PromptQLClientV2,
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
    ddn?: Partial<DdnConfigV2> | null,
  ): Promise<DdnConfigV2> => {
    const defaultConfig =
      typeof options.ddn === 'function' ? await options.ddn() : options.ddn;

    if (
      !ddn?.build_version &&
      !ddn?.build_id &&
      !defaultConfig?.build_id &&
      !defaultConfig?.build_version
    ) {
      throw new PromptQLError(
        [],
        '`ddn.build_id` or `ddn.build_version` is required',
      );
    }

    const build_id = ddn?.build_id || defaultConfig?.build_id;
    const build_version = ddn?.build_version || defaultConfig?.build_version;

    if (build_id && UUID_REGEX.test(build_id)) {
      throw new PromptQLError(
        [],
        '`ddn.build_id` must be null or a valid uuid',
      );
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

    const version = 'v2';
    const timezone = rest.timezone || defaultTimezone;

    span.setAttributes({
      'promptql.request.interactions_length': rest.interactions.length,
      'promptql.request.artifacts_length': rest.artifacts?.length ?? 0,
      'promptql.request.timezone': timezone,
      'promptql.request.version': version,
    });

    const ddnConfig = await buildDdnConfigV2(ddn);

    if (ddnConfig.build_id) {
      span.setAttribute('promptql.request.ddn_build_id', ddnConfig.build_id);
    }

    if (ddnConfig.build_version) {
      span.setAttribute(
        'promptql.request.ddn_build_version',
        ddnConfig.build_version,
      );
    }

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
        system_instructions: options.systemInstructions,
        ...rest,
        ddn: ddnConfig,
        timezone,
        version,
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

  const _executeProgram = async (
    { ddn, ...others }: PromptQLExecuteRequest,
    executeOptions?: FetchOptions,
  ): Promise<PromptQlExecutionResult> =>
    withActiveSpan(
      tracer,
      'PromptQL Execute Program',
      async (span) => {
        if (!others.code) {
          throw new PromptQLError([], '`code` is required');
        }

        const ddnConfig = await buildDdnConfigV1(ddn, options.ddn as DdnConfig);

        return executeProgram(
          {
            ...others,
            ddn: ddnConfig,
          },
          {
            span,
            baseUrl: baseUrl.toString(),
            headers: clientHeaders,
            fetch: fetchFn,
            aiPrimitivesLlm: options.aiPrimitivesLlm,
          },
          executeOptions,
        );
      },
      {
        kind: SpanKind.CLIENT,
      },
    );

  return {
    query,
    queryStream,
    executeProgram: _executeProgram,
  };
};
