import fs from "fs";
import path from "path";

const ensureFile = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify({ users: {} }, null, 2));
};

export class JsonStorage {
  constructor(filePath) {
    this.filePath = filePath;
    ensureFile(this.filePath);
  }

  readAll() {
    ensureFile(this.filePath);
    const raw = fs.readFileSync(this.filePath, "utf8");
    try {
      return JSON.parse(raw);
    } catch (e) {
      return { users: {} };
    }
  }

  writeAll(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  getUserData(userSub) {
    const db = this.readAll();
    return db.users[userSub] || { snapshots: [] };
  }

  saveUserData(userSub, data) {
    const db = this.readAll();
    db.users[userSub] = data;
    this.writeAll(db);
  }
}

