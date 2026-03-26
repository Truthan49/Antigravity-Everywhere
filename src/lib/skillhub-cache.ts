/**
 * SkillHub Local Cache with Incremental Sync
 *
 * Strategy:
 * - Full catalog is cached to ~/.agents/.skillhub-cache.json
 * - Metadata (lastFullSync, lastIncrementalSync) is stored alongside
 * - On store open:
 *   1. If cache exists and is < 24h old → serve from cache instantly
 *   2. If cache is stale (> 24h) → serve cache + trigger background full re-sync
 *   3. If no cache → fetch first page live, start full sync in background
 * - Incremental sync: fetch page 1 sorted by updated_at desc,
 *   compare timestamps with cached items, merge new/updated entries
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const CACHE_DIR = path.join(os.homedir(), '.agents');
const CACHE_FILE = path.join(CACHE_DIR, '.skillhub-cache.json');
const API_BASE = 'https://lightmake.site/api/skills';
const PAGE_SIZE = 100; // Larger pages for background sync
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const INCREMENTAL_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

interface CachedSkill {
  name: string;
  slug: string;
  description?: string;
  description_zh?: string;
  category?: string;
  version?: string;
  downloads?: number;
  stars?: number;
  ownerName?: string;
  score?: number;
  updated_at?: number;
}

interface CacheData {
  skills: CachedSkill[];
  total: number;
  lastFullSync: number;
  lastIncrementalSync: number;
  syncedPages: number;
  isSyncing: boolean;
}

function readCache(): CacheData | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(data: CacheData) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
  } catch (e) {
    console.error('[SkillHub Cache] Write failed:', e);
  }
}

async function fetchPage(page: number, pageSize: number, sortBy = 'score', order = 'desc'): Promise<{ skills: CachedSkill[]; total: number }> {
  const url = `${API_BASE}?page=${page}&pageSize=${pageSize}&sortBy=${sortBy}&order=${order}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const body = await res.json();
  return { skills: body?.data?.skills || [], total: body?.data?.total || 0 };
}

/**
 * Full background sync — fetches ALL pages and merges into cache.
 * Runs in the background (fire-and-forget).
 */
async function backgroundFullSync() {
  const existing = readCache();
  if (existing?.isSyncing) return; // Prevent parallel syncs

  const marker: CacheData = {
    skills: existing?.skills || [],
    total: existing?.total || 0,
    lastFullSync: existing?.lastFullSync || 0,
    lastIncrementalSync: existing?.lastIncrementalSync || 0,
    syncedPages: 0,
    isSyncing: true,
  };
  writeCache(marker);

  try {
    const allSkills: CachedSkill[] = [];
    let page = 1;
    let total = 0;

    while (true) {
      const data = await fetchPage(page, PAGE_SIZE);
      total = data.total;
      allSkills.push(...data.skills);
      if (allSkills.length >= total || data.skills.length < PAGE_SIZE) break;
      page++;
      // Be polite: small delay between pages
      await new Promise(r => setTimeout(r, 200));
    }

    const now = Date.now();
    writeCache({
      skills: allSkills,
      total,
      lastFullSync: now,
      lastIncrementalSync: now,
      syncedPages: page,
      isSyncing: false,
    });
    console.log(`[SkillHub Cache] Full sync complete: ${allSkills.length} skills in ${page} pages`);
  } catch (e) {
    console.error('[SkillHub Cache] Full sync error:', e);
    // Unlock syncing flag
    const c = readCache();
    if (c) { c.isSyncing = false; writeCache(c); }
  }
}

/**
 * Incremental sync — fetches latest updated skills and merges.
 */
async function backgroundIncrementalSync() {
  const existing = readCache();
  if (!existing || existing.isSyncing) return;

  try {
    const data = await fetchPage(1, 50, 'updated_at', 'desc');
    const slugMap = new Map(existing.skills.map(s => [s.slug, s]));

    let newCount = 0;
    for (const skill of data.skills) {
      const cached = slugMap.get(skill.slug);
      if (!cached || (skill.updated_at && cached.updated_at && skill.updated_at > cached.updated_at)) {
        slugMap.set(skill.slug, skill);
        newCount++;
      }
    }

    existing.skills = Array.from(slugMap.values());
    existing.total = data.total; // Update total count
    existing.lastIncrementalSync = Date.now();
    writeCache(existing);
    if (newCount > 0) {
      console.log(`[SkillHub Cache] Incremental sync: ${newCount} new/updated skills`);
    }
  } catch (e) {
    console.error('[SkillHub Cache] Incremental sync error:', e);
  }
}

