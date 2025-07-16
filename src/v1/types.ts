import type { IncomingHttpHeaders } from 'node:http';
import type {
  DdnConfig,
  ExecuteRequestV1,
  PromptQlExecutionResult,
  QueryRequestV1,
  QueryResponse,
  QueryResponseChunk,
} from '../promptql';
import type { Artifact, FetchOptions, LlmConfigV1 } from '../types';

/**
 * PromptQL client config contains common settings to connect the PromptQL API version 1.
 *
 * @export
 */
export type PromptQLClientConfigV1 = {
  /**
   * PromptQL API key created from project settings.
   */
  apiKey: string;

  /**
   * DDN configuration including URL and headers.
   */
  ddn: DdnConfig | (() => DdnConfig | Promise<DdnConfig>);

  /**
   * The optional base URL of PromptQL API. The default value is the endpoint to the public DDN.
   */
  baseUrl?: string;

  /**
   * Custom headers to be injected into requests.
   */
  headers?: IncomingHttpHeaders;

  /**
   * Default LLM provider configuration for the natural language API.
   */
  llm?: LlmConfigV1;

  /**
   * Default AI Primitives LLM provider configuration.
   */
  aiPrimitivesLlm?: LlmConfigV1;

  /**
   * An [IANA timezone](https://data.iana.org/time-zones/tzdb-2021a/zone1970.tab) for interpreting time-based queries. Default is the system timezone.
   */
  timezone?: string;

  /**
   * Default system instruction prompt.
   */
  systemInstructions?: string;

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
export type PromptQLClientV1 = {
  /**
   * The [Natural Language Query API](https://hasura.io/docs/promptql/promptql-apis/natural-language-api/) allows you to interact with PromptQL directly, sending messages and receiving responses.
   * The response is non-streaming.
   */
  query: (
    body: PromptQLQueryRequestV1,
    queryOptions?: FetchOptions,
  ) => Promise<QueryResponse>;

  /**
   * The streaming response sends chunks of data in Server-Sent Events (SSE) format.
   * If the callback isn't set the client returns the raw response and you need to handle the response manually.
   */
  queryStream: (
    body: PromptQLQueryRequestV1,
    callback?: (data: QueryResponseChunk) => void | Promise<void>,
    queryOptions?: FetchOptions,
  ) => Promise<Response>;

  /**
   * Execute a PromptQL program with your data.
   */
  executeProgram: (
    body: PromptQLExecuteRequestV1,
    executeOptions?: FetchOptions,
  ) => Promise<PromptQlExecutionResult>;
};

/**
 * The request body to the [Natural Language Query API](https://hasura.io/docs/promptql/promptql-apis/natural-language-api/) version 1.
 *
 * @export
 */
export type PromptQLQueryRequestV1 = Omit<
  QueryRequestV1,
  'timezone' | 'version' | 'ddn' | 'stream'
> & {
  /**
   * An [IANA timezone](https://data.iana.org/time-zones/tzdb-2021a/zone1970.tab) for interpreting time-based queries. Default is the timezone from the client config.
   */
  timezone?: string;

  /**
   * DDN configuration including URL and headers. Used to override the default client settings.
   */
  ddn?: Partial<DdnConfig>;
};

/**
 * The request body to the [Execute Program API](https://hasura.io/docs/promptql/promptql-apis/execute-program-api/).
 *
 * @export
 */
export type PromptQLExecuteRequestV1 = Omit<
  ExecuteRequestV1,
  'ddn' | 'version' | 'ai_primitives_llm' | 'artifacts'
> & {
  /**
   * DDN configuration including URL and headers. Used to override the default client settings.
   */
  ddn?: Partial<DdnConfig>;

  /**
   * Ai Primitives LLM to be used for executing program.
   */
  ai_primitives_llm?: LlmConfigV1;

  /**
   * Embedded artifacts for the program.
   */
  artifacts?: Artifact[];
};
