export const COURSE_ARCHETYPES = Object.freeze([
  "links",
  "open-parkland",
  "woodland",
  "florida-soft",
] as const);

export type CourseArchetype = (typeof COURSE_ARCHETYPES)[number];

export type GroundShotIdentity =
  | "bump-and-run"
  | "controlled-release"
  | "recovery-run"
  | "soft-chip";

export type AerialShotIdentity =
  | "flighted-punch"
  | "stock-flight"
  | "windowed-flight"
  | "high-stop";

export type CourseCharacterProfile = Readonly<{
  id: CourseArchetype;
  label: string;
  turfFirmness: number;
  restitution: number;
  rollingResistance: number;
  rollScale: number;
  greenReceptiveness: number;
  roughEnergyRetention: number;
  roughSpinRetention: number;
  windExposure: Readonly<{
    flightScale: number;
    gustAmplitude: number;
    shelter: "exposed" | "open" | "screened";
  }>;
  preferredGroundIdentity: GroundShotIdentity;
  preferredAerialIdentity: AerialShotIdentity;
}>;

const profile = (
  value: CourseCharacterProfile,
): CourseCharacterProfile => Object.freeze({
  ...value,
  windExposure: Object.freeze({ ...value.windExposure }),
});

export const COURSE_CHARACTERS: Readonly<
  Record<CourseArchetype, CourseCharacterProfile>
> = Object.freeze({
  links: profile({
    id: "links",
    label: "Running links",
    turfFirmness: 0.9,
    restitution: 1.28,
    rollingResistance: 0.68,
    rollScale: 1.62,
    greenReceptiveness: 0.3,
    roughEnergyRetention: 0.9,
    roughSpinRetention: 0.82,
    windExposure: {
      flightScale: 1.22,
      gustAmplitude: 0.17,
      shelter: "exposed",
    },
    preferredGroundIdentity: "bump-and-run",
    preferredAerialIdentity: "flighted-punch",
  }),
  "open-parkland": profile({
    id: "open-parkland",
    label: "Open parkland",
    turfFirmness: 0.64,
    restitution: 1,
    rollingResistance: 1.05,
    rollScale: 1,
    greenReceptiveness: 0.58,
    roughEnergyRetention: 0.92,
    roughSpinRetention: 0.86,
    windExposure: {
      flightScale: 1,
      gustAmplitude: 0.13,
      shelter: "open",
    },
    preferredGroundIdentity: "controlled-release",
    preferredAerialIdentity: "stock-flight",
  }),
  woodland: profile({
    id: "woodland",
    label: "Sheltered woodland",
    turfFirmness: 0.5,
    restitution: 0.84,
    rollingResistance: 1.25,
    rollScale: 0.78,
    greenReceptiveness: 0.68,
    roughEnergyRetention: 0.84,
    roughSpinRetention: 0.76,
    windExposure: {
      flightScale: 0.72,
      gustAmplitude: 0.08,
      shelter: "screened",
    },
    preferredGroundIdentity: "recovery-run",
    preferredAerialIdentity: "windowed-flight",
  }),
  "florida-soft": profile({
    id: "florida-soft",
    label: "Soft Florida",
    turfFirmness: 0.28,
    restitution: 0.58,
    rollingResistance: 1.58,
    rollScale: 0.55,
    greenReceptiveness: 0.92,
    roughEnergyRetention: 0.78,
    roughSpinRetention: 0.7,
    windExposure: {
      flightScale: 1.04,
      gustAmplitude: 0.14,
      shelter: "open",
    },
    preferredGroundIdentity: "soft-chip",
    preferredAerialIdentity: "high-stop",
  }),
});

export function courseCharacter(
  id: CourseArchetype = "open-parkland",
): CourseCharacterProfile {
  const character = COURSE_CHARACTERS[id];
  if (!character) throw new RangeError(`Unknown course archetype: ${id}`);
  return character;
}

export type CourseReleaseSurface = "fairway" | "green" | "rough" | "bunker";

export type CourseReleaseRead = Readonly<{
  course: CourseArchetype;
  surface: CourseReleaseSurface;
  character: "running" | "balanced" | "holding";
  restitutionScale: number;
  rollScale: number;
  rollingResistance: number;
  preferredGroundIdentity: GroundShotIdentity;
  preferredAerialIdentity: AerialShotIdentity;
}>;

export function courseReleaseRead(
  id: CourseArchetype = "open-parkland",
  surface: CourseReleaseSurface = "fairway",
): CourseReleaseRead {
  const character = courseCharacter(id);
  const receptivenessScale = surface === "green"
    ? 1.32 - character.greenReceptiveness * 0.55
    : 1;
  const roughScale = surface === "rough"
    ? character.roughEnergyRetention /
      COURSE_CHARACTERS["open-parkland"].roughEnergyRetention * 0.48
    : 1;
  const bunkerScale = surface === "bunker" ? 0.38 : 1;
  const rollScale = character.rollScale * receptivenessScale * roughScale * bunkerScale;
  const restitutionScale = character.restitution *
    (0.72 + character.turfFirmness * 0.44) *
    (surface === "green" ? 1.3 - character.greenReceptiveness * 0.55 : 1) *
    (surface === "rough" ? 0.72 : surface === "bunker" ? 0.38 : 1);
  const releaseIndex = rollScale *
    (COURSE_CHARACTERS["open-parkland"].rollingResistance /
      character.rollingResistance) ** 0.4;
  const releaseCharacter = releaseIndex >= 1.25
    ? "running"
    : releaseIndex <= 0.72
      ? "holding"
      : "balanced";

  return Object.freeze({
    course: id,
    surface,
    character: releaseCharacter,
    restitutionScale,
    rollScale,
    rollingResistance: character.rollingResistance,
    preferredGroundIdentity: character.preferredGroundIdentity,
    preferredAerialIdentity: character.preferredAerialIdentity,
  });
}
