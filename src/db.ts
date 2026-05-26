/**
 * Database utilities
 *
 * Includes both generic utilities (to promisify sqlite3 APIs) as well as
 * CRUD operations for our table.
 */
import * as sqlite3 from 'sqlite3'
import { v4 as uuidv4} from 'uuid'

import { env } from './env'


export const DB = new sqlite3.Database(
    env.sqliteDbUri,
    sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
)


/*
 * Table names
 */

const APIKEY = 'apikey'


/*
 * Utilities (promisify the API)
 */

async function execute(db: sqlite3.Database, sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => { 
            if (err) {
                reject(err)
            }
            resolve()
        })
    })
}

async function run(db: sqlite3.Database, sql: string, params: any[] = []): Promise<any> {
    if (params && params.length > 0) {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) {
                    reject(err)
                }

                // Used to return the last insert id, as a nicety for insert operations
                resolve(this.lastID)
            })
        })
    }
    return execute(db, sql)
}

async function fetchAll(db: sqlite3.Database, sql: string, params: any[]): Promise<any[]>{
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err)
            }
            resolve(rows)
        })
    })
}

async function fetchFirst(db: sqlite3.Database, sql: string, params: any[]): Promise<any>{
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err)
            }
            resolve(row)
        })
    })
}


/*
 * Database - Setup (create tables)
 */

export async function setup(db: sqlite3.Database): Promise<void> {
    await execute(db, `
        CREATE TABLE IF NOT EXISTS ${APIKEY}(
            id INTEGER PRIMARY KEY ASC,
            rcId INTEGER NOT NULL,
            name TEXT NOT NULL,
            key TEXT NOT NULL,
            createdAt INTEGER NOT NULL,
            lastUsedAt INTEGER,
            deletedAt INTEGER
        )
    `)
    await execute(
        db,
        `CREATE INDEX IF NOT EXISTS apikeyIdxKey ON ${APIKEY}(key)`,
    )
}

/*
 * Database - `apikey` table operations
 */

export async function createKey(db: sqlite3.Database, rcId: number, name: string): Promise<any> {
    // Insert operation will return the last inserted id
    const lastID = await run(
        db,
        `INSERT INTO ${APIKEY}(rcId, name, key, createdAt) VALUES (?, ?, ?, ?)`,
        [
            rcId,
            name,
            uuidv4(),
            (new Date()).valueOf(),
        ]
    )

    if (!lastID) {
        throw new Error("No last id returned; something went wrong")
    }

    // Fetch inserted row
    const row = await fetchFirst(
        db,
        `SELECT * FROM ${APIKEY} WHERE id = ?`,
        [ lastID ],
    )
    if (!row) {
        throw new Error(`No row found for id ${lastID}`)
    }

    return row
}

export function getKey(db: sqlite3.Database, key: string): Promise<any> {
    return fetchFirst(
        db,
        `SELECT * FROM ${APIKEY} WHERE key = ? AND deletedAt IS NULL`,
        [ key ]
    )
}

export function getKeysForUser(db: sqlite3.Database, rcId: number): Promise<any[]> {
    return fetchAll(
        db,
        `SELECT * FROM ${APIKEY} WHERE rcId = ? AND deletedAt IS NULL`,
        [ rcId ],
    )
}

export async function revokeKey(db: sqlite3.Database, key: string): Promise<void> {
    await run(
        db,
        `UPDATE ${APIKEY} SET deletedAt = ? WHERE key = ?`,
        [
            (new Date()).valueOf(),
            key,
        ],
    )
}

export async function renewKey(db: sqlite3.Database, key: string): Promise<any> {
    const row = await getKey(db, key)
    if (!row) {
        throw new Error(`No row found for ${key}`)
    }

    const newRow = await createKey(db, row.rcId, row.name)
    await revokeKey(db, key)

    return newRow
}

export async function updateKeyLastUsedAt(db: sqlite3.Database, key: string): Promise<void> {
    await run(
        db,
        `UPDATE ${APIKEY} SET lastUsedAt = ? WHERE key = ?`,
        [
            (new Date()).valueOf(),
            key,
        ],
    )
}

