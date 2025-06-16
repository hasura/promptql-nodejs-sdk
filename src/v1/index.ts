import { createPromptQLClientV1 } from './client';
export * from './types';

/**
 * Create an HTTP client that implements the PromptQL API version 1.
 * @deprecated use createPromptQLClientV1 or createPromptQLClientV2 functions to create the client by version explicitly.
 *
 * @param {PromptQLClientConfigV1} options
 * @returns {PromptQLClientV1}
 */
const createPromptQLClient = createPromptQLClientV1;

export { createPromptQLClient, createPromptQLClientV1 };
