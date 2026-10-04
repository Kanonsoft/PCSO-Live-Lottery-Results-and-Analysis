import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  GAME_CODES,
  drawGameCodeFor,
  drawSlotFromTime,
  getGameRule,
  isLogicalGameCode,
  toLogicalGameCode,
} from "@/domain/games";
import type {
  Draw,
  DrawArchive,
  DrawGameCode,
  DrawSlot,
  LogicalGameCode,
} from "@/domain/types";

import bundledArchiveJson from "./lottery-results.json";

export type DrawSource = "bundled" | "cached" | "live";

export interface DrawRepositorySnapshot {
  readonly draws: readonly Draw[];
  readonly lastUpdated: string | null;
  readonly source: DrawSource;
  readonly error: string | null;
}

interface RemoteCacheEnvelope {
  readonly version: 1;
  readonly fetchedAt: string;
  readonly draws: readonly Draw[];
}

interface LottoMatikFeedResult {
  readonly feed: LogicalGameCode;
  readonly draws: readonly Draw[];
  readonly warnings: readonly string[];
}

interface CachedRows {
  readonly draws: readonly Draw[];
  readonly fetchedAt: string | null;
  readonly error: string | null;
}

const LOTTOMATIK_HISTORY_URL =
  "https://lottomatik.pcso.gov.ph/api/backend/get-game-history";
const REMOTE_CACHE_KEY = "@lottery-picker/lottomatik-first-pages/v1";
const REMOTE_CACHE_VERSION = 1;
const REMOTE_PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 20_000;

const SLOT_TO_TIME: Readonly<Record<DrawSlot, string>> = Object.freeze({
  "2PM": "14:00",
  "5PM": "17:00",
  "9PM": "21:00",
});

const bundledArchive = bundledArchiveJson as unknown as DrawArchive;
let memoizedBundledDraws: readonly Draw[] | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return value;
}

function normalizeDrawTime(value: unknown): {
  readonly time: string;
  readonly slot: DrawSlot;
} | null {
  if (typeof value !== "string") return null;
  const slot = drawSlotFromTime(value.slice(0, 5)) ?? drawSlotFromTime(value);
  return slot ? { time: SLOT_TO_TIME[slot], slot } : null;
}

function normalizeNumbers(
  value: unknown,
  logicalGameCode: LogicalGameCode,
): readonly number[] | null {
  const rule = getGameRule(logicalGameCode);
  if (!Array.isArray(value) || value.length !== rule.pickCount) return null;

  const numbers: number[] = [];
  for (const item of value) {
    if (
      !(
        (typeof item === "number" && Number.isInteger(item)) ||
        (typeof item === "string" && /^\d+$/.test(item.trim()))
      )
    ) {
      return null;
    }
    const number = Number(item);
    if (
      !Number.isSafeInteger(number) ||
      number < rule.minimum ||
      number > rule.maximum
    ) {
      return null;
    }
    numbers.push(number);
  }

  if (!rule.repeatsAllowed && new Set(numbers).size !== numbers.length) {
    return null;
  }
  return numbers;
}

function normalizeJackpot(value: unknown): string | null {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    text = String(value);
  } else if (typeof value === "string") {
    text = value.trim().replace(/[,₱]/g, "").replace(/^PHP\s*/i, "");
  } else {
    return null;
  }

  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric >= 0 ? text : null;
}

