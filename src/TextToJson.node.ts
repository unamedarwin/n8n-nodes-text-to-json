import {
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  IExecuteFunctions,
  NodeConnectionType,
  IDataObject,
} from 'n8n-workflow';

/**
 * Cast a raw string to the specified output type.
 */
function castValue(
  value: string,
  type?: 'string' | 'number' | 'boolean' | 'date' | 'json',
  format?: string,
): any {
  if (value == null) return value;
  switch (type) {
    case 'number':
      // Remove leading zeros
      return Number(value.replace(/^0+(?!$)/, ''));
    case 'boolean':
      return ['true', '1', 'yes'].includes(value.toLowerCase());
    case 'date':
      // Basic Date parsing; use a library for custom formats
      return new Date(value);
    case 'json':
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
}

interface FieldDefinition {
  name: string;
  type: 'fixed' | 'delimited' | 'delimitedArray';
  start?: number;
  length?: number;
  index?: number;
  regex?: string;
  outputType?: 'string' | 'number' | 'boolean' | 'date' | 'json';
  dateFormat?: string;
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
    description:
      'Parse plain-text files into JSON based on dynamic schema, with nested child-line support',
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
        description: 'The raw text content of the file to parse',
      },
      {
        displayName: 'Record Definitions',
        name: 'recordDefs',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true, sortable: true },
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
                description: 'A label for this record type',
              },
              {
                displayName: 'Matcher (prefix or regex)',
                name: 'matcher',
                type: 'string',
                default: '',
                description: 'Prefix or regex to identify this record',
              },
              {
                displayName: 'Delimiter (if delimited fields)',
                name: 'delimiter',
                type: 'string',
                default: '',
                description: 'Separator for delimited fields (empty = fixed-width)',
              },
              {
                displayName: 'Fields',
                name: 'fields',
                type: 'fixedCollection',
                typeOptions: { multipleValues: true, sortable: true },
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
                        displayOptions: { show: { type: ['fixed'] } },
                      },
                      {
                        displayName: 'Length',
                        name: 'length',
                        type: 'number',
                        default: 0,
                        description: 'Number of characters for fixed-width',
                        displayOptions: { show: { type: ['fixed'] } },
                      },
                      {
                        displayName: 'Delimiter Index',
                        name: 'index',
                        type: 'number',
                        default: 0,
                        description: 'Column index for delimited fields',
                        displayOptions: { show: { type: ['delimited'] } },
                      },
                      {
                        displayName: 'Regex',
                        name: 'regex',
                        type: 'string',
                        default: '\\[(.*?)\\]',
                        description: 'Regex to capture all matches (for arrays)',
                        displayOptions: { show: { type: ['delimitedArray'] } },
                      },
                      {
                        displayName: 'Output Type',
                        name: 'outputType',
                        type: 'options',
                        options: [
                          { name: 'String', value: 'string' },
                          { name: 'Number', value: 'number' },
                          { name: 'Boolean', value: 'boolean' },
                          { name: 'Date', value: 'date' },
                          { name: 'JSON', value: 'json' },
                        ],
                        default: 'string',
                        description: 'Cast the extracted value to this type',
                      },
                      {
                        displayName: 'Date Format',
                        name: 'dateFormat',
                        type: 'string',
                        default: 'yyyy-MM-dd',
                        description: 'Format for parsing dates (if Output Type is Date)',
                        displayOptions: { show: { outputType: ['date'] } },
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
                        description: 'Field name holding number of child lines',
                      },
                      {
                        displayName: 'Child Record Type',
                        name: 'childRecordType',
                        type: 'string',
                        default: '',
                        description: 'Record type to apply to those child lines',
                      },
                      {
                        displayName: 'Children Field Name',
                        name: 'childrenFieldName',
                        type: 'string',
                        default: '',
                        description: '(Optional) JSON key under which to nest them',
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
          'If checked, produces one item with arrays per recordType; otherwise one item per record',
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

      // Build typed RecordDefinition objects
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
        const fields: FieldDefinition[] = r.fields.field.map((f: any) => ({
          name: f.name,
          type: f.type,
          start: f.start,
          length: f.length,
          index: f.index,
          regex: f.regex,
          outputType: f.outputType,
          dateFormat: f.dateFormat,
        }));
        return {
          recordType: r.recordType,
          matcher,
          delimiter: r.delimiter,
          fields,
          childDefinitions: childDefs,
        };
      });

      // Create a map for quick lookup
      const recordDefsMap = Object.fromEntries(
        recordDefs.map((d) => [d.recordType, d] as [string, RecordDefinition]),
      );

      // Split content into lines, strip BOM, drop empty
      const lines = fileContent
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0);

      /**
       * Parse a single line according to the definition.
       */
      const parseLine = (def: RecordDefinition, line: string): IDataObject => {
        const obj: IDataObject = {};
        for (const field of def.fields) {
          let raw: string | string[];
          if (field.type === 'delimitedArray') {
            const re = new RegExp(field.regex || '\\[(.*?)\\]', 'g');
            raw = Array.from(line.matchAll(re), (m) => (m as RegExpMatchArray)[1].trim());
            obj[field.name] = (raw as string[]).map((v) =>
              castValue(v, field.outputType, field.dateFormat),
            );
          } else if (field.type === 'delimited') {
            const parts = def.delimiter ? line.split(def.delimiter) : [line];
            raw = parts[field.index!] ?.trim() || '';
            obj[field.name] = castValue(raw as string, field.outputType, field.dateFormat);
          } else {
            raw = line.substr(field.start!, field.length!).trim();
            obj[field.name] = castValue(raw, field.outputType, field.dateFormat);
          }
        }
        obj.__recordType = def.recordType;
        return obj;
      };

      /**
       * Recursively parse a block with optional childDefinitions.
       * Returns the parsed item and the next index to process.
       */
      const parseBlock = (
        startIdx: number,
        def: RecordDefinition,
      ): [INodeExecutionData, number] => {
        const parentJson = parseLine(def, lines[startIdx]);
        let idx = startIdx + 1;

        if (def.childDefinitions) {
          for (const childDef of def.childDefinitions) {
            const count = parseInt(parentJson[childDef.countField] as string, 10) || 0;
            const childSchema = recordDefsMap[childDef.childRecordType];
            const children: IDataObject[] = [];

            for (let i = 0; i < count && idx < lines.length; i++) {
              const [childItem, nextIdx] = parseBlock(idx, childSchema);
              children.push(childItem.json as IDataObject);
              idx = nextIdx;
            }
            if (childDef.childrenFieldName) {
              parentJson[childDef.childrenFieldName] = children;
            }
          }
        }

        return [{ json: parentJson }, idx];
      };

      // Main parsing loop
      const parsedItems: INodeExecutionData[] = [];
      let idx = 0;
      while (idx < lines.length) {
        const def = recordDefs.find((d) => d.matcher.test(lines[idx]));
        if (!def) {
          idx++;
          continue;
        }
        const [item, nextIdx] = parseBlock(idx, def);
        parsedItems.push(item);
        idx = nextIdx;
      }

      // Aggregate or emit one item per record
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

    // Return all processed items
    return this.prepareOutputData(allOutput);
  }
}
