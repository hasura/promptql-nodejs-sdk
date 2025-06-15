import type { IncomingHttpHeaders } from 'node:http';
import type {
  DdnConfigV2,
  PromptQlExecutionResult,
  QueryRequestV2,
  QueryResponse,
  QueryResponseChunk,
} from '../promptql';
import type { FetchOptions, LlmConfigV1 } from '../types';
import type { PromptQLExecuteRequest } from '../v1';

// DdnConfigV2WithURL extends the DDN config v2 with URL for execute program.
export type DdnConfigV2WithURL = DdnConfigV2 & {
  url?: string;
};

/**
 * PromptQL client config contains common settings to connect the PromptQL API version 2.
 *
 * @export
 * @typedef {PromptQLClientConfigV2}
 */
export type PromptQLClientConfigV2 = {
  /**
   * PromptQL API key created from project settings.
   *
   * @type {string}
   */
  apiKey: string;

  /**
   * DDN configuration including URL and headers.
   *
   * @type {(DdnConfigV2 | (() => DdnConfigV2WithURL | Promise<DdnConfigV2WithURL>))}
   */
  ddn:
    | DdnConfigV2WithURL
    | (() => DdnConfigV2WithURL | Promise<DdnConfigV2WithURL>);

  /**
   * The optional base URL of PromptQL API. The default value is the endpoint to the public DDN.
   *
   * @type {?string}
   */
  baseUrl?: string;

  /**
   * Custom headers to be injected into requests.
   *
   * @type {?IncomingHttpHeaders}
   */
  headers?: IncomingHttpHeaders;

  /**
   * Default AI Primitives LLM provider configuration.
   *
   * @type {?(LlmConfig)}
   */
  aiPrimitivesLlm?: LlmConfigV1;

  /**
   * An [IANA timezone](https://data.iana.org/time-zones/tzdb-2021a/zone1970.tab) for interpreting time-based queries. Default is the system timezone.
   *
   * @type {?string}
   */
  timezone?: string;

  /**
   * Use a custom http client function. Default is fetch.
   *
   * @type {?(
   *     input: string | URL | Request,
   *     init?: RequestInit,
   *   ) => Promise<Response>}
   */
  fetch?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
};

/**
 * A simple http client wrapper for [PromptQL API](https://hasura.io/docs/promptql/promptql-apis/overview/).
 *
 * @export
 * @typedef {PromptQLClientV2}
 */
export type PromptQLClientV2 = {
  /**
   * The [Natural Language Query API](https://hasura.io/docs/promptql/promptql-apis/natural-language-api/) allows you to interact with PromptQL directly, sending messages and receiving responses.
   * The response is non-streaming.
   *
   * @param {PromptQLQueryRequest} body
   * @param {?FetchOptions} [queryOptions]
   * @returns {Promise<QueryResponse>}
   */
  query: (
    body: PromptQLQueryRequestV2,
    queryOptions?: FetchOptions,
  ) => Promise<QueryResponse>;

  /**
   * The streaming response sends chunks of data in Server-Sent Events (SSE) format.
   * If the callback isn't set the client returns the raw response and you need to handle the response manually.
   *
   * @param {PromptQLQueryRequest} body
   * @param {?(data: QueryResponseChunk) => void} callback
   * @param {?FetchOptions} [queryOptions]
   * @returns {Promise<Response>}
   */
  queryStream: (
    body: PromptQLQueryRequestV2,
    callback?: (data: QueryResponseChunk) => void | Promise<void>,
    queryOptions?: FetchOptions,
  ) => Promise<Response>;

  /**
   * Execute a PromptQL program with your data.
   *
   * @async
   * @param {PromptQLExecuteRequest} body
   * @param {?FetchOptions} [executeOptions]
   * @returns {Promise<PromptQlExecutionResult>}
   */
  executeProgram: (
    body: PromptQLExecuteRequest,
    executeOptions?: FetchOptions,
  ) => Promise<PromptQlExecutionResult>;
};

/**
 * The request body to the [Natural Language Query API](https://hasura.io/docs/promptql/promptql-apis/natural-language-api/) version 2.
 *
 * @export
 * @typedef {PromptQLQueryRequestV2}
 */
export type PromptQLQueryRequestV2 = Omit<
  QueryRequestV2,
  'timezone' | 'version' | 'ddn' | 'stream'
> & {
  /**
   * An [IANA timezone](https://data.iana.org/time-zones/tzdb-2021a/zone1970.tab) for interpreting time-based queries. Default is the timezone from the client config.
   *
   * @type {?string}
   */
  timezone?: string;

  /**
   * DDN configuration including URL and headers. Used to override the default client settings.
   *
   * @type {?Partial<DdnConfigV2>}
   */
  ddn?: Partial<DdnConfigV2>;
};
