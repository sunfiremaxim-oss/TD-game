// Access purchases are separate from permanent stat levels. Each branch advances independently.
export const UPGRADE_TIERS = {
  offense: [
    { ids: ['damage', 'attackSpeed', 'range'], cost: 0 },
    { ids: ['critChance', 'critDamage'], cost: 20 },
    { ids: ['multishotChance', 'multishotTargets'], cost: 50 },
    { ids: ['ricochetChance', 'ricochetCount'], cost: 100 },
    { ids: ['rapidFireChance', 'rapidFireDuration'], cost: 175 }
  ],
  defense: [
    { ids: ['maxHealth', 'healthRegen'], cost: 0 },
    { ids: ['armorPercent', 'flatArmor'], cost: 20 },
    { ids: ['damageReflection', 'lifeSteal'], cost: 50 },
    { ids: ['knockbackChance', 'knockbackPower'], cost: 100 }
  ],
  utility: [
    { ids: ['killCashBonus', 'waveCashBonus'], cost: 0 },
    { ids: ['crystalDropChance', 'crystalWaveBonus'], cost: 20 },
    { ids: ['freeAttackChance'], cost: 50 },
    { ids: ['freeDefenseChance'], cost: 100 },
    { ids: ['freeEconomyChance'], cost: 175 }
  ]
};

export const ALL_UPGRADE_TIERS = Object.fromEntries(Object.entries(UPGRADE_TIERS).map(([key, tiers]) => [key, tiers.length]));
const upgradeAccess = new Map(Object.entries(UPGRADE_TIERS).flatMap(([category, tiers]) =>
  tiers.flatMap((tier, index) => tier.ids.map(id => [id, { category, tier: index + 1 }]))));

export function normalizeUpgradeTiers(value = {}, legacyLevels = null) {
  return Object.fromEntries(Object.entries(UPGRADE_TIERS).map(([key, tiers]) => {
    let count = Number.isSafeInteger(value?.[key]) ? Math.max(1, Math.min(tiers.length, value[key])) : 1;
    if (legacyLevels) tiers.forEach((tier, index) => {
      if (tier.ids.some(id => legacyLevels[id] > 0)) count = Math.max(count, index + 1);
    });
    return [key, count];
  }));
}

export function hasUpgradeAccess(id, unlockedTiers) {
  const access = upgradeAccess.get(id);
  return Boolean(access && access.tier <= (unlockedTiers[access.category] || 1));
}
