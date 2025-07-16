import type {
  ApiThreadAssistantAction,
  ErrorChunk,
  QueryResponse,
  QueryResponseChunk,
  TableArtifact,
  VisualizationArtifact,
} from '../promptql';
import type { Artifact } from '../types';

/**
 * The data of query chunks
 *
 * @export
 */
export type QueryChunksData = {
  thread_id?: string;
  assistant_actions: ApiThreadAssistantAction[];
  modified_artifacts: Artifact[];
  error?: ErrorChunk;
};

/**
 * A convenient helper type to concat and merge query response chunks to a final query response.
 *
 * @export
 */
export type QueryChunks = {
  getThreadId: () => string | null;
  getAssistantActions: () => ApiThreadAssistantAction[];
  getModifiedArtifacts: () => Artifact[];
  getError: () => ErrorChunk | undefined;
  isError: () => boolean;
  push: (chunk: QueryResponseChunk) => void;
  append: (...chunks: QueryResponseChunk[]) => QueryChunks;
  toQueryResponse: () => QueryResponse;
};

/**
 * Create a query chunks builder.
 *
 * @param {?QueryChunksData} [initialValue]
 * @returns {QueryChunks}
 */
export const createQueryChunks = (
  initialValue?: QueryChunksData,
): QueryChunks => {
  const buildArtifactKey = (artifact: Artifact) =>
    `${artifact.artifact_type}:${artifact.identifier}`;

  let threadId: string | null = initialValue?.thread_id ?? null;
  let errorChunk: ErrorChunk | undefined;
  const assistantActions: ApiThreadAssistantAction[] =
    initialValue?.assistant_actions ?? [];
  const modifiedArtifacts: Record<string, Artifact> =
    initialValue?.modified_artifacts.reduce((acc, artifact) => {
      const key = buildArtifactKey(artifact);

      return Object.assign(acc, {
        [key]: artifact,
      });
    }, {}) ?? {};
  const modifiedArtifactKeys = Object.keys(modifiedArtifacts).sort();

  const clone = (): QueryChunks => {
    return createQueryChunks({
      thread_id: threadId ?? undefined,
      error: errorChunk,
      assistant_actions: assistantActions.map((action) => ({
        ...action,
      })),
      modified_artifacts: modifiedArtifactKeys.map((key) => {
        const artifact = modifiedArtifacts[key];

        switch (artifact?.artifact_type) {
          case 'table': {
            const { data, ...rest } = modifiedArtifacts[key]! as TableArtifact;

            return Object.assign(rest, {
              data: [...data],
            });
          }
          case 'visualization': {
            const { data, ...rest } = modifiedArtifacts[
              key
            ]! as VisualizationArtifact;

            return Object.assign(rest, {
              data: {
                ...data,
              },
            });
          }
          default:
            return {
              ...artifact,
            };
        }
      }) as Artifact[],
    });
  };

  const push = (chunk: QueryResponseChunk) => {
    switch (chunk.type) {
      case 'thread_metadata_chunk':
        threadId = chunk.thread_id;
        break;
      case 'error_chunk':
        {
          if (!errorChunk) {
            errorChunk = chunk;
          } else {
            errorChunk.error += chunk.error;
          }
        }

        break;
      case 'artifact_update_chunk': {
        const key = buildArtifactKey(chunk.artifact);

        const artifact = modifiedArtifacts[key];
        if (!artifact) {
          modifiedArtifacts[key] = chunk.artifact;
          modifiedArtifactKeys.push(key);
          modifiedArtifactKeys.sort();

          return;
        }

        switch (artifact.artifact_type) {
          case 'text':
            artifact.data += chunk.artifact.data;
            break;
          case 'table':
            artifact.data.push(...(chunk.artifact as TableArtifact).data);
            break;
          case 'visualization':
            artifact.data.html += (
              chunk.artifact as VisualizationArtifact
            ).data.html;
            break;
        }

        break;
      }
      case 'assistant_action_chunk': {
        for (let i = assistantActions.length; i <= chunk.index; i++) {
          assistantActions.push({});
        }

        const action = assistantActions[chunk.index]!;

        for (const name of assistantActionKeys) {
          action[name] = concatNullableStrings(action[name], chunk[name]);
        }

        break;
      }
    }
  };

  const append = (...chunks: QueryResponseChunk[]): QueryChunks => {
    const result = clone();

    for (const chunk of chunks) {
      result.push(chunk);
    }

    return result;
  };

  const getModifiedArtifacts = () =>
    modifiedArtifactKeys.map((key) => modifiedArtifacts[key]!);

  const toQueryResponse = (): QueryResponse => {
    return {
      thread_id: threadId!,
      assistant_actions: assistantActions,
      modified_artifacts: getModifiedArtifacts(),
    };
  };

  return {
    getThreadId: () => threadId,
    getAssistantActions: () => assistantActions,
    getError: () => errorChunk,
    isError: () => errorChunk !== undefined,
    getModifiedArtifacts,
    toQueryResponse,
    push,
    append,
  };
};

const concatNullableStrings = (
  src: string | null | undefined,
  target: string | null | undefined,
): string | null | undefined => {
  if (!src) {
    return target;
  }

  if (!target) {
    return src;
  }

  return src + target;
};

const assistantActionKeys: (keyof ApiThreadAssistantAction)[] = [
  'code',
  'code_error',
  'code_output',
  'message',
  'plan',
];
