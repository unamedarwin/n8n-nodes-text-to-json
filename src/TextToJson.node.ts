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
  start?: number;
  length?: number;
  index?: number;
  regex?: string;
}

interface RecordDefinition {
  recordType: string;
  matcher: RegExp;
  delimiter?: string;
  fields: FieldDefinition[];
}

export class TextToJson implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Text to JSON',
    name: 'textToJson',
    icon: 'file:./icons/text-to-json.svg',
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
                description: 'Label for this record type',
              },
              {
                displayName: 'Matcher (prefix or regex)',
                name: 'matcher',
                type: 'string',
                default: '',
                description: 'Line prefix or regular expression',
              },
              {
                displayName: 'Delimiter (if delimited)',
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
                        description: 'JSON key for this field',
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
                      },
                      {
                        displayName: 'Start Position',
                        name: 'start',
                        type: 'number',
                        default: 0,
                        displayOptions: { show: { type: ['fixed'] } },
                      },
                      {
                        displayName: 'Length',
                        name: 'length',
                        type: 'number',
                        default: 0,
                        displayOptions: { show: { type: ['fixed'] } },
                      },
                      {
                        displayName: 'Delimiter Index',
                        name: 'index',
                        type: 'number',
                        default: 0,
                        displayOptions: { show: { type: ['delimited'] } },
                      },
                      {
                        displayName: 'Regex',
                        name: 'regex',
                        type: 'string',
                        default: '\\[(.*?)\\]',
                        displayOptions: { show: { type: ['delimitedArray'] } },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        displayName: 'Aggregate by Record Type',
        name: 'aggregateByRecordType',
        type: 'boolean',
        default: false,
        description:
          'Group all parsed records into a single item with one array per recordType; otherwise output one item per line',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputItems = this.getInputData();
    const allOutput: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < inputItems.length; itemIndex++) {
      const fileContent = this.getNodeParameter('fileContent', itemIndex) as string;
      let recordDefsRaw = this.getNodeParameter('recordDefs.record', itemIndex) as any;
      const aggregate = this.getNodeParameter('aggregateByRecordType', itemIndex) as boolean;

      if (!Array.isArray(recordDefsRaw) || recordDefsRaw.length === 0) {
        throw new Error('You must configure at least one Record Definition');
      }

      // Precompile record definitions
      const recordDefs: RecordDefinition[] = recordDefsRaw.map((r: any) => {
        let matcher: RegExp;
        try {
          matcher = new RegExp(r.matcher);
        } catch {
          matcher = new RegExp('^' + r.matcher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
        return {
          recordType: r.recordType,
          matcher,
          delimiter: r.delimiter,
          fields: r.fields.field.map((f: any) => ({
            name: f.name,
            type: f.type,
            start: f.start,
            length: f.length,
            index: f.index,
            regex: f.regex,
          })),
        };
      });

      // Split lines, strip BOM, drop empty
      const lines = fileContent
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);

      // Parse lines into items
      const parsedItems: INodeExecutionData[] = [];
      for (const line of lines) {
        for (const def of recordDefs) {
          if (!def.matcher.test(line)) continue;
          const json: any = {};
          for (const field of def.fields) {
            switch (field.type) {
              case 'delimitedArray': {
                const re = new RegExp(field.regex || '\\[(.*?)\\]', 'g');
                json[field.name] = Array.from(line.matchAll(re), (m) => (m as RegExpMatchArray)[1].trim());
                break;
              }
              case 'delimited': {
                const parts = def.delimiter ? line.split(def.delimiter) : [line];
                json[field.name] = parts[field.index!] ?.trim() || '';
                break;
              }
              default:
                json[field.name] = line.substr(field.start!, field.length!).trim();
            }
          }
          json.__recordType = def.recordType;
          parsedItems.push({ json });
          break;
        }
      }

      if (aggregate) {
        const aggregated: Record<string, any[]> = {};
        for (const def of recordDefs) {
          aggregated[def.recordType] = [];
        }
        for (const { json } of parsedItems) {
          const { __recordType, ...rest } = json as any;
          aggregated[__recordType].push(rest);
        }
        allOutput.push({ json: aggregated });
      } else {
        allOutput.push(...parsedItems);
      }
    }

    return this.prepareOutputData(allOutput);
  }
}
