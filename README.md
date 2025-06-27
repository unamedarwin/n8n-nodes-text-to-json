# n8n-nodes-text-to-json

Un node d’entrada per n8n que llegeix fitxers de text (fixed-width o delimitats) i els converteix a JSON de manera dinàmica segons l’esquema que defineix l’usuari.

## Instal·lació

```bash
npm install n8n-nodes-text-to-json
```

## Configuració

1. Afegeix el node al teu `.n8n/config`:
   ```json
   {
     "nodes": ["n8n-nodes-text-to-json"]
   }
   ```
2. Reinicia n8n.

## Propietats del node

- **File Content**: contingut del fitxer com a text.
- **Record Definitions**: col·lecció dinámica on defines:
  - `recordType`: etiqueta del tipus de registre.
  - `matcher`: prefix o regex que identifica línies d’aquest tipus.
  - `delimiter`: (opcional) caràcter separador.
  - `fields`: llista de camps amb:
    - `name`
    - `type` (`fixed` o `delimited`)
    - `start`/`length` (per fixed)
    - `index` (per delimited)

## Exemple d’ús

1. Posa tot el fitxer dins “File Content”.  
2. Crea dos record definitions: un per headers i un per línies de detall.  
3. Executa i obtindràs un array de JSONs amb tots els registres parsejats.

## Contribuir

1. Fes un fork  
2. `npm install`  
3. `npm run build`  
4. `npm test`  
5. Obre PR!

## Llicència

MIT
