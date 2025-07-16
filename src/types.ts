import type {
  ApiAnthropicConfig,
  ApiOpenAiConfig,
  AutomationArtifact,
  HasuraLlmConfigV1,
  TableArtifact,
  TextArtifact,
  ValidationError,
  VisualizationArtifact,
} from './promptql';

export const DEFAULT_PROMPTQL_BASE_URL = 'https://api.promptql.pro.hasura.io';

// LlmConfigV1 represents a union type of LLM config version 1.
export type LlmConfigV1 =
  | HasuraLlmConfigV1
  | ApiOpenAiConfig
  | ApiAnthropicConfig;

/**
 * PromptQL artifacts are stores of data and can be referenced from PromptQL programs. PromptQL programs can create artifacts.
 *
 * @export
 */
export type Artifact =
  | TextArtifact
  | TableArtifact
  | VisualizationArtifact
  | AutomationArtifact;

/**
 * Optional fetch options to the PromptQL API.
 *
 * @export
 */
export type FetchOptions = Omit<RequestInit, 'method' | 'body'>;

/**
 * A general GraphQL error that is retrieved from the PromptQL server.
 *
 * @export
 * @class PromptQLError
 * @extends {Error}
 */
export class PromptQLError extends Error {
  public detail: ValidationError[] = [];

  public constructor(detail: ValidationError[], message?: string) {
    super(message || detail.map((item) => item.msg).join('. '));
    this.detail = detail;
  }
}
