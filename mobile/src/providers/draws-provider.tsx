import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import {
  getStartupSnapshot,
  loadDraws,
  refreshDraws,
  type DrawSource,
} from "@/data/repository";
import { GAME_CODES } from '@/domain/games';
import type { Draw, LogicalGameCode } from '@/domain/types';

export interface DrawsContextValue {
  readonly draws: readonly Draw[];
  /** Pre-indexed newest-first history so opening a game never filters/sorts the archive. */
  readonly drawsByGame: Readonly<Record<LogicalGameCode, readonly Draw[]>>;
  /** Pre-indexed draw days so previous/next date navigation avoids scanning the archive. */
  readonly drawsByDate: ReadonlyMap<string, readonly Draw[]>;
  readonly refresh: () => Promise<void>;
  /** Always false because a bundled snapshot is available on the first frame. */
  readonly loading: boolean;
  /** Network updates are intentionally silent and never replace cached content. */
  readonly refreshing: boolean;
  /** Cache refresh timestamp, or the bundled archive's newest draw date. */
  readonly lastUpdated: string | null;
  readonly source: DrawSource;
  /** A recoverable cache, partial-feed, or network error. */
  readonly error: string | null;
}

const DrawsContext = createContext<DrawsContextValue | undefined>(undefined);

const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1_000;
const SCHEDULE_POLL_MS = 15_000;
const FOREGROUND_REFRESH_MIN_AWAY_MS = 60_000;
const DRAW_HOURS = new Set([14, 17, 21]);
const PUBLICATION_RETRY_MINUTES = new Set([0, 5, 10, 15]);
const INITIAL_SYNC_KEY = '@pcso-live-lotto/initial-sync/v1';
const immediateSnapshot = getStartupSnapshot();

function indexDrawsByGame(
  draws: readonly Draw[],
): Readonly<Record<LogicalGameCode, readonly Draw[]>> {
  const grouped = Object.fromEntries(
    GAME_CODES.map((gameCode) => [gameCode, [] as Draw[]]),
  ) as Record<LogicalGameCode, Draw[]>;

  // Repository snapshots are oldest-first. One reverse pass produces all nine
  // newest-first histories without filtering and sorting again on navigation.
  for (let index = draws.length - 1; index >= 0; index -= 1) {
    const draw = draws[index];
    if (draw) grouped[draw.logicalGameCode].push(draw);
  }
  return grouped;
}

function indexDrawsByDate(draws: readonly Draw[]): ReadonlyMap<string, readonly Draw[]> {
  const grouped = new Map<string, Draw[]>();
  draws.forEach((draw) => {
    const day = grouped.get(draw.date);
    if (day) day.push(draw);
    else grouped.set(draw.date, [draw]);
  });
  return grouped;
}

