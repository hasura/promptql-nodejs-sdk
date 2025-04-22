# PromptQL NodeJS SDK 

A Node.js SDK for [PromptQL API](https://hasura.io/docs/promptql/promptql-apis/overview/).

## Install

Run the following command:

```sh
npm install @hasura/promptql
```

## Get started

### Prerequisite

- If you are new with PromptQL, follow [the quickstart guide of PromptQL](https://hasura.io/docs/promptql/quickstart/) to create a project.
- Create a PromptQL API Key in project settings tab on [https://console.hasura.io](https://console.hasura.io).
- Your Project API endpoint and security headers.

### Use PromptQL SDK

Create the PromptQL client with required configurations:

```ts
import { createPromptQLClient } from '@hasura/promptql';

const client = createPromptQLClient({
    apiKey: '<your-promptql-api-key>',
    ddn: {
        url: '<your-project-endpoint>',
        headers: {
            'Authorization': '<credential>'
        }
    },
    // You can define a lazy function for the ddn options.
    //
    // ddn: () => {{ 
    //     url: '<your-project-endpoint>',
    //     headers: {
    //         'Authorization': '<credential>'
    //     }
    // }}  
});

const runQuery = (text: string) => {
    return client.query({
        artifacts: [],
        interactions: [
            {
                user_message: {
                    text,
                }
            }
        ],
        ddn: {
            // you can override the default ddn config, 
            // for example, dynamic auth credentials
            headers: {}
        }
    });

    return response.
}

runQuery('what can you do?').then((response) => {
    console.log(response)
});
```

## Reference

### Natural Language 

The [Natural Language Query API](https://hasura.io/docs/promptql/promptql-apis/natural-language-api/) allows you to interact with PromptQL directly, sending messages and receiving responses.

#### Non-Streaming

```ts
function query(body: PromptQLQueryRequest, queryOptions?: FetchOptions) => Promise<QueryResponse>
```

#### Streaming

The streaming response sends chunks of data in Server-Sent Events (SSE) format.
If the callback isn't set the client returns the raw response and you need to handle the response manually.

```ts
function queryStream: (body: PromptQLQueryRequest, callback?: (data: QueryResponseChunk) => void | Promise<void>, queryOptions?: FetchOptions) Promise<Response>;
```

Example:

```ts
client
    .queryStream({
        artifacts: [],
        interactions: [
            user_message: {
                text: 'what can you do?',
            }
        ],
    },
    async (chunk) => {
        console.error(chunk);
    },
);
```

### Execute Program

Execute a PromptQL program with your data.

```ts
function executeProgram: (body: PromptQLExecuteRequest, executeOptions?: FetchOptions) Promise<PromptQlExecutionResult>;
```