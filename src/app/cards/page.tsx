import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { listCards, listTagCounts } from "@/lib/cards.ts";
import { getDb } from "@/lib/db/connection.ts";

const PAGE_SIZE = 50;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function href(params: { q?: string; tag?: string; page?: number }): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.tag) sp.set("tag", params.tag);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const text = sp.toString();
  return text ? `/cards?${text}` : "/cards";
}

async function CardsContent({ searchParams }: { searchParams: PageProps<"/cards">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const q = first(sp.q).trim().slice(0, 100);
  const tag = first(sp.tag).trim().slice(0, 30);
  const page = Math.min(Math.max(Number.parseInt(first(sp.page), 10) || 1, 1), 200);

  const db = getDb();
  const { cards, hasMore } = listCards(db, { q, tag, limit: PAGE_SIZE * page });
  const tags = listTagCounts(db);
  const filtered = q !== "" || tag !== "";

  return (
    <>
      <form action="/cards" method="get" className="mb-4 flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          질문·답 검색
        </label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="질문이나 답에서 찾기" className="input" />
        {tag && <input type="hidden" name="tag" value={tag} />}
        <button type="submit" className="btn shrink-0">
          검색
        </button>
      </form>

      {tags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2" aria-label="태그로 거르기">
          <Link href={href({ q })} className={`chip ${tag === "" ? "chip-on" : ""}`}>
            전체
          </Link>
          {tags.map(({ name, count }) => (
            <Link
              key={name}
              href={href({ q, tag: name })}
              className={`chip ${name.toLowerCase() === tag.toLowerCase() ? "chip-on" : ""}`}
            >
              {name} <span className="ml-1 text-muted">({count})</span>
            </Link>
          ))}
        </div>
      )}

      {filtered && (
        <p className="mb-4 text-muted">
          {q && <>검색어 “{q}” </>}
          {tag && <>태그 “{tag}” </>}
          결과 · <Link href="/cards" className="text-link">필터 지우기</Link>
        </p>
      )}

      {cards.length === 0 ? (
        <div className="panel text-muted">
          {filtered ? (
            "조건에 맞는 카드가 없어요."
          ) : (
            <>
              아직 카드가 없어요. <Link href="/cards/new" className="text-link">첫 카드를 만들어 보세요.</Link>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {cards.map((card) => (
            <li key={card.id} className="panel">
              <Link href={`/cards/${card.id}`} className="block font-medium no-underline">
                <span className="whitespace-pre-wrap break-words">{card.question}</span>
              </Link>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-muted">{card.answer}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span>상자 {card.box}</span>
                <span aria-hidden>·</span>
                <span>복습 예정 {card.dueDate}</span>
                {card.tags.map((name) => (
                  <span key={name} className="chip">
                    {name}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="mt-6 text-center">
          <Link href={href({ q, tag, page: page + 1 })} className="btn">
            더 보기
          </Link>
        </div>
      )}
    </>
  );
}

export default function CardsPage(props: PageProps<"/cards">) {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold page-title">카드</h1>
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
        <CardsContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
