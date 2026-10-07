import { getItem, setItem, StorageKeys } from "./storage";

export type ViewedService = {
  is_mine?: boolean;
  id: number;
  title: string;
  provider_name?: string;
  viewedAt: string;
};

export type SearchHistoryItem = {
  query: string;
  searchedAt: string;
};

const MAX = 25;

async function readJson<T>(key: string): Promise<T[]> {
  try {
    const raw = await getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJson<T>(key: string, items: T[]): Promise<void> {
  await setItem(key, JSON.stringify(items.slice(0, MAX)));
}

export async function trackServiceView(service: {
  id: number;
  title: string;
  provider_name?: string;
  is_mine?: boolean;
}): Promise<void> {
  const list = await readJson<ViewedService>(StorageKeys.VIEWED_SERVICES);
  const entry: ViewedService = {
    id: service.id,
    title: service.title,
    provider_name: service.provider_name,
    is_mine: Boolean(service.is_mine),
    viewedAt: new Date().toISOString(),
  };
  const filtered = list.filter((x) => x.id !== service.id);
  await writeJson(StorageKeys.VIEWED_SERVICES, [entry, ...filtered]);
}

export async function trackSearch(query: string): Promise<void> {
  const q = query.trim();
  if (q.length < 2) return;
  const list = await readJson<SearchHistoryItem>(StorageKeys.SEARCH_HISTORY);
  const entry: SearchHistoryItem = { query: q, searchedAt: new Date().toISOString() };
  const filtered = list.filter((x) => x.query.toLowerCase() !== q.toLowerCase());
  await writeJson(StorageKeys.SEARCH_HISTORY, [entry, ...filtered]);
}

export async function getViewedServices(): Promise<ViewedService[]> {
  return readJson<ViewedService>(StorageKeys.VIEWED_SERVICES);
}

export async function getSearchHistory(): Promise<SearchHistoryItem[]> {
  return readJson<SearchHistoryItem>(StorageKeys.SEARCH_HISTORY);
}

export async function clearActivityHistory(): Promise<void> {
  await writeJson(StorageKeys.VIEWED_SERVICES, []);
  await writeJson(StorageKeys.SEARCH_HISTORY, []);
}
