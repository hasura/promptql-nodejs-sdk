import type { IncomingHttpHeaders } from 'node:http';
import { type Span, SpanKind, trace } from '@opentelemetry/api';
import type {
  DdnConfig,
  ExecuteRequest,
  PromptQlExecutionResult,
  QueryRequestV1,
  QueryResponse,
  QueryResponseChunk,
} from '../promptql';
import {
  DEFAULT_PROMPTQL_BASE_URL,
  type FetchOptions,
  type LlmConfigV1,
  PromptQLError,
} from '../types';
import {
  DATA_CHUNK_PREFIX,
  isHttpProtocol,
  joinUrlPaths,
  validateResponse,
  validateResponseAndDecodeJson,
  withActiveSpan,
} from '../utils/utils';
import type {
  PromptQLClientConfigV1,
  PromptQLClientV1,
  PromptQLExecuteRequest,
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

        const ddnConfig = await buildDdnConfigV1(ddn, options.ddn);

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

export const executeProgram = async (
  { ai_primitives_llm, artifacts, ...others }: PromptQLExecuteRequest,
  options: {
    span: Span;
    baseUrl: string;
    headers: IncomingHttpHeaders;
    aiPrimitivesLlm?: LlmConfigV1;
    fetch: (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<Response>;
  },
  executeOptions?: FetchOptions,
): Promise<PromptQlExecutionResult> => {
  const span = options.span;
  const aiPrimitivesLlm = ai_primitives_llm ??
    options.aiPrimitivesLlm ?? {
      provider: 'hasura',
    };

  span.setAttribute(
    'promptql.request.artifacts_length',
    artifacts?.length ?? 0,
  );
  span.setAttribute('promptql.request.ddn_url', others.ddn?.url ?? '');

  if (ai_primitives_llm?.provider) {
    span.setAttribute(
      'promptql.request.ai_primitives_llm_provider',
      ai_primitives_llm.provider,
    );
  }

  const url = new URL(options.baseUrl);
  url.pathname = joinUrlPaths(url.pathname, 'execute_program');

  return options
    .fetch(url, {
      ...executeOptions,
      headers: {
        ...options.headers,
        ...executeOptions?.headers,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        ...others,
        ai_primitives_llm: aiPrimitivesLlm,
        artifacts: artifacts ?? [],
      } as ExecuteRequest),
    })
    .then(validateResponseAndDecodeJson<PromptQlExecutionResult>)
    .then((data) => {
      span.setAttributes({
        'promptql.response.accessed_artifact_ids': data.accessed_artifact_ids,
        'promptql.response.modified_artifacts_length':
          data.modified_artifacts.length,
      });

      return data;
    });
};

export const readQueryStream = async (
  response: Response,
  callback?: (data: QueryResponseChunk) => void | Promise<void>,
  signal?: AbortSignal | null | undefined,
): Promise<number> => {
  if (typeof callback !== 'function' || !response.body) {
    return 0;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let incompleteChunk = '';
  let responseSize = 0;

  const handleChunk = async (text: string): Promise<void> => {
    if (!text && !incompleteChunk) {
      return;
    }

    let tempText = incompleteChunk + text;
    incompleteChunk = '';

    if (tempText.startsWith(DATA_CHUNK_PREFIX)) {
      tempText = text.substring(DATA_CHUNK_PREFIX.length);
    }

    // split chunks to parts and try to decode one by one.
    const rawChunks = tempText.split(DATA_CHUNK_PREFIX);

    for (let i = 0; i < rawChunks.length; i++) {
      const chunk = rawChunks[i]!;
      const line = chunk.trim();

      // cache the incomplete chunk to parse later.
      if (line[line.length - 1] !== '}') {
        incompleteChunk += i > 0 ? `data: ${chunk}` : chunk;
        return;
      }

      let data: QueryResponseChunk | undefined;

      try {
        data = JSON.parse(line);
      } catch (err) {
        incompleteChunk += i > 0 ? `data: ${line}` : line;
      }

      if (data) {
        await callback(data);
      }
    }
  };

  while (true) {
    if (signal?.aborted) {
      await response.body.cancel();
      break;
    }

    try {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      const text = decoder.decode(value);
      if (!text) {
        continue;
      }

      responseSize += text.length;
      await handleChunk(text);
    } catch (err) {
      await response.body.cancel();

      throw err;
    }
  }

  if (incompleteChunk) {
    await handleChunk('');
  }

  return responseSize;
};

/**
 * Build the DDN config v1 from the request and default input.
 *
 * @async
 * @param {?(Partial<DdnConfig> | null)} [ddn]
 * @param {?(DdnConfig | (() => DdnConfig | Promise<DdnConfig>))} [defaultDdn]
 * @returns {Promise<DdnConfig>}
 */
export const buildDdnConfigV1 = async (
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
