import { expect, test } from 'vitest';
import { DATA_CHUNK_PREFIX } from './utils';

test('decodeJson', (t) => {
  const fixtures: { input: string; expected: unknown }[] = [
    {
      input:
        'data: {"message":"- Track something","plan":null,"code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
      expected: {
        message: '- Track something',
        plan: null,
        code: null,
        code_output: null,
        code_error: null,
        type: 'assistant_action_chunk',
        index: 0,
      },
    },
  ];

  for (const chunk of fixtures) {
    expect(JSON.parse(chunk.input.substring(DATA_CHUNK_PREFIX.length))).toEqual(
      chunk.expected,
    );
  }
});
