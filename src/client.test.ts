import { describe, expect, it } from 'vitest';
import { createPromptQLClient } from './client';
import { createQueryChunks } from './query-chunks';
import type { Artifact } from './types';

describe('PromptQLClient', () => {
  const apiKey = getEnv('PROMPTQL_API_KEY');
  const ddnBaseUrl = getEnv('HASURA_DDN_BASE_URL');
  const ddnAuthToken = getEnv('DDN_AUTH_TOKEN');
  const expectedArtifact = [
    {
      id: 1,
      name: 'John',
    },
    {
      id: 2,
      name: 'Tom',
    },
    {
      id: 3,
      name: 'Jerry',
    },
  ];

  const assertArtifacts = (artifacts: Artifact[]) => {
    expect(artifacts[0]?.artifact_type).toEqual('table');
    expect(
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      (artifacts[0]?.data as Record<string, any>[]).sort((a, b) => a.id - b.id),
    ).toMatchObject(expectedArtifact);
  };

  const client = createPromptQLClient({
    apiKey,
    ddn: {
      url: ddnBaseUrl,
      headers: {
        Authorization: ddnAuthToken,
      },
    },
  });

  it('queryAndExecuteProgram', async () => {
    let code = '';

    const result = await client.query({
      interactions: [
        {
          user_message: {
            text: 'get list customers',
          },
        },
      ],
    });

    expect(result.assistant_actions[0]?.message).toBeTruthy();
    assertArtifacts(result.modified_artifacts);

    code =
      result.assistant_actions
        .map((action) => action.code)
        .findLast((action) => action) ?? '';

    expect(code).toBeTruthy();

    if (!code) {
      return;
    }

    const executeResult = await client.executeProgram({
      code,
    });

    assertArtifacts(executeResult.modified_artifacts);
  });

  it('queryStream', async () => {
    const chunks = createQueryChunks();

    await client.queryStream(
      {
        interactions: [
          {
            user_message: {
              text: 'get list customers',
            },
          },
        ],
      },
      (data) => {
        chunks.push(data);
      },
    );

    expect(chunks.getAssistantActions()[0]?.message).toBeTruthy();
    assertArtifacts(chunks.getModifiedArtifacts());
  });
});

const getEnv = (name: string): string => {
  const value = process.env[name];
  expect(value).toBeTruthy();

  return value as string;
};
