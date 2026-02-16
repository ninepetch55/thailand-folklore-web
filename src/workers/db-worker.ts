
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

const DB_NAME = 'thfolklore_v1.2.sqlite3';

const log = (msg: string, data?: any) => {
    console.log(`[DatabaseWorker] ${msg}`, data || '');
};

let dbInstance: any = null;
let initPromise: Promise<any> | null = null;

const createSchema = (db: any) => {
    log('Creating Schema...');
    db.exec('BEGIN TRANSACTION;');
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS partners (
            p_id INTEGER PRIMARY KEY,
            name_json TEXT,
            type TEXT,
            country_code TEXT,
            next_cycle_date TEXT,
            contact_enc TEXT
        );`);

        db.exec(`CREATE TABLE IF NOT EXISTS projects (
            pr_id INTEGER PRIMARY KEY,
            p_id INTEGER,
            title_json TEXT,
            is_outbound INTEGER,
            status TEXT,
            meta_json TEXT,
            FOREIGN KEY(p_id) REFERENCES partners(p_id)
        );`);

        db.exec(`CREATE TABLE IF NOT EXISTS artists (
            artist_id INTEGER PRIMARY KEY,
            dna_type TEXT,
            name_json TEXT,
            soul_stamp INTEGER,
            bio_json TEXT
        );`);

        db.exec(`CREATE TABLE IF NOT EXISTS certificates (
            cert_id INTEGER PRIMARY KEY,
            serial_no TEXT,
            p_id INTEGER,
            issue_date TEXT,
            verify_hash TEXT
        );`);

        db.exec('COMMIT;');
    } catch (e) {
        db.exec('ROLLBACK;');
        throw e;
    }
};

const seedDatabase = async (db: any) => {
    log('Checking for existing data...');
    const count = db.exec('SELECT count(*) FROM partners;', { returnValue: 'resultRows' })[0][0];

    if (count > 0) {
        return { status: 'skipped', message: 'Data already exists', count };
    }

    log('Fetching init-data.json...');
    const response = await fetch('/data/init-data.json');
    if (!response.ok) throw new Error('Failed to fetch init-data.json');

    const data = await response.json();
    const { manifest, partners, projects, artists } = data;

    log(`Seeding Manifest Ver: ${manifest.version}`);

    db.exec('BEGIN TRANSACTION;');
    try {
        const pStmt = db.prepare('INSERT INTO partners (p_id, name_json, type, country_code, next_cycle_date, contact_enc) VALUES (?, ?, ?, ?, ?, ?)');
        for (const p of partners) {
            pStmt.bind([p.p_id, JSON.stringify(p.name_json), p.type, p.country_code, p.next_cycle_date, p.contact_enc]);
            pStmt.step();
            pStmt.reset();
        }
        pStmt.finalize();

        const prStmt = db.prepare('INSERT INTO projects (pr_id, p_id, title_json, is_outbound, status, meta_json) VALUES (?, ?, ?, ?, ?, ?)');
        for (const pr of projects) {
            prStmt.bind([pr.pr_id, pr.p_id, JSON.stringify(pr.title_json), pr.is_outbound ? 1 : 0, pr.status, JSON.stringify(pr.meta_json)]);
            prStmt.step();
            prStmt.reset();
        }
        prStmt.finalize();

        const aStmt = db.prepare('INSERT INTO artists (artist_id, dna_type, name_json, soul_stamp, bio_json) VALUES (?, ?, ?, ?, ?)');
        for (const a of artists) {
            aStmt.bind([a.artist_id, a.dna_type, JSON.stringify(a.name_json), a.soul_stamp ? 1 : 0, JSON.stringify(a.bio_json)]);
            aStmt.step();
            aStmt.reset();
        }
        aStmt.finalize();

        db.exec('COMMIT;');

        return {
            status: 'seeded',
            counts: {
                partners: partners.length,
                projects: projects.length,
                artists: artists.length
            }
        };
    } catch (e) {
        db.exec('ROLLBACK;');
        throw e;
    }
};

const initDatabase = async () => {
    if (dbInstance) return dbInstance;

    try {
        const sqlite3 = await sqlite3InitModule({
            print: log,
            printErr: console.error,
            locateFile: (file) => `/${file}`
        });

        if ('opfs' in sqlite3) {
            dbInstance = new sqlite3.oo1.OpfsDb(DB_NAME);
            log('OPFS Mounted.');
        } else {
            dbInstance = new sqlite3.oo1.DB(DB_NAME, 'ct');
            log('Transient DB Mounted.');
        }

        try {
            dbInstance.exec('PRAGMA journal_mode=WAL;');
        } catch (e) {
            dbInstance.exec('PRAGMA journal_mode=DELETE;');
        }

        createSchema(dbInstance);

        return dbInstance;

    } catch (error) {
        console.error('Init Error:', error);
        throw error;
    }
};

const getDB = () => {
    if (!initPromise) initPromise = initDatabase();
    return initPromise;
};

// @ts-ignore
self.onconnect = (e: MessageEvent) => {
    const port = e.ports[0];

    port.onmessage = async (event: MessageEvent) => {
        try {
            await getDB();
            const { id, action } = event.data;

            if (action === 'SEED_DATA') {
                const result = await seedDatabase(dbInstance);
                port.postMessage({ id, status: 'success', data: result });
            } else if (action === 'QUERY_COUNTS') {
                const pCount = dbInstance.exec('SELECT count(*) FROM partners;', { returnValue: 'resultRows' })[0][0];
                const prCount = dbInstance.exec('SELECT count(*) FROM projects;', { returnValue: 'resultRows' })[0][0];
                const aCount = dbInstance.exec('SELECT count(*) FROM artists;', { returnValue: 'resultRows' })[0][0];

                port.postMessage({ id, status: 'success', data: { partners: pCount, projects: prCount, artists: aCount } });
            } else {
                port.postMessage({ id, status: 'connected', message: 'Ready' });
            }
        } catch (err: any) {
            console.error(err);
            port.postMessage({ id: event.data?.id, status: 'error', message: err.message });
        }
    };
};

getDB();
