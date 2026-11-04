// npm run db:migrate : DB를 열고 미적용 마이그레이션을 적용한다 (앱을 켜지 않고 확인하고 싶을 때)
import { openAndMigrate, resolveDbPath, resolveMigrationsDir } from "../src/lib/db/connection.ts";
import { runMigrations } from "../src/lib/db/migrate.ts";

const file = resolveDbPath();
const db = openAndMigrate(file);
const again = runMigrations(db, resolveMigrationsDir());
console.log(`DB 파일: ${file}`);
console.log(`방금 새로 적용된 마이그레이션: ${again.length}개 (이미 적용된 건 건너뜀)`);
const rows = db.prepare("SELECT filename FROM schema_migrations ORDER BY filename").all() as { filename: string }[];
console.log("적용된 목록:", rows.map((r) => r.filename).join(", "));
db.close();
