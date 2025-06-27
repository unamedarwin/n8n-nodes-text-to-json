import {
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  IExecuteFunctions,
  NodeConnectionType,
} from 'n8n-workflow';

interface FieldDefinition {
  name: string;
  type: 'fixed' | 'delimited' | 'delimitedArray';
  start?: number;    // for fixed-width
  length?: number;   // for fixed-width
  index?: number;    // for delimited
  regex?: string;    // for delimitedArray
}

interface RecordDefinition {
  recordType: string;
  matcher: string;       // prefix or regex
  delimiter?: string;    // if delimited fields are used
  fields: FieldDefinition[];
}

export class TextToJson implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Text to JSON',
    name: 'textToJson',
    group: ['transform'],
    version: 1,
    description: 'Parse plain-text files into JSON according to dynamic schema',
    defaults: {
      name: 'Text to JSON',
      color: '#772244',
    },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    properties: [
      {
        displayName: 'File Content',
        name: 'fileContent',
        type: 'string',
        default: '',
        description: 'The entire text file content to parse',
      },
      {
        displayName: 'Record Definitions',
        name: 'recordDefs',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        placeholder: 'Add Record Type',
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
                description: 'An arbitrary label for this record type',
              },
              {
                displayName: 'Matcher (prefix or regex)',
                name: 'matcher',
                type: 'string',
                default: '',
                description: 'Line prefix or regular expression to identify this record',
              },
              {
                displayName: 'Delimiter (if delimited fields)',
                name: 'delimiter',
                type: 'string',
                default: ',',
                description: 'Field separator for delimited fields',
              },
              {
                displayName: 'Fields',
                name: 'fields',
                type: 'fixedCollection',
                typeOptions: { multipleValues: true },
                default: {},
                placeholder: 'Add Field',
                options: [
                  {
                    displayName: 'Field',
                    name: 'field',
                    values: [
                      {
                        displayName: 'Field Name',
                        name: 'name',
                        type: 'string',
                        default: '',
                        description: 'The JSON key for this field',
                      },
                      {
                        displayName: 'Type',
                        name: 'type',
                        type: 'options',
                        options: [
                          { name: 'Fixed-width', value: 'fixed' },
                          { name: 'Delimited', value: 'delimited' },
                          { name: 'Delimited Array', value: 'delimitedArray' },
                        ],
                        default: 'fixed',
                        description: 'How to extract this field',
                      },
                      {
                        displayName: 'Start Position',
                        name: 'start',
                        type: 'number',
                        default: 0,
                        description: 'Zero-based index for fixed-width',
                        displayOptions: {
                          show: {
                            type: ['fixed'],
                          },
                        },
                      },
                      {
                        displayName: 'Length',
                        name: 'length',
                        type: 'number',
                        default: 0,
                        description: 'Number of characters for fixed-width',
                        displayOptions: {
                          show: {
                            type: ['fixed'],
                          },
                        },
                      },
                      {
                        displayName: 'Delimiter Index',
                        name: 'index',
                        type: 'number',
                        default: 0,
                        description: 'Column index for delimited fields',
                        displayOptions: {
                          show: {
                            type: ['delimited'],
                          },
                        },
                      },
                      {
                        displayName: 'Regex',
                        name: 'regex',
                        type: 'string',
                        default: '\\[(.*?)\\]',
                        description: 'Regex to capture all occurrences (use with Delimited Array)',
                        displayOptions: {
                          show: {
                            type: ['delimitedArray'],
                          },
                        },
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

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const fileContent = this.getNodeParameter('fileContent', 0) as string;
    const recordDefsRaw = this.getNodeParameter('recordDefs.record', 0) as Array<any>;

    // Map raw definitions to typed ones
    const recordDefs: RecordDefinition[] = recordDefsRaw.map((r: any) => ({
      recordType: r.recordType,
      matcher: r.matcher,
      delimiter: r.delimiter,
      fields: r.fields.field.map((f: any) => ({
        name: f.name,
        type: f.type,
        start: f.start,
        length: f.length,
        index: f.index,
        regex: f.regex,
      })),
    }));

    const lines = fileContent.split(/\r?\n/).filter(l => l !== '');
    const output: INodeExecutionData[] = [];

    for (const line of lines) {
      for (const def of recordDefs) {
        let isMatch = false;
        try {
          const regex = new RegExp(def.matcher);
          isMatch = regex.test(line);
        } catch {
          // if invalid regex, fallback to startsWith
          isMatch = line.startsWith(def.matcher);
        }
        if (!isMatch) continue;

        const obj: any = { __recordType: def.recordType };
        for (const f of def.fields) {
          if (f.type === 'delimitedArray') {
            const regex = new RegExp(f.regex!, 'g');
            obj[f.name] = Array.from(line.matchAll(regex), m => m[1].trim());
          } else if (f.type === 'delimited') {
            const parts = def.delimiter
              ? line.split(def.delimiter)
              : [line];
            obj[f.name] = parts[f.index!]?.trim() || '';
          } else {
            // fixed-width
            obj[f.name] = line.substr(f.start!, f.length!).trim();
          }
        }

        output.push({ json: obj });
        break; // stop after first matching record definition
      }
    }
    return this.prepareOutputData(output);
  }
}
