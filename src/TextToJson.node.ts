import {
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  IExecuteFunctions,
  NodeConnectionType,
  IDataObject,
} from 'n8n-workflow';

interface FieldDefinition {
  name: string;
  type: 'fixed' | 'delimited' | 'delimitedArray';
  start?: number;
  length?: number;
  index?: number;
  regex?: string;
}

interface ChildDefinition {
  countField: string;
  childRecordType: string;
  childrenFieldName?: string;
}

interface RecordDefinition {
  recordType: string;
  matcher: RegExp;
  delimiter?: string;
  fields: FieldDefinition[];
  childDefinitions?: ChildDefinition[];
}

export class TextToJson implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Text to JSON',
    name: 'textToJson',
    icon: 'file:./icons/text-to-json.svg',
    group: ['transform'],
    version: 1,
    description: 'Parse plain-text files into JSON according to dynamic schema, with nested child-line support',
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
                description: 'Line prefix or regular expression to identify this record',
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
              {
                displayName: 'Child Definitions',
                name: 'childDefinitions',
                type: 'fixedCollection',
                typeOptions: { multipleValues: true },
                default: {},
                placeholder: 'Add Child Block',
                options: [
                  {
                    displayName: 'Child',
                    name: 'child',
                    values: [
                      {
                        displayName: 'Count Field',
                        name: 'countField',
                        type: 'string',
                        default: '',
                        description: 'Name of the field with the number of child lines',
                      },
                      {
                        displayName: 'Child Record Type',
                        name: 'childRecordType',
                        type: 'string',
                        default: '',
                        description: 'Record type to use for these child lines',
                      },
                      {
                        displayName: 'Children Field Name',
                        name: 'childrenFieldName',
                        type: 'string',
                        default: '',
                        description: '(Optional) JSON key under which to nest the child records',
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

      // Build typed definitions with compiled regex and child info
      const recordDefs: RecordDefinition[] = recordDefsRaw.map((r: any) => {
        let matcher: RegExp;
        try {
          matcher = new RegExp(r.matcher);
        } catch {
          matcher = new RegExp('^' + r.matcher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
        const childDefs: ChildDefinition[] | undefined = Array.isArray(r.childDefinitions?.child)
          ? r.childDefinitions.child.map((c: any) => ({
              countField: c.countField,
              childRecordType: c.childRecordType,
              childrenFieldName: c.childrenFieldName,
            }))
          : undefined;
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
          childDefinitions: childDefs,
        };
      });

      // Map recordType → definition
      const recordDefsMap = Object.fromEntries(
        recordDefs.map((d) => [d.recordType, d] as [string, RecordDefinition]),
      );

      // Split into non-empty lines, strip BOM
      const lines = fileContent
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0);

      // Helper: parse one line by definition
      const parseLine = (def: RecordDefinition, line: string): IDataObject => {
        const obj: IDataObject = {};
        for (const field of def.fields) {
          if (field.type === 'delimitedArray') {
            const re = new RegExp(field.regex || '\\[(.*?)\\]', 'g');
            obj[field.name] = Array.from(line.matchAll(re), (m) => (m as RegExpMatchArray)[1].trim());
          } else if (field.type === 'delimited') {
            const parts = def.delimiter ? line.split(def.delimiter) : [line];
            obj[field.name] = parts[field.index!] ?.trim() || '';
          } else {
            obj[field.name] = line.substr(field.start!, field.length!).trim();
          }
        }
        obj.__recordType = def.recordType;
        return obj;
      };

      // Recursive parser for blocks with childDefinitions
      const parseBlock = (
        startIdx: number,
        def: RecordDefinition
      ): [INodeExecutionData[], number] => {
        const items: INodeExecutionData[] = [];
        const parentJson = parseLine(def, lines[startIdx]);
        items.push({ json: parentJson });
        let idx = startIdx + 1;

        if (def.childDefinitions) {
          for (const childDef of def.childDefinitions) {
            const count = parseInt(parentJson[childDef.countField] as string, 10) || 0;
            const childSchema = recordDefsMap[childDef.childRecordType];
            const children: IDataObject[] = [];

            for (let i = 0; i < count && idx < lines.length; i++) {
              const [childItems, nextIdx] = parseBlock(idx, childSchema);
              childItems.forEach(ci => {
                children.push(ci.json as IDataObject);
                items.push(ci);
              });
              idx = nextIdx;
            }
            if (childDef.childrenFieldName) {
              parentJson[childDef.childrenFieldName] = children;
            }
          }
        }
        return [items, idx];
      };

      // Main loop: parse all lines via parseBlock
      const parsedItems: INodeExecutionData[] = [];
      let idx = 0;
      while (idx < lines.length) {
        const line = lines[idx];
        const def = recordDefs.find((d) => d.matcher.test(line));
        if (!def) {
          idx++;
          continue;
        }
        const [blockItems, nextIdx] = parseBlock(idx, def);
        parsedItems.push(...blockItems);
        idx = nextIdx;
      }

      // Aggregate or flat
      if (aggregate) {
        const aggregated: Record<string, any[]> = {};
        for (const d of recordDefs) {
          aggregated[d.recordType] = [];
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
