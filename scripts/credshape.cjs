const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const raw = fs.readFileSync(path.join(os.homedir(), '.dsh', '.credentials.yaml'), 'utf8');
const lines = raw.split(/\r?\n/);
// Show the masked structure from the top so the nesting is clear.
for (let i = 0; i < Math.min(lines.length, 16); i++) {
  const masked = lines[i].replace(/(:\s*)(\S{8,})/g, (_, a, b) => a + b.slice(0, 4) + '...[' + b.length + ']');
  console.log(String(i).padStart(3), '|', masked);
}
console.log('total lines:', lines.length);