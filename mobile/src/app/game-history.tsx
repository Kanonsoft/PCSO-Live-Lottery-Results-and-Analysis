import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ResultAdCard } from '@/components/ads/result-ad-card';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { GAME_BY_CODE, formatNumber, isLogicalGameCode } from '@/domain/games';
import type { GameRule, LogicalGameCode, LotteryDraw } from '@/domain/types';
import { formatCount, formatDrawTime, formatPeso } from '@/lib/format';
import { useDraws } from '@/providers/draws-provider';
import { useAppTheme, type AppThemeColors } from '@/providers/preferences-provider';
import { palette, radius, shadow, spacing } from '@/theme/tokens';

const PAGE_SIZE = 10;
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

function formatHistoryDate(isoDate: string): string {
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

export default function GameHistoryScreen() {
  const params = useLocalSearchParams<{ game?: string | string[] }>();
  const rawGame = Array.isArray(params.game) ? params.game[0] : params.game;
  const gameCode = isLogicalGameCode(rawGame) ? rawGame : null;
  const rule = gameCode ? GAME_BY_CODE[gameCode] : null;
  const { drawsByGame } = useDraws();
  const { colors, isDark } = useAppTheme();
  const pageStyles = useMemo(() => makeStyles(colors), [colors]);
  const [pageState, setPageState] = useState<{
    readonly gameCode: LogicalGameCode | null;
    readonly limit: number;
  }>({ gameCode, limit: PAGE_SIZE });
  const limit = pageState.gameCode === gameCode ? pageState.limit : PAGE_SIZE;

  const history = gameCode ? drawsByGame[gameCode] : [];
  const visibleHistory = history.slice(0, limit);
  const hasMore = limit < history.length;

  return (
    <Screen
      backLabel="Back to results"
      eyebrow="RESULT HISTORY"
      onBack={() => router.back()}
      title={rule ? `${rule.name} History` : 'Result History'}>
      {!rule ? (
        <Notice tone="warning">This lottery game could not be found.</Notice>
      ) : (
        <>
          <Text style={pageStyles.countText}>
            Newest first - showing {visibleHistory.length} of {history.length}
          </Text>

          {visibleHistory.map((draw, index) => (
            <Fragment key={`${draw.gameCode}-${draw.date}-${draw.time}`}>
              <View
                style={[
                  pageStyles.record,
                  isDark && { shadowColor: colors.overlay, shadowOpacity: 0.42 },
                ]}>
                <View style={pageStyles.recordHeader}>
                  <Text style={pageStyles.recordDate}>{formatHistoryDate(draw.date)}</Text>
                  <View style={pageStyles.timeBadge}>
                    <Text style={pageStyles.recordTime}>{formatDrawTime(draw.time)}</Text>
                  </View>
                </View>

                <View style={pageStyles.resultRow}>
                  <View style={styles.logoColumn}>
                    <Image
                      source={GAME_LOGOS[rule.code]}
                      contentFit="contain"
                      style={styles.logo}
                    />
                  </View>
                  <View style={pageStyles.resultCenter}>
                    <Text accessibilityRole="header" style={pageStyles.gameName}>
                      {rule.name}
                    </Text>
                    <ResultBalls draw={draw} rule={rule} />
                    <View style={pageStyles.drawDetails}>
                      <Text style={pageStyles.recordPrize}>{formatPeso(draw.amount)}</Text>
                      <DrawComposition draw={draw} rule={rule} />
                    </View>
                  </View>
                  <View style={styles.winnerColumn}>
                    <Text style={pageStyles.winnerCount}>{formatCount(draw.winners)}</Text>
                    <Text style={pageStyles.winnerLabel}>
                      winner{draw.winners === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>
              </View>
              {index % PAGE_SIZE === 4 && index + 1 < visibleHistory.length ? (
                <ResultAdCard placement="history" />
              ) : null}
            </Fragment>
          ))}

          {!visibleHistory.length ? (
            <Notice>No result history is available for this game.</Notice>
          ) : null}

          {hasMore ? (
            <Pressable
              accessibilityLabel={`Load 10 more ${rule.name} results`}
              accessibilityRole="button"
              onPress={() => setPageState({
                gameCode,
                limit: Math.min(limit + PAGE_SIZE, history.length),
              })}
              style={({ pressed }) => [pageStyles.moreButton, pressed && pageStyles.pressed]}>
              <Text style={pageStyles.moreText}>More Results</Text>
              <Ionicons name="chevron-down" size={18} color={palette.white} />
            </Pressable>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function makeStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    countText: {
      paddingHorizontal: spacing.xs,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    record: {
      padding: spacing.md,
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      ...shadow,
    },
    recordHeader: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    recordDate: {
      flex: 1,
      color: colors.text,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '900',
    },
    timeBadge: {
      minHeight: 28,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      backgroundColor: palette.blue600,
    },
    recordTime: { color: palette.white, fontSize: 10, fontWeight: '900' },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    resultCenter: { flex: 1, minWidth: 0, gap: spacing.sm },
    gameName: { color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: '900' },
    drawDetails: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    recordPrize: { color: colors.danger, fontSize: 12, fontWeight: '900' },
    winnerCount: { color: colors.text, fontSize: 18, lineHeight: 21, fontWeight: '900' },
    winnerLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
    moreButton: {
      minHeight: 48,
      paddingHorizontal: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
    },
    moreText: { color: palette.white, fontSize: 13, fontWeight: '900' },
    pressed: { opacity: 0.68 },
  });
}

const styles = StyleSheet.create({
  logoColumn: { width: 58, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 58, height: 58 },
  balls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ball: {
    minWidth: 27,
    height: 27,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  ballText: { color: palette.white, fontSize: 11, fontWeight: '900' },
  composition: { color: palette.slate600, fontSize: 9, fontWeight: '800' },
  winnerColumn: { width: 52, alignItems: 'center', justifyContent: 'center' },
});
