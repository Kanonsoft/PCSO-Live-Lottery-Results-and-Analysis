import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { useAnalysisInterstitial } from '@/components/ads/analysis-interstitial';
import { GamePicker } from '@/components/game-picker';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { SectionCard } from '@/components/section-card';
import { SegmentedControl } from '@/components/segmented-control';
import {
  ANALYSIS_DRAW_COUNT,
  findingsForRule,
  latestAnalysisDraws,
  type AnalysisFinding,
  type AnalysisSlot,
} from '@/domain/analysis-navigation';
import { GAME_BY_CODE } from '@/domain/games';
import type { LogicalGameCode } from '@/domain/types';
import { formatDrawDate } from '@/lib/format';
import { useGuardedNavigation } from '@/lib/use-guarded-navigation';
import { useDraws } from '@/providers/draws-provider';
import { useAppTheme } from '@/providers/preferences-provider';
import { radius, spacing } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];
const ANALYSIS_REVEAL_DELAY_MS = 850;

function FindingButton({
  title,
  description,
  icon,
  onPress,
  disabled = false,
}: {
  title: string;
  description: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.findingButton,
        { backgroundColor: colors.surface, borderColor: colors.border },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.findingIcon, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons color={colors.primary} name={icon} size={22} />
      </View>
      <View style={styles.findingCopy}>
        <Text style={[styles.findingTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.findingDescription, { color: colors.textMuted }]}>{description}</Text>
      </View>
      <Ionicons color={colors.primary} name="chevron-forward" size={20} />
    </Pressable>
  );
}

export default function AnalysisScreen() {
  const { draws } = useDraws();
  const { colors } = useAppTheme();
  const { runBeforeAnalysis } = useAnalysisInterstitial();
  const { navigate } = useGuardedNavigation();
  const [gameCode, setGameCode] = useState<LogicalGameCode>('UL58');
  const [slot, setSlot] = useState<AnalysisSlot>('ALL');
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const analysisTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisInFlight = useRef(false);
  const analysisRequest = useRef(0);

  const rule = GAME_BY_CODE[gameCode];
  const selectedDraws = useMemo(
    () => latestAnalysisDraws(draws, gameCode, slot),
    [draws, gameCode, slot],
  );
  const findings = findingsForRule(rule);
  const firstDraw = selectedDraws[0];
  const lastDraw = selectedDraws.at(-1);

  const resetAnalysis = () => {
    analysisRequest.current += 1;
    analysisInFlight.current = false;
    if (analysisTimer.current) {
      clearTimeout(analysisTimer.current);
      analysisTimer.current = null;
    }
    setIsAnalyzing(false);
    setHasAnalyzed(false);
  };

  useEffect(
    () => () => {
      analysisRequest.current += 1;
      analysisInFlight.current = false;
      if (analysisTimer.current) clearTimeout(analysisTimer.current);
    },
    [],
  );

  const changeGame = (nextGame: LogicalGameCode) => {
    setGameCode(nextGame);
    setSlot('ALL');
    resetAnalysis();
  };

  const changeSlot = (nextSlot: AnalysisSlot) => {
    setSlot(nextSlot);
    resetAnalysis();
  };

  const analyze = () => {
    if (analysisInFlight.current || selectedDraws.length === 0) return;

    analysisInFlight.current = true;
    const request = analysisRequest.current + 1;
    analysisRequest.current = request;
    setHasAnalyzed(false);
    setIsAnalyzing(true);

    runBeforeAnalysis(() => {
      if (request !== analysisRequest.current) return;
      analysisTimer.current = setTimeout(() => {
        if (request !== analysisRequest.current) return;
        analysisTimer.current = null;
        analysisInFlight.current = false;
        setIsAnalyzing(false);
        setHasAnalyzed(true);
      }, ANALYSIS_REVEAL_DELAY_MS);
    });
  };

  const openFinding = (finding: AnalysisFinding) => {
    navigate({
      pathname: '/analysis-finding',
      params: { finding, game: gameCode, slot },
    });
  };

  return (
    <Screen scrollToTopOnFocus title="Analysis">
      <SectionCard title="Choose a game">
        <GamePicker value={gameCode} onChange={changeGame} />
        {rule.slots ? (
          <View style={styles.controlGroup}>
            <Text style={[styles.controlLabel, { color: colors.text }]}>Time</Text>
            <SegmentedControl
              accessibilityLabel="Choose analysis draw time"
              value={slot}
              onChange={changeSlot}
              segments={[
                { label: 'All', value: 'ALL' as const },
                ...rule.slots.map((item) => ({ label: item.label, value: item.gameCode })),
              ]}
            />
          </View>
        ) : null}
        <ActionButton
          disabled={selectedDraws.length === 0}
          icon="analytics"
          label={
            isAnalyzing
              ? 'Analyzing...'
              : 'Analyze latest ' + ANALYSIS_DRAW_COUNT + ' draws'
          }
          loading={isAnalyzing}
          onPress={analyze}
        />
      </SectionCard>

      {hasAnalyzed ? (
        selectedDraws.length ? (
          <View style={styles.findings}>
            <View style={styles.scope}>
              <Text style={[styles.scopeTitle, { color: colors.text }]}>{rule.name}</Text>
              <Text style={[styles.scopeText, { color: colors.textMuted }]}>
                {selectedDraws.length} draws · {formatDrawDate(firstDraw?.date ?? '')} to {formatDrawDate(lastDraw?.date ?? '')}
              </Text>
            </View>
            {findings.map((finding) => (
              <FindingButton
                description={finding.description}
                icon={finding.icon as IconName}
                key={finding.id}
                onPress={() => openFinding(finding.id)}
                title={finding.title}
              />
            ))}
          </View>
        ) : (
          <Notice>No draw records are available for this game and time.</Notice>
        )
      ) : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  controlGroup: { gap: spacing.sm },
  controlLabel: { fontSize: 12, fontWeight: '900' },
  findings: { gap: spacing.sm },
  scope: { paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  scopeTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900' },
  scopeText: { marginTop: 2, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  findingButton: {
    minHeight: 72,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  findingIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  findingCopy: { flex: 1, minWidth: 0 },
  findingTitle: { fontSize: 14, lineHeight: 18, fontWeight: '900' },
  findingDescription: { marginTop: 2, fontSize: 10, lineHeight: 14 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
});
