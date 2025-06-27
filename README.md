# n8n-nodes-text-to-json

A custom n8n node that reads fixed-width or delimited text files and converts them to JSON based on a dynamic schema defined by the user.

## Installation

```bash
npm install n8n-nodes-text-to-json
```

## Configuration

1. Add the node to your `.n8n/config`:
   ```json
   {
     "nodes": ["n8n-nodes-text-to-json"]
   }
   ```
2. Restart n8n.

## Node Properties

- **File Content**: The text content of the file to parse.  
- **Record Definitions**: A dynamic collection where you define:
  - `recordType`: A label for the record type.  
  - `matcher`: A prefix or regex to identify lines of this type.  
  - `delimiter`: (optional) The field separator for delimited records.  
  - `fields`: A list of field definitions with:
    - `name`: The JSON key.  
    - `type`: `fixed`, `delimited`, or `delimitedArray`.  
    - `start`/`length` (for fixed-width).  
    - `index` (for delimited).  
    - `regex` (for delimited arrays to capture all matches).  

## Usage Example

1. Set the entire file content in the **File Content** field.  
2. Add one or more record definitions to match and parse each line type.  
3. Execute the node to receive an array of JSON objects for each parsed line.  

## Contributing

1. Fork the repository.  
2. `npm install`  
3. `npm run build`  
4. `npm test`  
5. Submit a Pull Request!  

## License

MIT
