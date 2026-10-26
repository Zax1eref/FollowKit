import {snapshotDatabase,restoreDatabase,verifyDatabase} from '../src/server/recovery.mjs';
const [operation,source,destination,...extra]=process.argv.slice(2);
try{
 if(extra.length||!source||!['backup','restore','verify'].includes(operation)||(operation==='verify'?!!destination:!destination))throw Error('Usage: node scripts/database.mjs backup|restore SOURCE NEW_DESTINATION; or verify SOURCE');
 const result=operation==='verify'?verifyDatabase(source):(operation==='backup'?snapshotDatabase:restoreDatabase)(source,destination);
 console.log(JSON.stringify({operation,...result},null,2));
}catch(error){console.error(error.message);process.exitCode=1}
