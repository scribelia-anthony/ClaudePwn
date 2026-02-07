import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function generateNotesTemplate(box: string, ip: string): string {
  const date = new Date().toISOString().split('T')[0];
  return `# ${box} — ${ip}
Date : ${date}

## Ports & Services
| Port | Service | Version |
|------|---------|---------|

## Web
- URLs intéressantes
- Technologies détectées

## Credentials
| User | Password/Hash | Source | Accès |
|------|---------------|--------|-------|

## Vecteurs d'attaque
- Vulnérabilités identifiées
- Exploits testés

## Flags
- User :
- Root :

## Notes
`;
}

export function readNotes(boxDir: string): string {
  const notesPath = join(boxDir, 'notes.md');
  if (!existsSync(notesPath)) return '';
  return readFileSync(notesPath, 'utf-8');
}
