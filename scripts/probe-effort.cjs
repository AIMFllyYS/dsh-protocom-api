const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const raw = fs.readFileSync(path.join(os.homedir(), '.dsh', '.credentials.yaml'), 'utf8');
// Values sit in a flow mapping: '  KEY: value' with the closing brace on its own line.
const m = /^\s*OPENCODE_GO_API_KEY:\s*(\S+)\s*$/m.exec(raw);
const key = m ? m[1] : null;
if (!key) { console.log('NOT FOUND'); process.exit(1); }
console.log('key length:', key.length, 'prefix:', key.slice(0, 3));
(async () => {
  const url = 'https://opencode.ai/zen/go/v1/chat/completions';
  const probe = async (model, effort) => {
    const body = { model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 16 };
    if (effort !== null) body.reasoning_effort = effort;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'x-opencode-session': 'probe-effort' },
      body: JSON.stringify(body),
    });
    if (resp.status !== 200) {
      const t = await resp.text();
      return 'HTTP ' + resp.status + ' ' + t.slice(0, 120).replace(/\s+/g, ' ');
    }
    // Drain the stream and look for a reasoning delta.
    const text = await resp.text();
    const hasReasoning = /reasoning_content|reasoning_details|"reasoning"/.test(text);
    return 'HTTP 200 reasoning=' + hasReasoning;
  };
  for (const effort of ['xhigh', 'minimal', 'none']) {
    console.log('deepseek-v4-pro ' + effort + ' -> ' + await probe('deepseek-v4-pro', effort));
  }
})();