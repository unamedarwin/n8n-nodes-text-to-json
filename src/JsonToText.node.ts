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
    description: 'Convert JSON into formatted plain-text lines with padding and nested child records',
    defaults: {
      name: 'JSON to Text',
      color: '#772244',
    },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    properties: [
      // -------------------------------------------------------
      // Character that will separate each generated line/record
      {
        displayName: 'Newline Character',
        name: 'newLineChar',
        type: 'string',
        default: '\n',
        description: 'Character to insert between each line/record',
      },

      // -------------------------------------------------------
      // Definition of all record types you want to output
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

              // ----------------------------
              // Identifier you give this record type
              {
                displayName: 'Record Type',
                name: 'recordType',
                type: 'string',
                default: '',
                description: 'Unique label for this record type',
              },

              // ----------------------------
              // JSON path from the incoming object where this record lives
              {
                displayName: 'JSON Path',
                name: 'jsonPath',
                type: 'string',
                default: '',
                description: 'JSON key or path (e.g. "items" or "data.header") where records reside',
              },

              // ----------------------------
              // The fields that make up each fixed-width line
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

                      // ------------------------
                      // Choose whether to read this value from JSON or use a static/expression value
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

                      // ------------------------
                      // Field for comments only; not used in output
                      {
                        displayName: 'Comment',
                        name: 'comment',
                        type: 'string',
                        default: '',
                        description: 'Developer comment; not included in the generated text',
                      },

                      // ------------------------
                      // When Value Type = “From JSON”, the exact key to read
                      {
                        displayName: 'JSON Key',
                        name: 'jsonKey',
                        type: 'string',
                        default: '',
                        description: 'Property name in JSON to extract the value',
                        displayOptions: { show: { valueType: ['jsonKey'] } },
                      },

                      // ------------------------
                      // When Value Type = “Fixed Value”, the literal or expression to use
                      {
                        displayName: 'Fixed Value',
                        name: 'fixedValue',
                        type: 'string',
                        default: '',
                        description: 'Literal text or expression (e.g. {{$now.format("YYYY-MM-DD")}})',
                        displayOptions: { show: { valueType: ['fixed'] } },
                      },

                      // ------------------------
                      // Total characters this field must occupy (truncates or pads)
                      {
                        displayName: 'Length',
                        name: 'length',
                        type: 'number',
                        default: 0,
                        description: 'Fixed width (number of characters)',
                      },

                      // ------------------------
                      // Character used to pad if the value is shorter than Length
                      {
                        displayName: 'Padding Character',
                        name: 'padChar',
                        type: 'string',
                        default: ' ',
                        description: 'Character to pad with if value is shorter',
                      },

                      // ------------------------
                      // Side on which to apply padding when needed
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

              // ----------------------------
              // If this record has nested arrays you want to output immediately after
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

                      // ------------------------
                      // Key on the parent JSON where the child array lives
                      {
                        displayName: 'Children Field Name',
                        name: 'childrenFieldName',
                        type: 'string',
                        default: '',
                        description: 'JSON key holding the array of child records',
                      },

                      // ------------------------
                      // Must match one of your Record Type identifiers above
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
          valueType:  f.valueType,
          comment:    f.comment,
          jsonKey:    f.jsonKey,
          fixedValue: f.fixedValue,
          length:     f.length,
          padChar:    f.padChar,
          padDir:     f.padDirection,
        })),
        childDefinitions: (r.childDefinitions?.child || []).map((c: any) => ({
          childrenFieldName: c.childrenFieldName,
          childRecordType:   c.childRecordType,
        })),
      }));

      // Helper to access nested JSON via "a.b.c"
      const getByPath = (obj: any, path: string) => {
        if (!path) return obj;
        return path.split('.').reduce((o, key) => o?.[key], obj);
      };

      // Recursive function to format a single record (and its children)
      const formatRecord = (def: any, obj: any): string[] => {
        let line = '';
        for (const f of def.fields) {
          // choose value
          const rawVal = f.valueType === 'fixed'
            ? f.fixedValue
            : obj[f.jsonKey];
          let str = rawVal != null ? String(rawVal) : '';
          // truncate or pad
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