/**
 * Main entry point for the store API.
 * Returns cached data with smart sync decisions.
 */
export async function getCachedSkills(params: {
  page?: string;
  pageSize?: string;
  sortBy?: string;
  order?: string;
  category?: string;
  keyword?: string;
}): Promise<{ skills: CachedSkill[]; total: number; fromCache: boolean; cacheAge?: number }> {
  const cache = readCache();
  const now = Date.now();

  // If no cache or cache is very old → fetch live first page, trigger full sync
  if (!cache || now - cache.lastFullSync > MAX_CACHE_AGE_MS * 7) {
    // No usable cache: fetch live
    const p = parseInt(params.page || '1');
    const ps = parseInt(params.pageSize || '24');
    const sortBy = params.sortBy || 'score';
    const order = params.order || 'desc';

    let url = `${API_BASE}?page=${p}&pageSize=${ps}&sortBy=${sortBy}&order=${order}`;
    if (params.category && params.category !== 'All') url += `&category=${encodeURIComponent(params.category)}`;
    if (params.keyword) url += `&keyword=${encodeURIComponent(params.keyword)}`;

    const res = await fetch(url);
    const body = await res.json();
    const data = body?.data || body;

    // Fire background full sync
    backgroundFullSync().catch(() => {});

    return { skills: data.skills || [], total: data.total || 0, fromCache: false };
  }

  // Cache exists. Decide sync strategy:
  if (now - cache.lastFullSync > MAX_CACHE_AGE_MS) {
    // Stale: serve cache, trigger full re-sync in background
    backgroundFullSync().catch(() => {});
  } else if (now - cache.lastIncrementalSync > INCREMENTAL_THRESHOLD_MS) {
    // Semi-fresh: incremental sync in background
    backgroundIncrementalSync().catch(() => {});
  }

  // Hybrid fallback: if cache is incomplete (still syncing or < 80% of total)
  // AND user has a keyword or category filter, use remote API for accurate results
  const cacheComplete = cache.skills.length >= cache.total * 0.8;
  const hasFilter = !!(params.keyword || (params.category && params.category !== 'All'));

  if (!cacheComplete && hasFilter) {
    try {
      const p = parseInt(params.page || '1');
      const ps = parseInt(params.pageSize || '24');
      const sortBy = params.sortBy || 'score';
      const order = params.order || 'desc';

      let url = `${API_BASE}?page=${p}&pageSize=${ps}&sortBy=${sortBy}&order=${order}`;
      if (params.category && params.category !== 'All') url += `&category=${encodeURIComponent(params.category)}`;
      if (params.keyword) url += `&keyword=${encodeURIComponent(params.keyword)}`;

      const res = await fetch(url);
      const body = await res.json();
      const data = body?.data || body;
      return { skills: data.skills || [], total: data.total || 0, fromCache: false };
    } catch {
      // Remote failed, fall through to cache
    }
  }

  // Serve from cache with client-side filtering/pagination
  let filtered = cache.skills;

  if (params.keyword) {
    const kw = params.keyword.toLowerCase();
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(kw) ||
      (s.description || '').toLowerCase().includes(kw) ||
      (s.description_zh || '').toLowerCase().includes(kw) ||
      s.slug.toLowerCase().includes(kw)
    );
  }

  if (params.category && params.category !== 'All') {
    filtered = filtered.filter(s => s.category === params.category);
  }

  // Sort
  const sortBy = params.sortBy || 'score';
  const order = params.order || 'desc';
  filtered.sort((a: any, b: any) => {
    const va = a[sortBy] ?? 0;
    const vb = b[sortBy] ?? 0;
    return order === 'desc' ? vb - va : va - vb;
  });

  // Paginate
  const page = parseInt(params.page || '1');
  const pageSize = parseInt(params.pageSize || '24');
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return {
    skills: paged,
    total: filtered.length,
    fromCache: true,
    cacheAge: now - cache.lastFullSync,
  };
}
