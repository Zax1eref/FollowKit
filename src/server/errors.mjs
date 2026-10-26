// Shared error type without Node/database dependencies, usable by edge adapters.
export class Fault extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
