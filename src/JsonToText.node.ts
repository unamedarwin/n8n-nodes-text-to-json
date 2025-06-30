// src/JsonToText.node.ts
'use strict';

import { INodeType, INodeTypeDescription, INodeExecutionData, NodeOperationError, NodeConnectionType, } from 'n8n-workflow';

export class JsonToText implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'JSON to Text',
    name: 'jsonToText',
    icon: 'file:./icons/text-to-json.svg',
    group: ['transform'],
    version: 1,
    description: 'Convert JSON into formatted plain-text lines with padding and nested child records',
    defaults: {
      name: 'JSON to Text',
      color: '#772244',
    },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    properties: [
      {
        displayName: 'Newline Character',
        name: 'newLineChar',
        type: 'string',
        default: '\n',
        description: 'Character to insert between each line/record',
      },
      {
        displayName: 'Record Definitions',
        name: 'recordDefs',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true, sortable: true },
        default: {},
        placeholder: 'Add a record type',
        options: [
          {
            displayName: 'Record',
            name: 'record',
            values: [
              {
                displayName: 'Record Type',
                name: 'recordType',
                type: 'string',
                default: '',
                description: 'Identifier for this record type',
              },
              {
                displayName: 'JSON Path',
                name: 'jsonPath',
                type: 'string',
                default: '',
                description: 'JSON key or path (e.g. "items" or "data.header") where this record(s) live',
              },
              {
                displayName: 'Fields',
                name: 'fields',
                type: 'fixedCollection',
                typeOptions: { multipleValues: true, sortable: true },
                default: {},
                placeholder: 'Add a field',
                options: [
                  {
                    displayName: 'Field',
                    name: 'field',
                    values: [
                      {
                        displayName: 'JSON Key',
                        name: 'jsonKey',
                        type: 'string',
                        default: '',
                        description: 'Object key from which to read the value',
                      },
                      {
                        displayName: 'Length',
                        name: 'length',
                        type: 'number',
                        default: 0,
                        description: 'Fixed width (number of characters)',
                      },
                      {
                        displayName: 'Padding Character',
                        name: 'padChar',
                        type: 'string',
                        default: ' ',
                        description: 'Character to pad with if value is shorter',
                      },
                      {
                        displayName: 'Padding Direction',
                        name: 'padDirection',
                        type: 'options',
                        options: [
                          { name: 'Left', value: 'left' },
                          { name: 'Right', value: 'right' },
                        ],
                        default: 'right',
                        description: 'Apply padding on the left or right',
                      },
                    ],
                  },
                ],
              },
              {
                displayName: 'Child Definitions',
                name: 'childDefinitions',
                type: 'fixedCollection',
                typeOptions: { multipleValues: true, sortable: true },
                default: {},
                placeholder: 'Add a child block',
                options: [
                  {
                    displayName: 'Child',
                    name: 'child',
                    values: [
                      {
                        displayName: 'Children Field Name',
                        name: 'childrenFieldName',
                        type: 'string',
                        default: '',
                        description: 'JSON key that holds the array of child records',
                      },
                      {
                        displayName: 'Child Record Type',
                        name: 'childRecordType',
                        type: 'string',
                        default: '',
                        description: 'Record Type identifier to use for each child',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  async execute(this: any): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const output: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const newLine = this.getNodeParameter('newLineChar', i) as string;
      const recordDefsRaw = this.getNodeParameter('recordDefs.record', i) as Array<any>;

      if (!recordDefsRaw.length) {
        throw new NodeOperationError(this.getNode(), 'You must define at least one Record Definition', { itemIndex: i });
      }

      // Build schema from raw definitions
      const recordDefs = recordDefsRaw.map(r => ({
        recordType:       r.recordType,
        jsonPath:         r.jsonPath,
        fields:           r.fields.field.map((f: any) => ({
                              jsonKey: f.jsonKey,
                              length:  f.length,
                              padChar: f.padChar,
                              padDir:  f.padDirection,
                            })),
        childDefinitions: (r.childDefinitions?.child || []).map((c: any) => ({
                              childrenFieldName: c.childrenFieldName,
                              childRecordType:   c.childRecordType,
                            })),
      }));

      // Helper: get nested value via "a.b.c"
      const getByPath = (obj: any, path: string) => {
        if (!path) return obj;
        return path.split('.').reduce((o, key) => o?.[key], obj);
      };

      // Recursively format a single record (and its children)
      const formatRecord = (def: any, obj: any): string[] => {
        let line = '';
        for (const f of def.fields) {
          let str = obj[f.jsonKey] != null ? String(obj[f.jsonKey]) : '';
          if (str.length > f.length) {
            str = str.slice(0, f.length);
          } else if (str.length < f.length) {
            const padCount = f.length - str.length;
            const padStr   = f.padChar.repeat(padCount);
            str = f.padDir === 'left' ? padStr + str : str + padStr;
          }
          line += str;
        }
        const lines = [line];
        for (const childDef of def.childDefinitions) {
          const children = obj[childDef.childrenFieldName] as any[];
          if (Array.isArray(children)) {
            const schema = recordDefs.find(d => d.recordType === childDef.childRecordType);
            if (!schema) continue;
            for (const childObj of children) {
              lines.push(...formatRecord(schema, childObj));
            }
          }
        }
        return lines;
      };

      // Build all lines for this item
      const allLines: string[] = [];
      for (const def of recordDefs) {
        const arr = getByPath(items[i].json, def.jsonPath);
        if (Array.isArray(arr)) {
          for (const obj of arr) {
            allLines.push(...formatRecord(def, obj));
          }
        } else if (typeof arr === 'object') {
          allLines.push(...formatRecord(def, arr));
        }
      }

      output.push({ json: { text: allLines.join(newLine) } });
    }

    return this.prepareOutputData(output);
  }
}
