'use client';

import { MAX_PHOTOS, THUMB_MAX, THUMB_QUALITY, fitBox, toEvict } from './policy.ts';

/**
 * 섬네일을 만들고 이 폰 안에 둔다.
 *
 * 규칙과 이유는 policy.ts 에 적었다. 이 파일은 브라우저 API 를 부르는 얇은 껍데기이고,
 * 판단하는 부분은 전부 저쪽에 있어서 시험할 수 있다.
 */

const DB = 'snapcare-photos';
const STORE = 'thumbs';

interface Row {
  id: string;
  at: number;
  /** JPEG data URL */
  thumb: string;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    // 사파리 비공개 모드처럼 IndexedDB 를 아예 막는 곳이 있다. 사진만 없고
    // 나머지는 그대로 돌아야 한다.
    req.onerror = () => resolve(null);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return open().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * 사진 한 장을 섬네일로 줄인다.
 *
 * 실패하면 null 이다 — 사진은 있으면 좋은 것이고, 여기서 던지면 **판정 자체가**
 * 안 끝난다. 판정이 이 앱의 일이고 사진은 곁들이다.
 */
export async function makeThumb(dataUrl: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
    const { w, h } = fitBox(img.naturalWidth, img.naturalHeight, THUMB_MAX);
    if (w === 0 || h === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    // PNG 로 두면 사진에서 오히려 커진다. 섬네일은 JPEG 가 맞다.
    return canvas.toDataURL('image/jpeg', THUMB_QUALITY);
  } catch {
    return null;
  }
}

/** 기록 id 로 사진을 남긴다. 실패해도 조용하다. */
export async function putThumb(id: string, thumb: string): Promise<void> {
  await tx('readwrite', (s) => s.put({ id, at: Date.now(), thumb } satisfies Row));
}

export async function getThumb(id: string): Promise<string | null> {
  const row = await tx<Row>('readonly', (s) => s.get(id) as IDBRequest<Row>);
  return row?.thumb ?? null;
}

/** 지금 있는 기록이 가리키는 것만 남기고, 넘치는 만큼 오래된 것부터 버린다. */
export async function prunePhotos(liveIds: Iterable<string>): Promise<number> {
  const rows = await tx<Row[]>('readonly', (s) => s.getAll() as IDBRequest<Row[]>);
  if (!rows || rows.length === 0) return 0;
  const drop = toEvict(rows.map((r) => ({ id: r.id, at: r.at })), new Set(liveIds), MAX_PHOTOS);
  for (const id of drop) await tx('readwrite', (s) => s.delete(id));
  return drop.length;
}
