import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';
import type { LegalAction } from '@/types/game';
import { REGION_HINTS, REGION_LABELS } from '@/utils/card-catalog';

import { DialogFrame } from './DialogFrame';

const ORDER = ['TOP', 'NEAR_TOP', 'MIDDLE', 'BOTTOM'] as const;

type Region = (typeof ORDER)[number];

interface ReinsertTribulationDialogProps {
  visible: boolean;
  /** 后端给出的 4 条 REINSERT_TRIBULATION 动作（每条只含自身区域） */
  actions: LegalAction[];
  submitting?: boolean;
  onSelect: (action: LegalAction, region: Region) => void;
  onClose: () => void;
}

function regionOf(action: LegalAction): Region | null {
  const options = action.params?.region?.options ?? [];
  const found = options.find((option) => (ORDER as readonly string[]).includes(option));
  return (found as Region | undefined) ?? null;
}

/** 天劫回插（API_CONTRACT §12.5）：TOP / NEAR_TOP / MIDDLE / BOTTOM */
export function ReinsertTribulationDialog({
  visible,
  actions,
  submitting = false,
  onSelect,
  onClose,
}: ReinsertTribulationDialogProps) {
  const [region, setRegion] = useState<Region>('TOP');

  useEffect(() => {
    if (visible) setRegion('TOP');
  }, [visible]);

  const action = actions.find((item) => regionOf(item) === region);
  const availableRegions = new Set(actions.map(regionOf).filter(Boolean) as Region[]);

  return (
    <DialogFrame
      visible={visible}
      tone="danger"
      title="天劫回插"
      subtitle="护劫符已化解天劫：请选择把【天劫】放回牌堆的位置"
      onClose={onClose}
      footer={
        <>
          <View style={styles.footerItem}>
            <PrimaryButton label="稍后决定" variant="ghost" onPress={onClose} disabled={submitting} />
          </View>
          <View style={styles.footerItem}>
            <PrimaryButton
              label={action ? action.label : `回插：${REGION_LABELS[region]}`}
              variant="gold"
              disabled={!action || submitting}
              loading={submitting}
              onPress={() => {
                if (action) onSelect(action, region);
              }}
              glyph="劫"
              testID="reinsert-confirm"
            />
          </View>
        </>
      }
    >
      <View style={styles.diagram}>
        {ORDER.map((item, index) => {
          const selected = item === region;
          const enabled = availableRegions.has(item);
          return (
            <Pressable
              key={item}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !enabled }}
              accessibilityLabel={`回插到${REGION_LABELS[item]}`}
              disabled={!enabled}
              onPress={() => setRegion(item)}
              style={[
                styles.zone,
                selected ? styles.zoneSelected : null,
                !enabled ? styles.zoneDisabled : null,
                { opacity: 1 - index * 0.12 },
              ]}
            >
              <Text style={[styles.zoneLabel, selected ? styles.zoneLabelSelected : null]}>
                {index + 1}. {REGION_LABELS[item]}
              </Text>
              <Text style={styles.zoneHint}>{REGION_HINTS[item]}</Text>
              {selected ? <Text style={styles.zoneTick}>✓ 已选</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {actions.length === 0 ? (
        <Text style={styles.warn}>后端未给出回插动作，暂时无法提交（请刷新局面）。</Text>
      ) : null}
    </DialogFrame>
  );
}

const styles = StyleSheet.create({
  diagram: {
    marginBottom: spacing.sm,
  },
  zone: {
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: minTouchTarget,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    backgroundColor: 'rgba(164,66,61,0.12)',
  },
  zoneSelected: {
    borderColor: colors.goldLight,
    backgroundColor: 'rgba(201,166,90,0.22)',
  },
  zoneDisabled: {
    opacity: 0.4,
  },
  zoneLabel: {
    ...text.bodyStrong,
    fontSize: 13,
  },
  zoneLabelSelected: {
    color: colors.goldLight,
  },
  zoneHint: {
    ...text.label,
    fontSize: 10,
  },
  zoneTick: {
    ...text.label,
    fontSize: 10,
    color: colors.goldLight,
    marginTop: 2,
  },
  warn: {
    ...text.label,
    color: colors.danger,
  },
  footerItem: {
    flex: 1,
  },
});
