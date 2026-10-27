import {createHash} from 'node:crypto';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// Fixture-only contract. Checkpoint must be obtained independently of the restored backup.
// A hash alone does not authenticate a production deletion authority.
export function deletionSubjects(bytes, checkpoint) {
  const fail = () => {throw Error('invalid_deletion_checkpoint');};
  if (!Buffer.isBuffer(bytes) || bytes.length > 65536 || !checkpoint || typeof checkpoint.source !== 'string' || !checkpoint.source || digest(bytes) !== checkpoint.sha256) fail();
  let data; try {data = JSON.parse(bytes.toString('utf8'));} catch {fail();}
  if (data?.format !== 'followkit-deletion-fixture-v1' || data.source !== checkpoint.source ||
      !Number.isSafeInteger(data.sequence) || !Number.isSafeInteger(checkpoint.sequence) || data.sequence < 1 || data.sequence !== checkpoint.sequence ||
      !Array.isArray(data.subjects) || data.subjects.length > 1000 || data.subjects.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) fail();
  return [...new Set(data.subjects.map(id => id.toLowerCase()))];
}
