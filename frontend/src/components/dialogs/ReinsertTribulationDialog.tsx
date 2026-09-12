/**
 * 天劫回插（API_CONTRACT §12.5）：TOP / NEAR_TOP / MIDDLE / BOTTOM。
 * 四个区域**各自对应后端发出的一条 REINSERT_TRIBULATION 动作**，没有动作的区域禁用。
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NightButton } from '@/components/ui/NightButton';
import { nightColors } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
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
          <NightButton
            label="稍后决定"
            variant="ghost"
            onPress={onClose}
            disabled={submitting}
            style={styles.footerItem}
          />
          <NightButton
            label={action ? action.label : `回插：${REGION_LABELS[region]}`}
            variant="danger"
            disabled={!action || submitting}
            loading={submitting}
            onPress={() => {
              if (action) onSelect(action, region);
            }}
            glyph="劫"
            testID="reinsert-confirm"
            style={styles.footerItem}
          />
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
                { opacity: enabled ? 1 - index * 0.08 : 0.35 },
              ]}
            >
              <Text
                style={[styles.zoneLabel, selected ? styles.zoneLabelSelected : null]}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {index + 1}. {REGION_LABELS[item]}
              </Text>
              <Text style={styles.zoneHint} numberOfLines={1} allowFontScaling={false}>
                {REGION_HINTS[item]}
              </Text>
              {selected ? (
                <Text style={styles.zoneTick} allowFontScaling={false}>
                  ✓ 已选
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {actions.length === 0 ? (
        <Text style={styles.warn} allowFontScaling={false}>
          后端未给出回插动作，暂时无法提交（请刷新局面）。
        </Text>
      ) : null}
    </DialogFrame>
  );
}

const styles = StyleSheet.create({
  diagram: {
    marginBottom: 4,
  },
  zone: {
    borderWidth: borderWidth.hair,
    borderColor: nightColors.hairline,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: minTouchTarget,
    justifyContent: 'center',
    marginBottom: 4,
    backgroundColor: 'rgba(90, 33, 28, 0.32)',
  },
  zoneSelected: {
    borderColor: nightColors.cardEdgeSoft,
    backgroundColor: 'rgba(201, 166, 90, 0.26)',
  },
  zoneDisabled: {
    opacity: 0.35,
  },
  zoneLabel: {
    fontFamily: fontFamily.title,
    fontSize: 13,
    fontWeight: '700',
    color: nightColors.card,
  },
  zoneLabelSelected: {
    color: nightColors.cardEdge,
  },
  zoneHint: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.muted,
    marginTop: 1,
  },
  zoneTick: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.cardEdge,
    marginTop: 2,
  },
  warn: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.dangerText,
  },
  footerItem: {
    flex: 1,
  },
});
