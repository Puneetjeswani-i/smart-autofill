const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/autofill.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Simple JSON-based database (zero native dependencies)
class SimpleDB {
  constructor(dbPath) {
    this.path = dbPath;
    this.data = { profiles: {}, extractions: {} };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) {
        this.data = JSON.parse(fs.readFileSync(this.path, 'utf8'));
      }
    } catch {}
  }

  _save() {
    fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  prepare(sql) {
    const self = this;
    return {
      run(...args) {
        const s = sql.trim().toUpperCase();

        if (s.startsWith('INSERT INTO PROFILES')) {
          const [id, data] = args;
          self.data.profiles[id] = { id, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          self._save();
        } else if (s.startsWith('UPDATE PROFILES')) {
          const [data, id] = args;
          if (self.data.profiles[id]) {
            self.data.profiles[id].data = data;
            self.data.profiles[id].updated_at = new Date().toISOString();
          }
          self._save();
        } else if (s.startsWith('DELETE FROM PROFILES')) {
          const [id] = args;
          if (id) delete self.data.profiles[id];
          else self.data.profiles = {};
          self._save();
        } else if (s.startsWith('INSERT INTO EXTRACTIONS')) {
          const [id, raw_text, parsed_data, confidence] = args;
          self.data.extractions[id] = { id, raw_text, parsed_data, confidence, created_at: new Date().toISOString() };
          self._save();
        } else if (s.startsWith('DELETE FROM EXTRACTIONS')) {
          self.data.extractions = {};
          self._save();
        }
      },
      get(...args) {
        const s = sql.trim().toUpperCase();
        if (s.includes('FROM PROFILES')) {
          const [id] = args;
          return id ? self.data.profiles[id] || null : null;
        }
        return null;
      },
      all() { return []; }
    };
  }

  exec(sql) { /* DDL no-op for JSON store */ }

  getAllProfiles() {
    return Object.values(this.data.profiles || {});
  }
}

let db;

function initDB() {
  db = new SimpleDB(DB_PATH);
  console.log('✅ Database initialized (JSON store)');
  return db;
}

function getDB() {
  if (!db) initDB();
  return db;
}

module.exports = { initDB, getDB };
