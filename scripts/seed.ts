// npm run db:seed : 카드/태그가 비어 있는 DB에만 예시 데이터를 넣는다. 이미 데이터가 있으면 거부한다.
import { join } from "node:path";
import { openAndMigrate, resolveDbPath } from "../src/lib/db/connection.ts";
import { seedDatabase } from "../src/lib/db/seed.ts";

const file = resolveDbPath();
const db = openAndMigrate(file);
const inserted = seedDatabase(db, join(process.cwd(), "seed", "seed.sql"));
console.log(`DB 파일: ${file}`);
console.log(
  inserted
    ? "예시 데이터를 넣었습니다."
    : "이미 카드나 태그가 있어서 아무것도 하지 않았습니다. (내 기록을 지키기 위한 안전장치)",
);
db.close();
process.exit(inserted ? 0 : 1);
