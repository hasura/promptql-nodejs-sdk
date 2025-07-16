import type { IncomingHttpHeaders } from 'node:http';
import type {
  DdnConfigV2,
  ExecuteRequestV2,
  PromptQlExecutionResult,
  QueryRequestV2,
  QueryResponse,
  QueryResponseChunk,
} from '../promptql';
import type { FetchOptions } from '../types';

/**
 * PromptQL client config contains common settings to connect the PromptQL API version 2.
 *
 * @export
 */
export type PromptQLClientConfigV2 = {
  /**
   * PromptQL API key created from project settings.
   */
  apiKey: string;

  /**
   * DDN configuration including URL and headers.
   */
  ddn?: DdnConfigV2 | (() => DdnConfigV2 | Promise<DdnConfigV2>);

  /**
   * The optional base URL of PromptQL API. The default value is the endpoint to the public DDN.
   */
  baseUrl?: string;

  /**
   * Custom headers to be injected into requests.
   */
  headers?: IncomingHttpHeaders;

  /**
   * An [IANA timezone](https://data.iana.org/time-zones/tzdb-2021a/zone1970.tab) for interpreting time-based queries. Default is the system timezone.
   */
  timezone?: string;

  /**
   * Use a custom http client function. Default is fetch.
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
 */
export type PromptQLClientV2 = {
  /**
   * The [Natural Language Query API](https://hasura.io/docs/promptql/promptql-apis/natural-language-api/) allows you to interact with PromptQL directly, sending messages and receiving responses.
   * The response is non-streaming.
   */
  query: (
    body: PromptQLQueryRequestV2,
    queryOptions?: FetchOptions,
  ) => Promise<QueryResponse>;

  /**
   * The streaming response sends chunks of data in Server-Sent Events (SSE) format.
   * If the callback isn't set the client returns the raw response and you need to handle the response manually.
   */
  queryStream: (
    body: PromptQLQueryRequestV2,
    callback?: (data: QueryResponseChunk) => void | Promise<void>,
    queryOptions?: FetchOptions,
  ) => Promise<Response>;

  /**
   * Execute a PromptQL program with your data.
   */
  executeProgram: (
    body: PromptQLExecuteRequestV2,
    executeOptions?: FetchOptions,
  ) => Promise<PromptQlExecutionResult>;
};

/**
 * The request body to the [Natural Language Query API](https://hasura.io/docs/promptql/promptql-apis/natural-language-api/) version 2.
 *
 * @export
 */
export type PromptQLQueryRequestV2 = Omit<
  QueryRequestV2,
  'timezone' | 'version' | 'ddn' | 'stream'
> & {
  /**
   * An [IANA timezone](https://data.iana.org/time-zones/tzdb-2021a/zone1970.tab) for interpreting time-based queries. Default is the timezone from the client config.
   */
  timezone?: string;

  /**
   * DDN configuration including URL and headers. Used to override the default client settings.
   */
  ddn?: Partial<DdnConfigV2>;
};

/**
 * The request body to the [Execute Program API](https://hasura.io/docs/promptql/promptql-apis/execute-program-api/).
 *
 * @export
 */
export type PromptQLExecuteRequestV2 = Omit<ExecuteRequestV2, 'version'>;