function normalizeWinners(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

function expectedGameCode(
  logicalGameCode: LogicalGameCode,
  slot: DrawSlot,
): DrawGameCode | null {
  if (logicalGameCode === "2DL" || logicalGameCode === "3DL") {
    return drawGameCodeFor(logicalGameCode, slot);
  }
  return slot === "9PM" ? logicalGameCode : null;
}

function buildDraw(
  logicalGameCode: LogicalGameCode,
  rawDate: unknown,
  rawTime: unknown,
  rawNumbers: unknown,
  rawJackpot: unknown,
  rawWinners: unknown,
  suppliedGameCode?: unknown,
  rawSourceId?: unknown,
): Draw | null {
  const date = normalizeDate(rawDate);
  const time = normalizeDrawTime(rawTime);
  const numbers = normalizeNumbers(rawNumbers, logicalGameCode);
  const amount = normalizeJackpot(rawJackpot);
  const winners = normalizeWinners(rawWinners);
  if (!date || !time || !numbers || amount === null || winners === null) {
    return null;
  }

  const gameCode = expectedGameCode(logicalGameCode, time.slot);
  if (!gameCode) return null;
  if (
    suppliedGameCode !== undefined &&
    (typeof suppliedGameCode !== "string" ||
      suppliedGameCode.toUpperCase() !== gameCode)
  ) {
    return null;
  }

  const sourceId =
    typeof rawSourceId === "string" || typeof rawSourceId === "number"
      ? String(rawSourceId).trim()
      : "";
  return {
    logicalGameCode,
    gameCode,
    date,
    time: time.time,
    numbers: [...numbers],
    amount,
    winners,
    ...(sourceId ? { sourceId } : {}),
  };
}

/** Validate and expand one compact tuple from the bundled archive. */
export function normalizeBundledTuple(value: unknown): Draw | null {
  if (!Array.isArray(value) || value.length !== 7) return null;
  const logical = value[0];
  if (!isLogicalGameCode(logical)) return null;
  return buildDraw(
    toLogicalGameCode(logical),
    value[2],
    value[3],
    value[4],
    value[5],
    value[6],
    value[1],
  );
}

/** Validate one LottoMatik history record for its requested logical feed. */
export function normalizeLottoMatikItem(
  value: unknown,
  requestedFeed: LogicalGameCode,
): Draw | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  if (
    !(
      (typeof id === "string" && id.trim().length > 0) ||
      (typeof id === "number" && Number.isFinite(id))
    )
  ) {
    return null;
  }
  return buildDraw(
    requestedFeed,
    value.drawDate,
    value.drawTime,
    value.result,
    value.jackpot,
    value.totalWinners,
    undefined,
    id,
  );
}

function normalizeStoredDraw(value: unknown): Draw | null {
  if (!isRecord(value) || typeof value.logicalGameCode !== "string") {
    return null;
  }
  let logicalGameCode: LogicalGameCode;
  try {
    logicalGameCode = toLogicalGameCode(value.logicalGameCode);
  } catch {
    return null;
  }
  return buildDraw(
    logicalGameCode,
    value.date,
    value.time,
    value.numbers,
    value.amount,
    value.winners,
    value.gameCode,
    value.sourceId,
  );
}

function drawKey(draw: Draw): string {
  return `${draw.gameCode}|${draw.date}|${draw.time}`;
}

function compareDraws(left: Draw, right: Draw): number {
  return (
    left.date.localeCompare(right.date) ||
    left.time.localeCompare(right.time) ||
    left.gameCode.localeCompare(right.gameCode)
  );
}

/**
 * Merge draw sources in priority order. A later source replaces an earlier
 * record with the same concrete game, date, and draw slot.
 */
export function mergeDraws(
  ...sources: readonly (readonly Draw[])[]
): readonly Draw[] {
  const merged = new Map<string, Draw>();
  for (const source of sources) {
    for (const draw of source) merged.set(drawKey(draw), draw);
  }
  return [...merged.values()].sort(compareDraws);
}

export function getBundledDraws(): readonly Draw[] {
  if (memoizedBundledDraws) return memoizedBundledDraws;
  if (
    bundledArchive.schemaVersion !== 1 ||
    !Array.isArray(bundledArchive.draws) ||
    bundledArchive.drawCount !== bundledArchive.draws.length ||
    normalizeDate(bundledArchive.availableFrom) === null ||
    normalizeDate(bundledArchive.availableTo) === null
  ) {
    throw new Error("The bundled lottery archive has an unsupported format.");
  }

  const draws = bundledArchive.draws
    .map(normalizeBundledTuple)
    .filter((draw): draw is Draw => draw !== null);
  if (draws.length !== bundledArchive.draws.length) {
    throw new Error("The bundled lottery archive contains invalid draw rows.");
  }
  memoizedBundledDraws = mergeDraws(draws);
  return memoizedBundledDraws;
}

/**
 * Synchronous fallback used while AsyncStorage is being hydrated. Keeping this
 * snapshot inside the app means screens can render useful results on their
 * first frame without waiting for storage or the network.
 */
export function getBundledSnapshot(): DrawRepositorySnapshot {
  return {
    draws: getBundledDraws(),
    lastUpdated: bundledArchive.availableTo,
    source: "bundled",
    error: null,
  };
}

/** Keep first-render work small; loadDraws hydrates the complete archive later. */
export function getStartupSnapshot(): DrawRepositorySnapshot {
  const counts = new Map<string, number>();
  const recent: Draw[] = [];
  for (let index = bundledArchive.draws.length - 1; index >= 0; index -= 1) {
    const tuple = bundledArchive.draws[index];
    const code = tuple[1];
    const count = counts.get(code) ?? 0;
    if (count >= 20) continue;
    const draw = normalizeBundledTuple(tuple);
    if (!draw) continue;
    counts.set(code, count + 1);
    recent.push(draw);
  }
  return {
    draws: recent.reverse(),
    lastUpdated: bundledArchive.availableTo,
    source: 'bundled',
    error: null,
  };
}

