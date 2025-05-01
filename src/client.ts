import { type Span, SpanKind, trace } from '@opentelemetry/api';
import type {
  DdnConfig,
  ExecuteRequest,
  HttpValidationError,
  PromptQlExecutionResult,
  QueryRequest,
  QueryResponse,
  QueryResponseChunk,
} from './promptql';
import {
  type FetchOptions,
  type PromptQLClient,
  type PromptQLClientConfig,
  PromptQLError,
  type PromptQLExecuteRequest,
  type PromptQLQueryRequest,
} from './types';
import {
  DATA_CHUNK_PREFIX,
  isHttpProtocol,
  joinUrlPaths,
  setHeaderAttributes,
  withActiveSpan,
} from './utils';

/**
 * Description placeholder
 *
 * @param {PromptQLClientConfig} options
 * @returns {PromptQLClient}
 */
export const createPromptQLClient = (
  options: PromptQLClientConfig,
): PromptQLClient => {
  const tracer = trace.getTracer('promptql-nodejs-sdk');
  const fetchFn = typeof options.fetch === 'function' ? options.fetch : fetch;
  const baseUrl = new URL(
    !options.baseUrl ? 'https://api.promptql.pro.hasura.io' : options.baseUrl,
  );

  if (!isHttpProtocol(baseUrl.protocol)) {
    throw new Error(`invalid promptql url: ${baseUrl}`);
  }

  const serverPort = baseUrl.port
    ? Number.parseInt(baseUrl.port, 10)
    : baseUrl.protocol === 'https:'
      ? 443
      : 80;
  const clientHeaders = {
    ...(options.headers ?? {}),
    Authorization: `Bearer ${options.apiKey}`,
  };

  const defaultTimezone =
    options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const aiPrimitivesLlm = options.aiPrimitivesLlm ?? {
    provider: 'hasura',
  };

  // wrap fetch with telemetry and error handling
  const withFetch = async (span: Span, url: URL, requestInit: RequestInit) => {
    span.setAttributes({
      'http.request.method': requestInit.method ?? 'GET',
      'url.full': url.toString(),
      'url.scheme': url.protocol,
      'url.template': url.pathname,
      'server.address': url.hostname,
      'server.port': serverPort,
      'network.protocol.name': 'http',
      'network.protocol.version': '1.1',
    });

    setHeaderAttributes(
      span,
      requestInit.headers as Record<string, string | string[]>,
      'http.request.header',
    );

    if (typeof requestInit.body === 'string') {
      span.setAttribute('http.request.body.size', requestInit.body.length);
    }

    const response = await fetchFn(url, requestInit);

    span.setAttribute('http.response.status_code', response.status);
    setHeaderAttributes(span, response.headers, 'http.response.header');

    if (response.status >= 400) {
      const responseText = response.body
        ? await response.text()
        : response.statusText;
      span.setAttribute(
        'http.response.body.size',
        response.body ? responseText.length : 0,
      );

      if (response.status > 500 || !response.body) {
        throw new PromptQLError([], responseText);
      }

      try {
        const pqlError = JSON.parse(responseText) as HttpValidationError;
        const message = pqlError.detail?.length
          ? pqlError.detail.map((d) => d.msg).join('. ')
          : responseText;

        throw new PromptQLError(pqlError.detail ?? [], message);
      } catch (_) {
        throw new PromptQLError([], responseText);
      }
    }

    const rawContentLength = response.headers.get('content-length');

    if (rawContentLength) {
      try {
        const contentLength = Number.parseInt(rawContentLength, 10);
        span.setAttribute('http.response.body.size', contentLength);
      } catch (_) {}
    }

    return response;
  };

  const buildDdnConfig = async (
    ddn?: Partial<DdnConfig> | null,
  ): Promise<DdnConfig> => {
    const defaultConfig =
      typeof options.ddn === 'function' ? await options.ddn() : options.ddn;

    if (!ddn?.url && !defaultConfig.url) {
      throw new PromptQLError([], '`ddn.url` is required');
    }

    const url = new URL(ddn?.url || defaultConfig.url);

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

  const queryRaw = async (
    span: Span,
    { llm, ai_primitives_llm, ddn, ...rest }: PromptQLQueryRequest,
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

    const ddnConfig = await buildDdnConfig(ddn);
    span.setAttribute('promptql.request.ddn_url', ddnConfig.url);

    const url = new URL(baseUrl);
    url.pathname = joinUrlPaths(url.pathname, 'query');

    return withFetch(span, url, {
      ...queryOptions,
      method: 'POST',
      headers: {
        ...clientHeaders,
        ...queryOptions?.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...rest,
        llm,
        ai_primitives_llm,
        ddn: ddnConfig,
        timezone,
        version,
        stream,
      } as QueryRequest),
    });
  };

  const query = (
    body: PromptQLQueryRequest,
    queryOptions?: FetchOptions,
  ): Promise<QueryResponse> =>
    withActiveSpan(
      tracer,
      'query',
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
    body: PromptQLQueryRequest,
    callback?: (data: QueryResponseChunk) => void | Promise<void>,
    queryOptions?: FetchOptions,
  ): Promise<Response> =>
    withActiveSpan(
      tracer,
      'queryStream',
      async (span) => {
        const response = await queryRaw(span, body, true, queryOptions);

        if (typeof callback !== 'function' || !response.body) {
          return response;
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

          rawChunks.forEach(async (chunk, index) => {
            const line = chunk.trim();

            // cache the incomplete chunk to parse later.
            if (line[line.length - 1] !== '}') {
              incompleteChunk += index > 0 ? `data: ${chunk}` : chunk;
              return;
            }

            let data: QueryResponseChunk | undefined;

            try {
              data = JSON.parse(line);
            } catch (err) {
              incompleteChunk += index > 0 ? `data: ${line}` : line;
            }

            if (data) {
              await callback(data);
            }
          });
        };

        while (true) {
          if (queryOptions?.signal?.aborted) {
            break;
          }

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
        }

        span.setAttribute('http.response.body.size', responseSize);

        if (incompleteChunk) {
          await handleChunk('');
        }

        return response;
      },
      {
        kind: SpanKind.CLIENT,
      },
    );

  const executeProgram = async (
    { ai_primitives_llm, artifacts, ddn, ...others }: PromptQLExecuteRequest,
    executeOptions?: FetchOptions,
  ): Promise<PromptQlExecutionResult> =>
    withActiveSpan(
      tracer,
      'executeProgram',
      async (span) => {
        if (!others.code) {
          throw new PromptQLError([], '`code` is required');
        }

        span.setAttribute(
          'promptql.request.artifacts_length',
          artifacts?.length ?? 0,
        );

        ai_primitives_llm = ai_primitives_llm ?? aiPrimitivesLlm;

        if (ai_primitives_llm?.provider) {
          span.setAttribute(
            'promptql.request.ai_primitives_llm_provider',
            ai_primitives_llm.provider,
          );
        }

        const ddnConfig = await buildDdnConfig(ddn);
        span.setAttribute('promptql.request.ddn_url', ddnConfig.url);

        const url = new URL(baseUrl);
        url.pathname = joinUrlPaths(url.pathname, 'execute_program');

        return withFetch(span, url, {
          ...executeOptions,
          headers: {
            ...clientHeaders,
            ...executeOptions?.headers,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify({
            ...others,
            ai_primitives_llm,
            ddn: ddnConfig,
            artifacts: artifacts ?? [],
          } as ExecuteRequest),
        })
          .then((response) => response.json())
          .then((rawData) => {
            const data = rawData as PromptQlExecutionResult;

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
