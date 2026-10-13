/**
 * Database module re-exports.
 *
 * Import the `db` instance and schema from here throughout the codebase.
 */

export { getDb, getPool, checkConnection, closeConnection } from './connection.js';
export * as schema from './schema.js';