async function readRemoteCache(): Promise<CachedRows> {
  try {
    const serialized = await AsyncStorage.getItem(REMOTE_CACHE_KEY);
    if (!serialized) return { draws: [], fetchedAt: null, error: null };

    const candidate: unknown = JSON.parse(serialized);
    if (
      !isRecord(candidate) ||
      candidate.version !== REMOTE_CACHE_VERSION ||
      !Array.isArray(candidate.draws)
    ) {
      throw new Error("unsupported saved-data format");
    }
    const fetchedAt = normalizeTimestamp(candidate.fetchedAt);
    if (!fetchedAt) throw new Error("invalid saved-data timestamp");

    const draws = candidate.draws
      .map(normalizeStoredDraw)
      .filter((draw): draw is Draw => draw !== null);
    if (draws.length !== candidate.draws.length) {
      throw new Error("one or more saved draw rows are invalid");
    }
    return { draws: mergeDraws(draws), fetchedAt, error: null };
  } catch (error) {
    return {
      draws: [],
      fetchedAt: null,
      error: `Saved live results could not be read (${errorMessage(error)}).`,
    };
  }
}

async function writeRemoteCache(
  draws: readonly Draw[],
  fetchedAt: string,
): Promise<void> {
  const envelope: RemoteCacheEnvelope = {
    version: REMOTE_CACHE_VERSION,
    fetchedAt,
    draws,
  };
  await AsyncStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(envelope));
}

async function fetchLottoMatikFeed(
  feed: LogicalGameCode,
): Promise<LottoMatikFeedResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const query = `lottery=${encodeURIComponent(feed)}&page=1&perPage=${REMOTE_PAGE_SIZE}`;
    const response = await fetch(`${LOTTOMATIK_HISTORY_URL}?${query}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.items)) {
      throw new Error("unexpected response format");
    }

    const draws = payload.items
      .map((item) => normalizeLottoMatikItem(item, feed))
      .filter((draw): draw is Draw => draw !== null);
    const invalidCount = payload.items.length - draws.length;
    if (payload.items.length > 0 && draws.length === 0) {
      throw new Error("the page did not contain any valid draw rows");
    }
    return {
      feed,
      draws,
      warnings:
        invalidCount > 0
          ? [`${feed}: ignored ${invalidCount} malformed live row(s).`]
          : [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Load the complete bundled archive, then layer any valid saved live rows. */
export async function loadDraws(): Promise<DrawRepositorySnapshot> {
  const bundledSnapshot = getBundledSnapshot();
  const cache = await readRemoteCache();
  return {
    draws: mergeDraws(bundledSnapshot.draws, cache.draws),
    lastUpdated: cache.fetchedAt ?? bundledSnapshot.lastUpdated,
    source: cache.draws.length > 0 ? "cached" : "bundled",
    error: cache.error,
  };
}

/**
 * Fetch page one of all nine LottoMatik feeds in parallel. Valid feeds update
 * independently, so one unavailable game never removes the offline archive or
 * previously cached rows.
 */
export async function refreshDraws(): Promise<DrawRepositorySnapshot> {
  const bundled = getBundledDraws();
  const cache = await readRemoteCache();
  const settled = await Promise.allSettled(
    GAME_CODES.map((feed) => fetchLottoMatikFeed(feed)),
  );

  const fresh: Draw[] = [];
  const issues: string[] = cache.error ? [cache.error] : [];
  let successfulFeeds = 0;
  settled.forEach((result, index) => {
    const feed = GAME_CODES[index];
    if (result.status === "fulfilled") {
      successfulFeeds += 1;
      fresh.push(...result.value.draws);
      issues.push(...result.value.warnings);
    } else {
      issues.push(`${feed}: ${errorMessage(result.reason)}.`);
    }
  });

  if (successfulFeeds === 0) {
    return {
      draws: mergeDraws(bundled, cache.draws),
      lastUpdated: cache.fetchedAt ?? bundledArchive.availableTo,
      source: cache.draws.length > 0 ? "cached" : "bundled",
      error: `Live results are unavailable. ${issues.join(" ")}`.trim(),
    };
  }

  const fetchedAt = new Date().toISOString();
  const cachedRemoteRows = mergeDraws(cache.draws, fresh);
  try {
    await writeRemoteCache(cachedRemoteRows, fetchedAt);
  } catch (error) {
    issues.push(
      `Live results could not be saved for offline use (${errorMessage(error)}).`,
    );
  }

  return {
    draws: mergeDraws(bundled, cachedRemoteRows),
    lastUpdated: fetchedAt,
    source: "live",
    error: issues.length > 0 ? issues.join(" ") : null,
  };
}
