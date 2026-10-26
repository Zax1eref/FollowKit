import {stagingPreflight} from '../src/server/staging-preflight.mjs';
// stdin only, bounded input; do not echo submitted values or parser exception messages.
try {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 65536) throw Error();
    chunks.push(chunk);
  }
  const result = await stagingPreflight(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.configurationValid ? 0 : 2;
} catch {
  console.log(JSON.stringify({configurationValid: false, releaseReady: false, errors: ['invalid_or_oversized_input']}));
  process.exitCode = 2;
}