/** Return a stable key only during a scheduled Manila publication retry minute. */
function manilaPublicationBucket(now = new Date()): string | null {
  // The Philippines observes UTC+8 year-round. Reading the shifted value with
  // UTC getters keeps this independent from the phone's configured timezone.
  const manila = new Date(now.getTime() + MANILA_UTC_OFFSET_MS);
  const hour = manila.getUTCHours();
  const minute = manila.getUTCMinutes();
  if (!DRAW_HOURS.has(hour) || !PUBLICATION_RETRY_MINUTES.has(minute)) {
    return null;
  }

  const year = manila.getUTCFullYear();
  const month = String(manila.getUTCMonth() + 1).padStart(2, "0");
  const day = String(manila.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}|${String(hour).padStart(2, "0")}:${String(
    minute,
  ).padStart(2, "0")}`;
}

export function DrawsProvider({ children }: { readonly children: ReactNode }) {
  // The bundled archive is available synchronously, so the first rendered
  // screen never needs to wait on AsyncStorage or display an empty loader.
  const [draws, setDraws] = useState<readonly Draw[]>(immediateSnapshot.draws);
  const loading = false;
  const refreshing = false;
  const [lastUpdated, setLastUpdated] = useState<string | null>(
    immediateSnapshot.lastUpdated,
  );
  const [source, setSource] = useState<DrawSource>(immediateSnapshot.source);
  const [error, setError] = useState<string | null>(null);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const mounted = useRef(true);
  const initialized = useRef(false);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const lastPublicationBucket = useRef<string | null>(null);

  const applySnapshot = useCallback(
    (snapshot: Awaited<ReturnType<typeof loadDraws>>) => {
      if (!mounted.current) return;
      setDraws(snapshot.draws);
      setLastUpdated(snapshot.lastUpdated);
      setSource(snapshot.source);
      setError(snapshot.error);
    },
    [],
  );

  const performRefresh = useCallback(async () => {
    try {
      applySnapshot(await refreshDraws());
    } catch (reason) {
      if (mounted.current) {
        setError(
          `Live results could not be refreshed: ${
            reason instanceof Error ? reason.message : String(reason)
          }`,
        );
      }
    }
  }, [applySnapshot]);

  const refresh = useCallback((): Promise<void> => {
    // A startup or foreground refresh inside a retry minute also
    // satisfies that bucket, preventing a redundant scheduled request.
    const publicationBucket = manilaPublicationBucket();
    if (publicationBucket) lastPublicationBucket.current = publicationBucket;
    if (refreshInFlight.current) return refreshInFlight.current;
    const request = performRefresh().finally(() => {
      if (refreshInFlight.current === request) refreshInFlight.current = null;
    });
    refreshInFlight.current = request;
    return request;
  }, [performRefresh]);

  useEffect(() => {
    mounted.current = true;
    if (!initialized.current) {
      initialized.current = true;
      void (async () => {
        // Give the first results screen a chance to paint before processing
        // the full offline archive and initializing network synchronization.
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        if (!mounted.current) return;
        let firstLaunch = true;
        try {
          applySnapshot(await loadDraws());
        } catch (reason) {
          if (mounted.current) {
            setError(
              `Lottery results could not be loaded: ${
                reason instanceof Error ? reason.message : String(reason)
              }`,
            );
          }
        } finally {
          if (mounted.current) setCacheHydrated(true);
        }

        try {
          firstLaunch =
            (await AsyncStorage.getItem(INITIAL_SYNC_KEY)) !== 'complete';
        } catch {
          // If local storage is unavailable, still allow one initialization
          // attempt and continue into the bundled archive.
        }

        if (!mounted.current) return;

        // Results are available from the bundled snapshot on the first frame.
        // Refresh silently so a slow or offline network never holds the splash
        // screen or delays access to the app.
        void refresh().finally(async () => {
          if (!firstLaunch) return;
          try {
            await AsyncStorage.setItem(INITIAL_SYNC_KEY, 'complete');
          } catch {
            // Storage failure must not prevent the bundled results from opening.
          }
        });
      })();
    }
    return () => {
      mounted.current = false;
    };
  }, [applySnapshot, refresh]);

  useEffect(() => {
    if (!cacheHydrated) return;

    let appState = AppState.currentState;
    let leftActiveAt: number | null = null;
    const refreshForPublicationWindow = () => {
      if (appState !== "active") return;
      const bucket = manilaPublicationBucket();
      if (!bucket || bucket === lastPublicationBucket.current) return;
      lastPublicationBucket.current = bucket;
      void refresh();
    };

    // Covers mounting during a publication minute; startup refresh deduping
    // ensures this cannot start a second concurrent request.
    refreshForPublicationWindow();
    const interval = setInterval(refreshForPublicationWindow, SCHEDULE_POLL_MS);
    const subscription = AppState.addEventListener("change", (nextState) => {
      const returnedToForeground =
        nextState === "active" && appState !== "active";
      if (appState === 'active' && nextState !== 'active') {
        leftActiveAt = Date.now();
      }
      appState = nextState;
      if (!returnedToForeground) return;

      // A billing/permission overlay can briefly mark the app inactive. Do not
      // start nine network requests while the user is navigating back from it.
      // Publication windows are still checked immediately, while an actual
      // minute-long absence receives the normal foreground refresh.
      const publicationBucket = manilaPublicationBucket();
      if (publicationBucket) {
        refreshForPublicationWindow();
      } else if (
        leftActiveAt !== null &&
        Date.now() - leftActiveAt >= FOREGROUND_REFRESH_MIN_AWAY_MS
      ) {
        void refresh();
      }
      leftActiveAt = null;
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [cacheHydrated, refresh]);

  const drawsByGame = useMemo(() => indexDrawsByGame(draws), [draws]);
  const drawsByDate = useMemo(() => indexDrawsByDate(draws), [draws]);
  const value = useMemo<DrawsContextValue>(
    () => ({
      draws,
      drawsByGame,
      drawsByDate,
      refresh,
      loading,
      refreshing,
      lastUpdated,
      source,
      error,
    }),
    [draws, drawsByDate, drawsByGame, error, lastUpdated, loading, refresh, refreshing, source],
  );

  return (
    <DrawsContext.Provider value={value}>{children}</DrawsContext.Provider>
  );
}

export function useDraws(): DrawsContextValue {
  const context = useContext(DrawsContext);
  if (!context) {
    throw new Error("useDraws must be used inside a DrawsProvider.");
  }
  return context;
}
