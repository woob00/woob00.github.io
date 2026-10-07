import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "rentals", consistency: "strong" });
  const url = new URL(req.url);
  const json = (d, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

  // 관리자 비밀번호 (Netlify 환경변수 ADMIN_PW 가 있으면 그걸 쓰고, 없으면 0801)
  const ADMIN_PW = (typeof Netlify !== "undefined" && Netlify.env.get("ADMIN_PW")) || "0801";
  const isAdmin = req.headers.get("x-admin-pw") === ADMIN_PW;

  // 목록 조회 / 관리자 확인
  if (req.method === "GET") {
    if (url.searchParams.get("verify")) return isAdmin ? json({ ok: true }) : json({ ok: false }, 401);
    const { blobs } = await store.list();
    const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    return json(items.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt));
  }

  // 신규 대여 등록 (누구나)
  if (req.method === "POST") {
    const b = await req.json();
    if (!b.dong || !b.ho) return json({ error: "동/호수 필요" }, 400);
    const item = {
      id: "rental_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      dong: String(b.dong).slice(0, 10),
      ho: String(b.ho).slice(0, 10),
      racket: String(b.racket || "").slice(0, 20),
      ball: String(b.ball || "").slice(0, 20),
      borrowTime: String(b.borrowTime || "").slice(0, 20),
      returnTime: null,
      isReturned: false,
      createdAt: Date.now(),
    };
    await store.setJSON(item.id, item);
    return json(item);
  }

  // 반납 (누구나) / 내용 수정 (관리자만)
  if (req.method === "PATCH") {
    const b = await req.json();
    const item = await store.get(b.id, { type: "json" });
    if (!item) return json({ error: "없음" }, 404);
    if (b.action === "return") {
      item.isReturned = true;
      item.returnTime = String(b.returnTime || "").slice(0, 20);
    } else {
      if (!isAdmin) return json({ error: "권한 없음" }, 401);
      const f = b.fields || {};
      ["dong", "ho", "racket", "ball", "isReturned", "returnTime"].forEach((k) => {
        if (k in f) item[k] = f[k];
      });
    }
    await store.setJSON(item.id, item);
    return json(item);
  }

  // 삭제 (관리자만)
  if (req.method === "DELETE") {
    if (!isAdmin) return json({ error: "권한 없음" }, 401);
    if (url.searchParams.get("all")) {
      const { blobs } = await store.list();
      await Promise.all(blobs.map((b) => store.delete(b.key)));
    } else {
      await store.delete(url.searchParams.get("id"));
    }
    return json({ ok: true });
  }

  return json({ error: "지원하지 않는 요청" }, 405);
};

export const config = { path: "/api/rentals" };
