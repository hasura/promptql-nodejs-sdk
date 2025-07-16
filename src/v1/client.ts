import { type Span, SpanKind, trace } from '@opentelemetry/api';
import type {
  DdnConfig,
  ExecuteRequestV1,
  PromptQlExecutionResult,
  QueryRequestV1,
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
  PromptQLClientConfigV1,
  PromptQLClientV1,
  PromptQLExecuteRequestV1,
  PromptQLQueryRequestV1,
} from './types';

/**
 * Create an HTTP client that implements the PromptQL API version 1.
 *
 * @param {PromptQLClientConfigV1} options
 * @returns {PromptQLClientV1}
 */
export const createPromptQLClientV1 = (
  options: PromptQLClientConfigV1,
): PromptQLClientV1 => {
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

  const queryRaw = async (
    span: Span,
    { llm, ai_primitives_llm, ddn, ...rest }: PromptQLQueryRequestV1,
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

    llm = llm ?? options.llm;
    ai_primitives_llm = ai_primitives_llm ?? options.aiPrimitivesLlm;

    const version = 'v1';
    const timezone = rest.timezone || defaultTimezone;

    span.setAttributes({
      'promptql.request.interactions_length': rest.interactions.length,
      'promptql.request.artifacts_length': rest.artifacts?.length ?? 0,
      'promptql.request.timezone': timezone,
      'promptql.request.version': version,
    });

    if (llm?.provider) {
      span.setAttribute('promptql.request.llm_provider', llm.provider);
    }

    if (ai_primitives_llm?.provider) {
      span.setAttribute(
        'promptql.request.ai_primitives_llm_provider',
        ai_primitives_llm.provider,
      );
    }

    const ddnConfig = await buildDdnConfigV1(ddn, options.ddn);
    span.setAttribute('promptql.request.ddn_url', ddnConfig.url);

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
        llm,
        ai_primitives_llm,
        ddn: ddnConfig,
        timezone,
        version,
        stream,
      } as QueryRequestV1),
    }).then(validateResponse);
  };

  const query = (
    body: PromptQLQueryRequestV1,
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
    body: PromptQLQueryRequestV1,
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
    { ddn, ai_primitives_llm, artifacts, ...others }: PromptQLExecuteRequestV1,
    executeOptions?: FetchOptions,
  ): Promise<PromptQlExecutionResult> =>
    withActiveSpan(
      tracer,
      'PromptQL Execute Program',
      async (span) => {
        if (!others.code) {
          throw new PromptQLError([], '`code` is required');
        }

        const ddnConfig = await buildDdnConfigV1(ddn, options.ddn);

        const aiPrimitivesLlm = ai_primitives_llm ??
          options.aiPrimitivesLlm ?? {
            provider: 'hasura',
          };

        span.setAttribute(
          'promptql.request.artifacts_length',
          artifacts?.length ?? 0,
        );
        span.setAttribute('promptql.request.ddn_url', ddn?.url ?? '');

        if (ai_primitives_llm?.provider) {
          span.setAttribute(
            'promptql.request.ai_primitives_llm_provider',
            ai_primitives_llm.provider,
          );
        }

        const url = new URL(baseUrl.toString());
        url.pathname = joinUrlPaths(url.pathname, 'execute_program');

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
            ddn: ddnConfig,
            ai_primitives_llm: aiPrimitivesLlm,
            artifacts: artifacts ?? [],
          } as ExecuteRequestV1),
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

/**
 * Build the DDN config v1 from the request and default input.
 */
const buildDdnConfigV1 = async (
  ddn?: Partial<DdnConfig> | null,
  defaultDdn?: DdnConfig | (() => DdnConfig | Promise<DdnConfig>),
): Promise<DdnConfig> => {
  const defaultConfig =
    typeof defaultDdn === 'function' ? await defaultDdn() : defaultDdn;

  const ddnURL = ddn?.url || defaultConfig?.url;

  if (!ddnURL) {
    throw new PromptQLError([], '`ddn.url` is required');
  }

  const url = new URL(ddnURL);

  if (!isHttpProtocol(url.protocol)) {
    throw new Error(`invalid ddn.url protocol: ${url.protocol}`);
  }

  if (!url.pathname.endsWith('/sql')) {
    url.pathname = joinUrlPaths(url.pathname, 'v1/sql');
  }

  return {
    url: url.toString(),
    headers: {
      ...(defaultConfig?.headers ?? {}),
      ...(ddn?.headers ?? {}),
    },
  };
};
