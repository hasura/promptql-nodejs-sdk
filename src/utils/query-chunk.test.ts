import { expect, test } from 'vitest';
import type { QueryResponse, QueryResponseChunk } from '../promptql';
import { createQueryChunks } from './query-chunks';

test('QueryChunks', (t) => {
  const fixtures = [
    '{"type":"thread_metadata_chunk","thread_id":"9a6c9bc2-8005-4cf7-ba93-22edf90fa490"}',
    '{"message":"I\'ll re","plan":null,"code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":"trieve the list of custome","plan":null,"code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":"rs for you.","plan":null,"code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":"1","code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":". Query the customers f","code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":"unction to get the list of all customers","code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":"\\n2. Store the results in","code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":" a table artifact showing customer IDs and names","code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":null,"code":"sql = \\"\\"\\"\\nSE","code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":null,"code":"LECT id, name \\nFROM customers(","code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":null,"code":")\\nORDER BY name\\n\\"\\"\\"\\n\\ncustom","code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":null,"code":"ers = executor.r","code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":null,"code":"un_sql(sql)\\n\\nif len(customers","code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":null,"code":") == 0:\\n    executor.print(\\"No cust","code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":null,"code":"omers found.\\")\\nelse:\\n    executor.","code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":null,"code":"store_artifact(\\n    ","code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":null,"code":"    \'customer_list\',\\n        \'List of Cus","code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":null,"code":"tomers\',\\n        \'table\',\\n        customers\\n    )","code_output":null,"code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":null,"plan":null,"code":null,"code_output":"SQL statement returned 3 rows. Sample rows: [{\'id\': 3.0, \'name\': \'Jerry\'}, {\'id\': 1.0, \'name\': \'John\'}]\\n","code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"type":"artifact_update_chunk","artifact":{"identifier":"customer_list","title":"List of Customers","artifact_type":"table","data":[{"id":3,"name":"Jerry"},{"id":1,"name":"John"},{"id":2,"name":"Tom"}]}}',
    '{"message":null,"plan":null,"code":null,"code_output":"Stored table artifact: identifier = \'customer_list\', title = \'List of Customers\', number of rows = 3, sample rows preview = [{\'id\': 3, \'name\': \'Jerry\'}, {\'id\': 1, \'name\': \'John\'}]\\n","code_error":null,"type":"assistant_action_chunk","index":0}',
    '{"message":"H","plan":null,"code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":1}',
    '{"message":"ere are all the customers:\\n<artifact ide","plan":null,"code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":1}',
    '{"message":"ntifier=\'customer_list\' warning=\'I cannot see ","plan":null,"code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":1}',
    '{"message":"the","plan":null,"code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":1}',
    '{"message":" full data so I must not make up observations\' />","plan":null,"code":null,"code_output":null,"code_error":null,"type":"assistant_action_chunk","index":1}',
  ];
  const expected: QueryResponse = {
    thread_id: '9a6c9bc2-8005-4cf7-ba93-22edf90fa490',
    assistant_actions: [
      {
        code: 'sql = """\nSELECT id, name \nFROM customers()\nORDER BY name\n"""\n\ncustomers = executor.run_sql(sql)\n\nif len(customers) == 0:\n    executor.print("No customers found.")\nelse:\n    executor.store_artifact(\n        \'customer_list\',\n        \'List of Customers\',\n        \'table\',\n        customers\n    )',
        code_output:
          "SQL statement returned 3 rows. Sample rows: [{'id': 3.0, 'name': 'Jerry'}, {'id': 1.0, 'name': 'John'}]\nStored table artifact: identifier = 'customer_list', title = 'List of Customers', number of rows = 3, sample rows preview = [{'id': 3, 'name': 'Jerry'}, {'id': 1, 'name': 'John'}]\n",
        code_error: null,
        message: "I'll retrieve the list of customers for you.",
        plan: '1. Query the customers function to get the list of all customers\n2. Store the results in a table artifact showing customer IDs and names',
      },
      {
        message:
          "Here are all the customers:\n\u003cartifact identifier='customer_list' warning='I cannot see the full data so I must not make up observations' /\u003e",
      },
    ],
    modified_artifacts: [
      {
        artifact_type: 'table',
        identifier: 'customer_list',
        title: 'List of Customers',
        data: [
          { id: 3, name: 'Jerry' },
          { id: 1, name: 'John' },
          { id: 2, name: 'Tom' },
        ],
      },
    ],
  };

  let queryChunks = createQueryChunks();

  for (const rawChunk of fixtures) {
    const chunk = JSON.parse(rawChunk) as QueryResponseChunk;
    queryChunks = queryChunks.append(chunk);
  }

  expect(queryChunks.getError()).toBeFalsy();
  expect(queryChunks.toQueryResponse()).toMatchObject(expected);
});
