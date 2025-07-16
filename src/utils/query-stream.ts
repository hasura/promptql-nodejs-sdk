import type { QueryResponseChunk } from '../promptql';

export const DATA_CHUNK_PREFIX = 'data: ';

export const readQueryStream = async (
  response: Response,
  callback?: (data: QueryResponseChunk) => void | Promise<void>,
  signal?: AbortSignal | null | undefined,
): Promise<number> => {
  if (typeof callback !== 'function' || !response.body) {
    return 0;
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

    for (let i = 0; i < rawChunks.length; i++) {
      const chunk = rawChunks[i]!;
      const line = chunk.trim();

      // cache the incomplete chunk to parse later.
      if (line[line.length - 1] !== '}') {
        incompleteChunk += i > 0 ? `data: ${chunk}` : chunk;
        return;
      }

      let data: QueryResponseChunk | undefined;

      try {
        data = JSON.parse(line);
      } catch (err) {
        incompleteChunk += i > 0 ? `data: ${line}` : line;
      }

      if (data) {
        await callback(data);
      }
    }
  };

  while (true) {
    if (signal?.aborted) {
      await response.body.cancel();
      break;
    }

    try {
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
    } catch (err) {
      await response.body.cancel();

      throw err;
    }
  }

  if (incompleteChunk) {
    await handleChunk('');
  }

  return responseSize;
};
