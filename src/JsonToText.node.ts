// src/JsonToText.node.ts
'use strict';

import {
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  NodeOperationError,
  NodeConnectionType,
} from 'n8n-workflow';

export class JsonToText implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'JSON to Text',
    name: 'jsonToText',
    icon: 'file:./icons/json-to-text.svg',
    group: ['transform'],
    version: 1,
    description: 'Convert JSON into formatted plain-text lines with padding, variable-length fields, prefixes/suffixes, and nested child records',
    defaults: {
      name: 'JSON to Text',
      color: '#772244',
    },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    properties: [
      // -------------------------------------------------------
      {
        displayName: 'Newline Character',
        name: 'newLineChar',
        type: 'string',
        default: '\n',
        description: 'Character to insert between each line/record',
      },

      // -------------------------------------------------------
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
                description: 'Unique label for this record type',
              },
              {
                displayName: 'JSON Path',
                name: 'jsonPath',
                type: 'string',
                default: '',
                description: 'JSON key or path (e.g. "items" or "data.header") where records reside',
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
                        displayName: 'Value Type',
                        name: 'valueType',
                        type: 'options',
                        options: [
                          { name: 'From JSON', value: 'jsonKey' },
                          { name: 'Fixed Value', value: 'fixed' },
                        ],
                        default: 'jsonKey',
                        description: 'Read value from JSON or use a literal/expression',
                      },
                      {
                        displayName: 'Comment',
                        name: 'comment',
                        type: 'string',
                        default: '',
                        description: 'Developer comment; not included in the generated text',
                      },
                      {
                        displayName: 'JSON Key',
                        name: 'jsonKey',
                        type: 'string',
                        default: '',
                        description: 'Property name in JSON to extract the value',
                        displayOptions: { show: { valueType: ['jsonKey'] } },
                      },
                      {
                        displayName: 'Fixed Value',
                        name: 'fixedValue',
                        type: 'string',
                        default: '',
                        description: 'Literal text or expression (e.g. {{$now.format("YYYY-MM-DD")}})',
                        displayOptions: { show: { valueType: ['fixed'] } },
                      },

                      // New: variable-length support
                      {
                        displayName: 'Variable Length',
                        name: 'variableLength',
                        type: 'boolean',
                        default: false,
                        description: 'If true, do not pad/truncate; wrap value with prefix/suffix',
                      },
                      {
                        displayName: 'Prefix',
                        name: 'prefix',
                        type: 'string',
                        default: '[',
                        description: 'String to prefix the value',
                        displayOptions: { show: { variableLength: [true] } },
                      },
                      {
                        displayName: 'Suffix',
                        name: 'suffix',
                        type: 'string',
                        default: ']',
                        description: 'String to suffix the value',
                        displayOptions: { show: { variableLength: [true] } },
                      },

                      // Fixed-width options (hidden if variableLength = true)
                      {
                        displayName: 'Length',
                        name: 'length',
                        type: 'number',
                        default: 0,
                        description: 'Fixed width (number of characters)',
                        displayOptions: { hide: { variableLength: [true] } },
                      },
                      {
                        displayName: 'Padding Character',
                        name: 'padChar',
                        type: 'string',
                        default: ' ',
                        description: 'Character to pad with if value is shorter',
                        displayOptions: { hide: { variableLength: [true] } },
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
                        displayOptions: { hide: { variableLength: [true] } },
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
                        description: 'JSON key holding the array of child records',
                      },
                      {
                        displayName: 'Child Record Type',
                        name: 'childRecordType',
                        type: 'string',
                        default: '',
                        description: 'Record Type to apply to each child element',
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

    // Helper to access nested JSON via "a.b.c"
    const getByPath = (obj: any, path: string) => {
      if (!path) return obj;
      return path.split('.').reduce((o, key) => o?.[key], obj);
    };

    for (let i = 0; i < items.length; i++) {
      const newLine = this.getNodeParameter('newLineChar', i) as string;
      const recordDefsRaw = this.getNodeParameter('recordDefs.record', i) as Array<any>;

      if (!recordDefsRaw?.length) {
        throw new NodeOperationError(this.getNode(), 'You must define at least one Record Definition', { itemIndex: i });
      }

      // Build schema from raw definitions
      const recordDefs = recordDefsRaw.map(r => ({
        recordType: r.recordType,
        jsonPath: r.jsonPath,
        fields: r.fields.field.map((f: any) => ({
          valueType:     f.valueType,
          comment:       f.comment,
          jsonKey:       f.jsonKey,
          fixedValue:    f.fixedValue,
          length:        f.length,
          padChar:       f.padChar,
          padDir:        f.padDirection,
          variableLength: f.variableLength,
          prefix:        f.prefix,
          suffix:        f.suffix,
        })),
        childDefinitions: (r.childDefinitions?.child || []).map((c: any) => ({
          childrenFieldName: c.childrenFieldName,
          childRecordType:   c.childRecordType,
        })),
      }));

      // Recursive function to format a single record (and its children)
      const formatRecord = (def: any, obj: any): string[] => {
        let line = '';
        for (const f of def.fields) {
          const rawVal = f.valueType === 'fixed'
            ? f.fixedValue
            : obj[f.jsonKey];
          const strRaw = rawVal != null ? String(rawVal) : '';

          if (f.variableLength) {
            // variable-length: just wrap with prefix/suffix
            line += `${f.prefix}${strRaw}${f.suffix}`;
          } else {
            // fixed-width: truncate or pad
            let str = strRaw;
            if (str.length > f.length) {
              str = str.slice(0, f.length);
            } else if (str.length < f.length) {
              const padCount = f.length - str.length;
              const padStr = f.padChar.repeat(padCount);
              str = f.padDir === 'left' ? padStr + str : str + padStr;
            }
            line += str;
          }
        }

        const lines = [line];

        // process child records
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

      // Build all output lines
      const allLines: string[] = [];
      for (const def of recordDefs) {
        const arr = getByPath(items[i].json, def.jsonPath);
        if (Array.isArray(arr)) {
          for (const obj of arr) {
            allLines.push(...formatRecord(def, obj));
          }
        } else if (typeof arr === 'object' && arr !== null) {
          allLines.push(...formatRecord(def, arr));
        }
      }

      output.push({ json: { text: allLines.join(newLine) } });
    }

    return this.prepareOutputData(output);
  }
}
