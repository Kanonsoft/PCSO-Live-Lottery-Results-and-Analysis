import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ResultAdCard } from '@/components/ads/result-ad-card';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { GAME_BY_CODE, formatNumber } from '@/domain/games';
import type { GameRule, LogicalGameCode, LotteryDraw } from '@/domain/types';
import { formatCount, formatDrawTime, formatPeso } from '@/lib/format';
import { useGuardedNavigation } from '@/lib/use-guarded-navigation';
import { useDraws } from '@/providers/draws-provider';
import { useAppTheme, usePreferences } from '@/providers/preferences-provider';
import { palette, radius, shadow, spacing } from '@/theme/tokens';

const RESULT_GAME_CODES: readonly LogicalGameCode[] = [
  'UL58',
  'GL55',
  'SL49',
  'ML45',
  'LOTTO42',
  '6DL',
  '4DL',
  '3DL',
  '2DL',
];

const GAME_LOGOS: Readonly<Record<LogicalGameCode, number>> = {
  UL58: require('@/assets/game-logos/658.png'),
  GL55: require('@/assets/game-logos/655.png'),
  SL49: require('@/assets/game-logos/649.png'),
  ML45: require('@/assets/game-logos/645.png'),
  LOTTO42: require('@/assets/game-logos/642.png'),
  '6DL': require('@/assets/game-logos/6dl.webp'),
  '4DL': require('@/assets/game-logos/4dl.webp'),
  '3DL': require('@/assets/game-logos/3dl.webp'),
  '2DL': require('@/assets/game-logos/2dl.webp'),
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function formatResultDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${DAYS[weekday]}, ${String(day).padStart(2, '0')} ${MONTHS[month - 1]} ${year}`;
}

function ResultBalls({ draw, rule }: { draw: LotteryDraw; rule: GameRule }) {
  const { colors } = useAppTheme();

  return (
    <View
      accessibilityLabel={`Winning numbers ${draw.numbers.map((number) => formatNumber(number, rule)).join(', ')}`}
      style={styles.balls}>
      {draw.numbers.map((number, index) => (
        <View key={`${number}-${index}`} style={[styles.ball, { backgroundColor: colors.primary }]}>
          <Text style={styles.ballText}>{formatNumber(number, rule)}</Text>
        </View>
      ))}
    </View>
  );
}

function DrawComposition({ draw, rule }: { draw: LotteryDraw; rule: GameRule }) {
  const { colors } = useAppTheme();
  const even = draw.numbers.filter((number) => number % 2 === 0).length;
  const odd = draw.numbers.length - even;
  const midpoint = Math.floor((rule.minimum + rule.maximum) / 2);
  const low = draw.numbers.filter((number) => number <= midpoint).length;
  const high = draw.numbers.length - low;

  return (
    <Text
      accessibilityLabel={`${even} even, ${odd} odd, ${low} low, ${high} high`}
      style={[styles.composition, { color: colors.textMuted }]}>
      {even}-{odd}-{low}-{high}
    </Text>
  );
}

function GameResultCard({
  rule,
  draws,
  onPress,
}: {
  rule: GameRule;
  draws: readonly LotteryDraw[];
  onPress: () => void;
}) {
  const { colors, isDark } = useAppTheme();

  return (
    <Pressable
      accessibilityHint="Opens this game's result history"
      accessibilityLabel={`${rule.name} results`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.gameCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        isDark && { shadowColor: colors.overlay, shadowOpacity: 0.42 },
        pressed && styles.cardPressed,
      ]}>
      <View style={styles.logoColumn}>
        <Image source={GAME_LOGOS[rule.code]} contentFit="contain" style={styles.logo} />
      </View>
      <View style={styles.gameContent}>
        <View style={styles.gameHeader}>
          <Text accessibilityRole="header" style={[styles.gameName, { color: colors.text }]}>
            {rule.name}
          </Text>
        </View>
        {draws.length ? (
          draws.map((draw, index) => (
            <View
              key={`${draw.gameCode}-${draw.time}`}
              style={[
                styles.drawLine,
                index > 0 && styles.drawDivider,
                index > 0 && { borderTopColor: colors.border },
              ]}>
              <View style={styles.drawCenter}>
                {draws.length > 1 ? (
                  <Text style={[styles.drawTime, { color: colors.primary }]}>{formatDrawTime(draw.time)}</Text>
                ) : null}
                <ResultBalls draw={draw} rule={rule} />
                <View style={styles.drawDetails}>
                  <Text style={[styles.prize, { color: colors.danger }]}>{formatPeso(draw.amount)}</Text>
                  <DrawComposition draw={draw} rule={rule} />
                </View>
              </View>
              <View style={styles.winnerColumn}>
                <Text style={[styles.winnerCount, { color: colors.text }]}>{formatCount(draw.winners)}</Text>
                <Text style={[styles.winnerLabel, { color: colors.textMuted }]}>winner{draw.winners === 1 ? '' : 's'}</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.noDrawRow}>
            <Text style={[styles.noDraw, { color: colors.textMuted }]}>No draw on this date</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function ResultsScreen() {
  const { draws, drawsByDate, source, error } = useDraws();
  const { enabledGames } = usePreferences();
  const { colors } = useAppTheme();
  const { navigate } = useGuardedNavigation();
  const [offset, setOffset] = useState(0);
  const visibleGameCodes = RESULT_GAME_CODES.filter((code) => enabledGames.includes(code));
  const dates = useMemo(
    () =>
      [...new Set(draws.filter((draw) => enabledGames.includes(draw.logicalGameCode)).map((draw) => draw.date))]
        .sort((left, right) => right.localeCompare(left)),
    [draws, enabledGames],
  );
  const selectedDate = dates[Math.min(offset, Math.max(0, dates.length - 1))] ?? '';
  const selectedDraws = useMemo(() => {
    const grouped = new Map<LogicalGameCode, LotteryDraw[]>();
    RESULT_GAME_CODES.forEach((code) => grouped.set(code, []));
    [...(drawsByDate.get(selectedDate) ?? [])]
      .sort((left, right) => left.time.localeCompare(right.time))
      .forEach((draw) => grouped.get(draw.logicalGameCode)?.push(draw));
    return grouped;
  }, [drawsByDate, selectedDate]);

  return (
    <Screen scrollToTopOnFocus title="Results">
      {error ? (
        <Notice tone="warning">
          {source === 'live'
            ? 'Some results are temporarily using the saved copy.'
            : 'Live results are unavailable. Showing saved results.'}
        </Notice>
      ) : null}

      <View style={[styles.historyBar, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous result date"
          accessibilityState={{ disabled: offset >= dates.length - 1 }}
          disabled={offset >= dates.length - 1}
          onPress={() => setOffset((value) => Math.min(dates.length - 1, value + 1))}
          style={({ pressed }) => [styles.historyButton, offset >= dates.length - 1 && styles.disabled, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.historyDate, { color: colors.text }]}>
          {selectedDate ? formatResultDate(selectedDate) : 'No results'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next result date"
          accessibilityState={{ disabled: offset === 0 }}
          disabled={offset === 0}
          onPress={() => setOffset((value) => Math.max(0, value - 1))}
          style={({ pressed }) => [styles.historyButton, offset === 0 && styles.disabled, pressed && styles.pressed]}>
          <Ionicons name="chevron-forward" size={24} color={colors.text} />
        </Pressable>
      </View>

      {visibleGameCodes.length ? (
        visibleGameCodes.map((code, index) => (
          <Fragment key={code}>
            <GameResultCard
              rule={GAME_BY_CODE[code]}
              draws={selectedDraws.get(code) ?? []}
              onPress={() => navigate({ pathname: '/game-history', params: { game: code } })}
            />
            {(index + 1) % 3 === 0 && index < visibleGameCodes.length - 1 ? (
              <ResultAdCard placement="results" />
            ) : null}
          </Fragment>
        ))
      ) : (
        <Notice>No games are selected. Go to Settings &gt; My Games to choose which results appear here.</Notice>
      )}

      <Notice>For ages 18 and older. Play responsibly and always verify your ticket with PCSO.</Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.65 },
  cardPressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.25 },
  historyBar: {
    minHeight: 52,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.slate200,
  },
  historyButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  historyDate: { flex: 1, color: palette.navy950, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  gameCard: {
    minHeight: 116,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.slate200,
    backgroundColor: palette.white,
    ...shadow,
  },
  logoColumn: { width: 58, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 58, height: 58 },
  gameContent: { flex: 1, gap: spacing.sm },
  gameHeader: { minHeight: 24, flexDirection: 'row', alignItems: 'center' },
  gameName: { flex: 1, color: palette.navy950, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  drawLine: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  drawDivider: { paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: palette.slate200 },
  drawCenter: { flex: 1, gap: 6 },
  drawTime: { color: palette.blue600, fontSize: 10, fontWeight: '900' },
  balls: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  ball: {
    minWidth: 27,
    height: 27,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: palette.blue600,
  },
  ballText: { color: palette.white, fontSize: 11, fontWeight: '900' },
  drawDetails: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  prize: { color: palette.coral600, fontSize: 12, fontWeight: '900' },
  composition: { color: palette.slate600, fontSize: 9, fontWeight: '800' },
  winnerColumn: { width: 52, alignItems: 'center', justifyContent: 'center' },
  winnerCount: { color: palette.navy900, fontSize: 18, lineHeight: 21, fontWeight: '900' },
  winnerLabel: { color: palette.slate600, fontSize: 9, fontWeight: '700' },
  noDrawRow: { minHeight: 50, justifyContent: 'center' },
  noDraw: { color: palette.slate500, fontSize: 12 },
});
