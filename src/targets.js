const TARGETS = [
  {
    key: "milky-way-core",
    canonicalName: "Milky Way Core",
    aliases: ["milky way", "milky way core", "galactic core", "galactic center", "sagittarius a*", "mw core", "은하수", "은하수 코어", "은하수 중심"],
    raHours: 17 + 45 / 60 + 40 / 3600,
    decDegrees: -(29 + 0 / 60 + 28 / 3600),
    category: "milky_way",
  },
  {
    key: "andromeda-galaxy",
    canonicalName: "Andromeda Galaxy",
    aliases: ["andromeda", "andromeda galaxy", "m31", "ngc 224", "안드로메다", "안드로메다 은하"],
    raHours: 0 + 42 / 60 + 44.3 / 3600,
    decDegrees: 41 + 16 / 60 + 9 / 3600,
    category: "deep_sky",
  },
  {
    key: "orion-nebula",
    canonicalName: "Orion Nebula",
    aliases: ["orion nebula", "m42", "ngc 1976", "오리온 성운", "오리온 대성운"],
    raHours: 5 + 35 / 60 + 17 / 3600,
    decDegrees: -(5 + 23 / 60 + 28 / 3600),
    category: "deep_sky",
  },
  {
    key: "pleiades",
    canonicalName: "Pleiades",
    aliases: ["pleiades", "m45", "seven sisters", "플레이아데스", "좀생이별"],
    raHours: 3 + 47 / 60,
    decDegrees: 24 + 7 / 60,
    category: "deep_sky",
  },
  {
    key: "lagoon-nebula",
    canonicalName: "Lagoon Nebula",
    aliases: ["lagoon nebula", "m8", "ngc 6523", "석호 성운"],
    raHours: 18 + 3 / 60 + 37 / 3600,
    decDegrees: -(24 + 23 / 60 + 12 / 3600),
    category: "deep_sky",
  },
  {
    key: "north-america-nebula",
    canonicalName: "North America Nebula",
    aliases: ["north america nebula", "ngc 7000", "north america", "북아메리카 성운"],
    raHours: 20 + 58 / 60 + 54 / 3600,
    decDegrees: 44 + 19 / 60,
    category: "deep_sky",
  },
  {
    key: "rho-ophiuchi",
    canonicalName: "Rho Ophiuchi",
    aliases: ["rho ophiuchi", "rho oph"],
    raHours: 16 + 25 / 60 + 35 / 3600,
    decDegrees: -(23 + 26 / 60 + 49 / 3600),
    category: "wide_field",
  },
];

function normalizeTargetKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, " ").trim();
}

function containsNormalizedPhrase(normalizedText, normalizedAlias) {
  if (/[가-힣]/.test(normalizedAlias)) {
    return normalizedText.includes(normalizedAlias);
  }

  return (
    normalizedText === normalizedAlias
    || normalizedText.startsWith(`${normalizedAlias} `)
    || normalizedText.endsWith(` ${normalizedAlias}`)
    || normalizedText.includes(` ${normalizedAlias} `)
  );
}

export function resolveTargetDefinition(name) {
  const normalized = normalizeTargetKey(name);
  const match = TARGETS.find((target) =>
    [target.canonicalName, ...target.aliases].some((alias) => normalizeTargetKey(alias) === normalized),
  );

  if (!match) {
    throw new Error(`Unknown target name: ${name}`);
  }

  return {
    name: match.canonicalName,
    raHours: match.raHours,
    decDegrees: match.decDegrees,
    category: match.category,
    source: "catalog",
    key: match.key,
  };
}

export function findTargetMention(text) {
  if (!text) {
    return null;
  }

  const normalizedText = normalizeTargetKey(text);
  if (!normalizedText) {
    return null;
  }

  const match = TARGETS.find((target) =>
    [target.canonicalName, ...target.aliases]
      .map((alias) => normalizeTargetKey(alias))
      .some((alias) => containsNormalizedPhrase(normalizedText, alias)),
  );

  if (!match) {
    return null;
  }

  return {
    name: match.canonicalName,
    category: match.category,
    key: match.key,
  };
}

export function resolveTargetInput(targetInput) {
  if (!targetInput) {
    return null;
  }

  if (targetInput.name) {
    const hinted = findTargetMention(targetInput.name);
    if (hinted?.name) {
      return resolveTargetDefinition(hinted.name);
    }
  }

  if (targetInput.ra_hours !== undefined || targetInput.dec_degrees !== undefined) {
    return {
      name: targetInput.name ?? "Custom target",
      raHours: targetInput.ra_hours,
      decDegrees: targetInput.dec_degrees,
      category: targetInput.category ?? "custom",
      source: "custom",
      key: "custom-target",
    };
  }

  return resolveTargetDefinition(targetInput.name);
}
