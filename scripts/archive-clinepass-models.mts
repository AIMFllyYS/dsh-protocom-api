// Archive the ClinePass model list the endpoint publishes, for the guard.
import { writeFileSync } from 'node:fs'
const resp = await fetch('https://api.cline.bot/api/v1/ai/cline/recommended-models', { signal: AbortSignal.timeout(60000) });
if (resp.status !== 200) throw new Error('listing answered ' + resp.status);
const j = await resp.json() as { clinePass?: { id: string }[] };
const ids = (j.clinePass ?? []).map(m => m.id).sort();
if (ids.length === 0) throw new Error('no clinePass entries: refusing to archive an empty list');
writeFileSync(process.argv[2], JSON.stringify(ids, null, 1) + '\n');
console.log('archived ' + ids.length + ' ids');