import type { IncomingHttpHeaders } from 'node:http';
import type {
  ApiAnthropicConfig,
  ApiOpenAiConfig,
  DdnConfig,
  ExecuteRequest,
  HasuraLlmConfig,
  PromptQlExecutionResult,
  QueryRequest,
  QueryResponse,
  QueryResponseChunk,
  TableArtifact,
  TextArtifact,
  ValidationError,
  VisualizationArtifact,
} from './promptql';

// LlmConfig represents a union type of LLM config.
export type LlmConfig = HasuraLlmConfig | ApiOpenAiConfig | ApiAnthropicConfig;

/**
 * PromptQL client config contains common settings to connect the PromptQL API.
 *
 * @export
 * @typedef {PromptQLClientOptions}
 */
export type PromptQLClientConfig = {
  /**
   * PromptQL API key created from project settings.
   *
   * @type {string}
   */
  apiKey: string;

  /**
   * DDN configuration including URL and headers.
   *
   * @type {(DdnConfig | (() => DdnConfig | Promise<DdnConfig>))}
   */
  ddn: DdnConfig | (() => DdnConfig | Promise<DdnConfig>);

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
   * Default LLM provider configuration for the natural language API.
   *
   * @type {?(LlmConfig)}
   */
  llm?: LlmConfig;

  /**
   * Default AI Primitives LLM provider configuration.
   *
   * @type {?(LlmConfig)}
   */
  aiPrimitivesLlm?: LlmConfig;

  /**
   * An [IANA timezone](https://data.iana.org/time-zones/tzdb-2021a/zone1970.tab) for interpreting time-based queries. Default is the system timezone.
   *
   * @type {?string}
   */
  timezone?: string;

  /**
   * Default system instruction prompt.
   *
   * @type {?string}
   */
  systemInstructions?: string;

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
 * @typedef {PromptQLClient}
 */
export type PromptQLClient = {
  /**
   * The [Natural Language Query API](https://hasura.io/docs/promptql/promptql-apis/natural-language-api/) allows you to interact with PromptQL directly, sending messages and receiving responses.
   * The response is non-streaming.
   *
   * @param {PromptQLQueryRequest} body
   * @param {?FetchOptions} [queryOptions]
   * @returns {Promise<QueryResponse>}
   */
  query: (
    body: PromptQLQueryRequest,
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
    body: PromptQLQueryRequest,
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
 * PromptQL artifacts are stores of data and can be referenced from PromptQL programs. PromptQL programs can create artifacts.
 *
 * @export
 * @typedef {Artifact}
 */
export type Artifact = TextArtifact | TableArtifact | VisualizationArtifact;

/**
 * The request body to the [Natural Language Query API](https://hasura.io/docs/promptql/promptql-apis/natural-language-api/).
 *
 * @export
 * @typedef {PromptQLQueryRequest}
 */
export type PromptQLQueryRequest = Omit<
  QueryRequest,
  'timezone' | 'ddn' | 'version' | 'stream'
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
   * @type {?Partial<DdnConfig>}
   */
  ddn?: Partial<DdnConfig>;
};

/**
 * Optional fetch options to the PromptQL API.
 *
 * @export
 * @typedef {FetchOptions}
 */
export type FetchOptions = Omit<RequestInit, 'method' | 'body'>;

/**
 * The request body to the [Execute Program API](https://hasura.io/docs/promptql/promptql-apis/execute-program-api/).
 *
 * @export
 * @typedef {PromptQLExecuteRequest}
 */
export type PromptQLExecuteRequest = Omit<
  ExecuteRequest,
  'ddn' | 'version' | 'ai_primitives_llm' | 'artifacts'
> & {
  /**
   * DDN configuration including URL and headers. Used to override the default client settings.
   *
   * @type {?Partial<DdnConfig>}
   */
  ddn?: Partial<DdnConfig>;

  /**
   * Ai Primitives LLM to be used for executing program.
   *
   * @type {?LlmConfig}
   */
  ai_primitives_llm?: LlmConfig;

  /**
   * Embedded artifacts for the program.
   *
   * @type {?Artifact[]}
   */
  artifacts?: Artifact[];
};

/**
 * A general GraphQL error that is retrieved from the PromptQL server.
 *
 * @export
 * @class PromptQLError
 * @typedef {PromptQLError}
 * @extends {Error}
 */
export class PromptQLError extends Error {
  public detail: ValidationError[] = [];

  public constructor(detail: ValidationError[], message?: string) {
    super(message || detail.map((item) => item.msg).join('. '));
    this.detail = detail;
  }
}
