import type {
  DdnConfig,
  ExecuteRequest,
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
import { DATA_CHUNK_PREFIX, decodeResponseJson } from './utils';

/**
 * Description placeholder
 *
 * @param {PromptQLClientConfig} options
 * @returns {PromptQLClient}
 */
export const createPromptQLClient = (
  options: PromptQLClientConfig,
): PromptQLClient => {
  const fetchFn = typeof options.fetch === 'function' ? options.fetch : fetch;

  const baseUrl = !options.baseUrl
    ? 'https://api.promptql.pro.hasura.io/'
    : options.baseUrl[options.baseUrl.length - 1] === '/'
      ? options.baseUrl
      : `${options.baseUrl}/`;
  const clientHeaders = {
    ...(options.headers ?? {}),
    Authorization: `Bearer ${options.apiKey}`,
  };

  const timezone =
    options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const aiPrimitivesLlm = options.aiPrimitivesLlm ?? {
    provider: 'hasura',
  };

  const buildDdnConfig = async (
    ddn?: Partial<DdnConfig> | null,
  ): Promise<DdnConfig> => {
    const defaultConfig =
      typeof options.ddn === 'function' ? await options.ddn() : options.ddn;

    if (!ddn?.url && !defaultConfig.url) {
      throw new PromptQLError([], '`ddn.url` is required');
    }

    const url =
      ddn?.url ||
      (defaultConfig.url.endsWith('/v1/sql')
        ? defaultConfig.url
        : `${defaultConfig.url}/v1/sql`);

    return {
      url,
      headers: {
        ...(defaultConfig?.headers ?? {}),
        ...(ddn?.headers ?? {}),
      },
    };
  };

  const queryRaw = async (
    body: PromptQLQueryRequest,
    stream: boolean,
    queryOptions?: FetchOptions,
  ): Promise<Response> => {
    if (
      !body.interactions.length ||
      body.interactions.every((interaction) => !interaction.user_message.text)
    ) {
      throw new PromptQLError(
        [],
        'require at least 1 interaction with non-empty user message content',
      );
    }

    const ddnConfig = await buildDdnConfig(body.ddn);

    return fetchFn(`${baseUrl}query`, {
      ...queryOptions,
      method: 'POST',
      headers: {
        ...clientHeaders,
        ...queryOptions?.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        llm: options.llm,
        ai_primitives_llm: options.aiPrimitivesLlm,
        ...body,
        version: 'v1',
        ddn: ddnConfig,
        timezone: body.timezone || timezone,
        stream,
      } as QueryRequest),
    });
  };

  const query = (
    body: PromptQLQueryRequest,
    queryOptions?: FetchOptions,
  ): Promise<QueryResponse> =>
    queryRaw(body, false, queryOptions).then(decodeResponseJson<QueryResponse>);

  const queryStream = async (
    body: PromptQLQueryRequest,
    callback?: (data: QueryResponseChunk) => void | Promise<void>,
    queryOptions?: FetchOptions,
  ): Promise<Response> => {
    const response = await queryRaw(body, true, queryOptions);

    if (typeof callback !== 'function' || !response.body) {
      return response;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let incompleteChunk = '';

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

      await handleChunk(text);
    }

    if (incompleteChunk) {
      await handleChunk('');
    }

    return response;
  };

  const executeProgram = async (
    body: PromptQLExecuteRequest,
    executeOptions?: FetchOptions,
  ): Promise<PromptQlExecutionResult> => {
    if (!body.code) {
      throw new PromptQLError([], '`code` is required');
    }

    const ddnConfig = await buildDdnConfig(body.ddn);

    return fetchFn(`${baseUrl}execute_program`, {
      ...executeOptions,
      headers: {
        ...clientHeaders,
        ...executeOptions?.headers,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        ...body,
        ai_primitives_llm: body.ai_primitives_llm ?? aiPrimitivesLlm,
        ddn: ddnConfig,
        artifacts: body.artifacts ?? [],
      } as ExecuteRequest),
    }).then(decodeResponseJson<PromptQlExecutionResult>);
  };

  return {
    query,
    queryStream,
    executeProgram,
  };
};
