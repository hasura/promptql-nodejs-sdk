import type { HttpValidationError } from './promptql';
import { PromptQLError } from './types';

export const DATA_CHUNK_PREFIX = 'data: ';

/**
 * Decode the response as JSON.
 *
 * @async
 * @template T
 * @param {Response} response
 * @returns {Promise<T>}
 */
export const decodeResponseJson = async <T>(response: Response): Promise<T> => {
  await validateError(response);

  return response.json() as T;
};

const validateError = async (response: Response) => {
  if (response.status > 500) {
    const errorText = !response.body
      ? response.statusText
      : await response.text();

    throw new PromptQLError([], errorText);
  }

  if (response.status > 400) {
    const pqlError = (
      !response.body ? null : await response.json()
    ) as HttpValidationError | null;

    if (pqlError?.detail) {
      throw new PromptQLError(pqlError.detail);
    }

    throw new PromptQLError([
      {
        loc: [],
        msg: response.statusText,
        type: 'unknown',
      },
    ]);
  }
};
