export const LAB_HOLE_RUNTIME_SCHEMA_VERSION = 1;
export const REGULATION_CUP_DIAMETER_METERS = 0.107_95;

export const LAB_HOLE_RUNTIME_COORDINATE_SYSTEM = Object.freeze({
  units: "meters",
  origin: "tee",
  horizontalAxes: "x-z",
  verticalAxis: "+y",
  forwardAxis: "+z",
});

const SURFACE_KINDS = Object.freeze([
  "rough",
  "fairway",
  "green",
  "bunker",
  "water",
]);

const COURSE_ARCHETYPES = Object.freeze([
  "links",
  "open-parkland",
  "woodland",
  "florida-soft",
]);

const BARRIER_KINDS = Object.freeze(["stone-wall", "timber-bulkhead"]);
const ATMOSPHERES = Object.freeze(["salt-wind", "humid", "open"]);

const REQUIRED_PALETTE_KEYS = Object.freeze([
  "skyTop",
  "skyMiddle",
  "skyHorizon",
  "horizon",
  "landscapeTop",
  "landscapeMiddle",
  "landscapeBottom",
  "roughTop",
  "roughMiddle",
  "roughBottom",
  "fairwayTop",
  "fairwayMiddle",
  "fairwayBottom",
  "fringe",
  "greenTop",
  "greenMiddle",
  "greenBottom",
  "fairwayStripeLight",
  "fairwayStripeDark",
]);

const WEBGL_HEX_PALETTE_KEYS = Object.freeze([
  "skyTop",
  "skyHorizon",
  "roughMiddle",
  "fairwayMiddle",
  "greenMiddle",
]);

const OPTIONAL_PALETTE_KEYS = Object.freeze([
  "distantRidge",
  "duneHighlight",
  "duneShadow",
]);

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const assertObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
};

const assertArray = (value, label) => {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  return value;
};

const assertString = (value, label) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
};

const assertFinite = (value, label) => {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return value;
};

const assertPositive = (value, label) => {
  assertFinite(value, label);
  if (value <= 0) {
    throw new RangeError(`${label} must be positive`);
  }
  return value;
};

const assertColor = (value, label, { hexOnly = false } = {}) => {
  assertString(value, label);
  if (HEX_COLOR_PATTERN.test(value)) return value;
  if (hexOnly) {
    throw new RangeError(`${label} must be #RGB or #RRGGBB`);
  }
  const match = /^(rgb|rgba)\(([^)]+)\)$/i.exec(value);
  if (!match) {
    throw new RangeError(`${label} uses an unsupported color format`);
  }
  const components = match[2].split(",").map((component) =>
    Number(component.trim())
  );
  const expectedLength = match[1].toLowerCase() === "rgba" ? 4 : 3;
  if (
    components.length !== expectedLength ||
    components.some((component) => !Number.isFinite(component)) ||
    components.slice(0, 3).some((component) => component < 0 || component > 255) ||
    (components[3] !== undefined &&
      (components[3] < 0 || components[3] > 1))
  ) {
    throw new RangeError(`${label} uses invalid color components`);
  }
  return value;
};

const assertPoint2 = (point, label) => {
  assertObject(point, label);
  assertFinite(point.x, `${label}.x`);
  assertFinite(point.z, `${label}.z`);
  return point;
};

const assertPoint3 = (point, label) => {
  assertPoint2(point, label);
  assertFinite(point.y, `${label}.y`);
  return point;
};

const assertBounds = (bounds, label) => {
  assertObject(bounds, label);
  for (const key of ["minimumX", "maximumX", "minimumZ", "maximumZ"]) {
    assertFinite(bounds[key], `${label}.${key}`);
  }
  if (
    bounds.minimumX >= bounds.maximumX ||
    bounds.minimumZ >= bounds.maximumZ
  ) {
    throw new RangeError(`${label} must have increasing limits`);
  }
  return bounds;
};

const pointWithinBounds = (point, bounds) =>
  point.x >= bounds.minimumX &&
  point.x <= bounds.maximumX &&
  point.z >= bounds.minimumZ &&
  point.z <= bounds.maximumZ;

const pointOnSegment = (point, start, end) => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-12) {
    return (point.x - start.x) ** 2 + (point.z - start.z) ** 2 <= 1e-12;
  }
  const cross = (point.z - start.z) * dx - (point.x - start.x) * dz;
  if (Math.abs(cross) > 1e-8) return false;
  const dot = (point.x - start.x) * dx + (point.z - start.z) * dz;
  return dot >= 0 && dot <= lengthSquared;
};

const pointInPolygon = (point, points) => {
  let inside = false;
  for (
    let index = 0, previousIndex = points.length - 1;
    index < points.length;
    previousIndex = index, index += 1
  ) {
    const current = points[index];
    const previous = points[previousIndex];
    if (pointOnSegment(point, previous, current)) return true;
    if (
      current.z > point.z !== previous.z > point.z &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) /
          (previous.z - current.z) +
          current.x
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const pointOnPolygonBoundary = (point, points) => points.some(
  (start, index) => pointOnSegment(point, start, points[(index + 1) % points.length]),
);

const pointToSegmentDistance = (point, start, end) => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-12) {
    return Math.hypot(point.x - start.x, point.z - start.z);
  }
  const amount = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared,
  ));
  return Math.hypot(
    point.x - (start.x + amount * dx),
    point.z - (start.z + amount * dz),
  );
};

const signedAreaTwice = (first, second, third) =>
  (second.x - first.x) * (third.z - first.z) -
  (second.z - first.z) * (third.x - first.x);

const segmentsIntersect = (firstStart, firstEnd, secondStart, secondEnd) => {
  const firstSecondStart = signedAreaTwice(firstStart, firstEnd, secondStart);
  const firstSecondEnd = signedAreaTwice(firstStart, firstEnd, secondEnd);
  const secondFirstStart = signedAreaTwice(secondStart, secondEnd, firstStart);
  const secondFirstEnd = signedAreaTwice(secondStart, secondEnd, firstEnd);
  const epsilon = 1e-8;
  if (
    Math.abs(firstSecondStart) <= epsilon &&
    pointOnSegment(secondStart, firstStart, firstEnd)
  ) return true;
  if (
    Math.abs(firstSecondEnd) <= epsilon &&
    pointOnSegment(secondEnd, firstStart, firstEnd)
  ) return true;
  if (
    Math.abs(secondFirstStart) <= epsilon &&
    pointOnSegment(firstStart, secondStart, secondEnd)
  ) return true;
  if (
    Math.abs(secondFirstEnd) <= epsilon &&
    pointOnSegment(firstEnd, secondStart, secondEnd)
  ) return true;
  return (firstSecondStart > epsilon) !== (firstSecondEnd > epsilon) &&
    (secondFirstStart > epsilon) !== (secondFirstEnd > epsilon);
};

const assertSimplePolygon = (points, label) => {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(
        points[first],
        points[firstNext],
        points[second],
        points[secondNext],
      )) {
        throw new RangeError(`${label} must be a simple polygon`);
      }
    }
  }
};

const assertUniqueStrings = (values, label) => {
  const seen = new Set();
  values.forEach((value, index) => {
    assertString(value, `${label}[${index}]`);
    if (seen.has(value)) {
      throw new RangeError(`${label} contains duplicate id: ${value}`);
    }
    seen.add(value);
  });
};

const assertPointList = (points, label, bounds, minimum = 3) => {
  assertArray(points, label);
  if (points.length < minimum) {
    throw new RangeError(`${label} requires at least ${minimum} points`);
  }
  const coordinates = new Set();
  points.forEach((point, index) => {
    assertPoint2(point, `${label}[${index}]`);
    const coordinate = `${point.x}:${point.z}`;
    if (coordinates.has(coordinate)) {
      throw new RangeError(`${label} contains a duplicate point`);
    }
    coordinates.add(coordinate);
    if (!pointWithinBounds(point, bounds)) {
      throw new RangeError(`${label}[${index}] is outside course bounds`);
    }
  });
};

const polygonArea = (points) => Math.abs(points.reduce((area, point, index) => {
  const next = points[(index + 1) % points.length];
  return area + point.x * next.z - next.x * point.z;
}, 0) / 2);

const pointsEqual2 = (left, right) =>
  Array.isArray(left) &&
  Array.isArray(right) &&
  left.length === right.length &&
  left.every((point, index) =>
    point.x === right[index]?.x && point.z === right[index]?.z
  );

const boundsEqual = (left, right) =>
  left.minimumX === right.minimumX &&
  left.maximumX === right.maximumX &&
  left.minimumZ === right.minimumZ &&
  left.maximumZ === right.maximumZ;

const assertCamera = (camera, label) => {
  assertObject(camera, label);
  assertPoint3(camera.position, `${label}.position`);
  assertPoint3(camera.target, `${label}.target`);
  assertPositive(camera.fovDegrees, `${label}.fovDegrees`);
  if (camera.fovDegrees >= 180) {
    throw new RangeError(`${label}.fovDegrees must be below 180`);
  }
  if (
    Math.hypot(
      camera.target.x - camera.position.x,
      camera.target.y - camera.position.y,
      camera.target.z - camera.position.z,
    ) < 1e-6
  ) {
    throw new RangeError(`${label} position and target must differ`);
  }
  for (const key of ["rollDegrees", "focalShiftX", "focalShiftY"]) {
    if (camera[key] !== undefined) {
      assertFinite(camera[key], `${label}.${key}`);
    }
  }
};

const assertGameplay = (gameplay) => {
  assertObject(gameplay, "LabHoleRuntimeV1.gameplay");
  if (!Number.isInteger(gameplay.par) || gameplay.par < 3 || gameplay.par > 5) {
    throw new RangeError("LabHoleRuntimeV1.gameplay.par must be an integer from 3 to 5");
  }
  assertString(gameplay.openingClub, "LabHoleRuntimeV1.gameplay.openingClub");
  if (!COURSE_ARCHETYPES.includes(gameplay.courseArchetype)) {
    throw new RangeError("LabHoleRuntimeV1.gameplay.courseArchetype is unsupported");
  }
  assertString(gameplay.physicsVersion, "LabHoleRuntimeV1.gameplay.physicsVersion");
  assertString(gameplay.terrainVersion, "LabHoleRuntimeV1.gameplay.terrainVersion");
  if (!Number.isInteger(gameplay.roundSeed)) {
    throw new TypeError("LabHoleRuntimeV1.gameplay.roundSeed must be an integer");
  }
  assertObject(gameplay.wind, "LabHoleRuntimeV1.gameplay.wind");
  assertFinite(gameplay.wind.speed, "LabHoleRuntimeV1.gameplay.wind.speed");
  if (gameplay.wind.speed < 0) {
    throw new RangeError("LabHoleRuntimeV1.gameplay.wind.speed cannot be negative");
  }
  assertFinite(
    gameplay.wind.towardDegrees,
    "LabHoleRuntimeV1.gameplay.wind.towardDegrees",
  );
  assertString(gameplay.wind.label, "LabHoleRuntimeV1.gameplay.wind.label");

  const aim = assertObject(gameplay.aim, "LabHoleRuntimeV1.gameplay.aim");
  for (const key of ["tee", "balanced", "safe"]) {
    assertPoint2(aim[key], `LabHoleRuntimeV1.gameplay.aim.${key}`);
  }
  assertObject(aim.routes, "LabHoleRuntimeV1.gameplay.aim.routes");
  for (const key of ["safe-right", "aggressive-left"]) {
    assertPoint2(aim.routes[key], `LabHoleRuntimeV1.gameplay.aim.routes.${key}`);
  }
  assertObject(aim.lateralLimit, "LabHoleRuntimeV1.gameplay.aim.lateralLimit");
  assertPositive(aim.lateralLimit.tee, "LabHoleRuntimeV1.gameplay.aim.lateralLimit.tee");
  assertPositive(
    aim.lateralLimit.approach,
    "LabHoleRuntimeV1.gameplay.aim.lateralLimit.approach",
  );
};

const assertGeometry = (course) => {
  const geometry = assertObject(course.geometry, "LabHoleRuntimeV1.geometry");
  assertPositive(geometry.lengthMeters, "LabHoleRuntimeV1.geometry.lengthMeters");
  assertPoint2(geometry.tee, "LabHoleRuntimeV1.geometry.tee");
  assertPoint2(geometry.pin, "LabHoleRuntimeV1.geometry.pin");
  if (geometry.tee.x !== 0 || geometry.tee.z !== 0) {
    throw new RangeError("LabHoleRuntimeV1.geometry.tee must be the authored origin");
  }
  const bounds = assertBounds(geometry.bounds, "LabHoleRuntimeV1.geometry.bounds");
  for (const [label, point] of [["tee", geometry.tee], ["pin", geometry.pin]]) {
    if (!pointWithinBounds(point, bounds)) {
      throw new RangeError(`LabHoleRuntimeV1.geometry.${label} is outside bounds`);
    }
  }
  for (const [label, point] of [
    ["aim.tee", course.gameplay.aim.tee],
    ["aim.balanced", course.gameplay.aim.balanced],
    ["aim.safe", course.gameplay.aim.safe],
    ["aim.routes.safe-right", course.gameplay.aim.routes["safe-right"]],
    ["aim.routes.aggressive-left", course.gameplay.aim.routes["aggressive-left"]],
  ]) {
    if (!pointWithinBounds(point, bounds)) {
      throw new RangeError(`LabHoleRuntimeV1.gameplay.${label} is outside bounds`);
    }
  }
  const measuredLength = Math.hypot(
    geometry.pin.x - geometry.tee.x,
    geometry.pin.z - geometry.tee.z,
  );
  if (geometry.lengthMeters + 0.75 < measuredLength) {
    throw new RangeError(
      "LabHoleRuntimeV1.geometry.lengthMeters cannot be shorter than tee to pin",
    );
  }

  const surfaces = assertArray(geometry.surfaces, "LabHoleRuntimeV1.geometry.surfaces");
  assertUniqueStrings(
    surfaces.map((surface) => surface?.id),
    "LabHoleRuntimeV1.geometry surface ids",
  );
  for (const [index, surface] of surfaces.entries()) {
    assertObject(surface, `LabHoleRuntimeV1.geometry.surfaces[${index}]`);
    if (!SURFACE_KINDS.includes(surface.kind)) {
      throw new RangeError(`Unsupported surface kind: ${surface.kind}`);
    }
    const label = `LabHoleRuntimeV1.geometry.surfaces[${index}].points`;
    assertPointList(surface.points, label, bounds);
    if (polygonArea(surface.points) < 1e-6) {
      throw new RangeError(`LabHoleRuntimeV1.geometry.surfaces[${index}] is degenerate`);
    }
    assertSimplePolygon(surface.points, `LabHoleRuntimeV1.geometry.surfaces[${index}]`);
  }
  const surfacesByKind = (kind) => surfaces.filter((surface) =>
    surface.kind === kind
  );
  const rough = surfacesByKind("rough");
  const green = surfacesByKind("green");
  if (rough.length !== 1 || green.length !== 1) {
    throw new RangeError("LabHoleRuntimeV1 requires exactly one rough and one green surface");
  }
  if (
    !pointInPolygon(geometry.pin, green[0].points) ||
    pointOnPolygonBoundary(geometry.pin, green[0].points)
  ) {
    throw new RangeError("LabHoleRuntimeV1 pin must be inside its green surface");
  }
  const teeSurfaces = surfaces.filter(({ kind }) =>
    kind === "rough" || kind === "fairway" || kind === "green"
  );
  if (!teeSurfaces.some(({ points }) => pointInPolygon(geometry.tee, points))) {
    throw new RangeError("LabHoleRuntimeV1 tee must be inside a playable surface");
  }

  const bunkerSurfaces = surfacesByKind("bunker");
  const bunkerFeatures = assertArray(
    geometry.bunkerFeatures,
    "LabHoleRuntimeV1.geometry.bunkerFeatures",
  );
  if (bunkerFeatures.length !== bunkerSurfaces.length) {
    throw new RangeError("LabHoleRuntimeV1 bunker feature and surface counts differ");
  }
  assertUniqueStrings(
    bunkerFeatures.map((feature) => feature?.id),
    "LabHoleRuntimeV1.geometry bunker feature ids",
  );
  bunkerFeatures.forEach((feature, index) => {
    const label = `LabHoleRuntimeV1.geometry.bunkerFeatures[${index}]`;
    assertObject(feature, label);
    assertString(feature.surfaceId, `${label}.surfaceId`);
    if (feature.id !== feature.surfaceId) {
      throw new RangeError("LabHoleRuntimeV1 bunker feature id must match surfaceId");
    }
    if (!bunkerSurfaces.some(({ id }) => id === feature.surfaceId)) {
      throw new RangeError("LabHoleRuntimeV1 bunker feature references a missing surface");
    }
    for (const key of ["x", "z", "rotation", "shapeSeed"]) {
      assertFinite(feature[key], `${label}.${key}`);
    }
    if (!pointWithinBounds(feature, bounds)) {
      throw new RangeError(`LabHoleRuntimeV1 bunker feature ${index} is outside bounds`);
    }
    const referencedSurface = bunkerSurfaces.find(({ id }) =>
      id === feature.surfaceId
    );
    if (!pointInPolygon(feature, referencedSurface.points)) {
      throw new RangeError(
        `LabHoleRuntimeV1 bunker feature ${index} center is outside its surface`,
      );
    }
    for (const key of ["radiusX", "radiusZ", "depthMeters", "rimHeightMeters"]) {
      assertPositive(feature[key], `${label}.${key}`);
    }
    assertFinite(feature.floorRadius, `${label}.floorRadius`);
    if (feature.floorRadius <= 0 || feature.floorRadius >= 1) {
      throw new RangeError("LabHoleRuntimeV1 bunker floorRadius must be between 0 and 1");
    }
    assertString(feature.style, `${label}.style`);
  });

  const waterSurfaces = surfacesByKind("water");
  const waterBodies = assertArray(
    geometry.waterBodies,
    "LabHoleRuntimeV1.geometry.waterBodies",
  );
  assertUniqueStrings(
    waterBodies.map((body) => body?.id),
    "LabHoleRuntimeV1.geometry water body ids",
  );
  assertUniqueStrings(
    waterBodies.map((body) => body?.surfaceId),
    "LabHoleRuntimeV1.geometry water surface references",
  );
  waterBodies.forEach((body, index) => {
    const label = `LabHoleRuntimeV1.geometry.waterBodies[${index}]`;
    assertObject(body, label);
    if (!waterSurfaces.some(({ id }) => id === body.surfaceId)) {
      throw new RangeError("LabHoleRuntimeV1 water body references a missing water surface");
    }
    assertFinite(body.levelMeters, `${label}.levelMeters`);
  });
  if (waterSurfaces.length !== waterBodies.length) {
    throw new RangeError("LabHoleRuntimeV1 water surfaces require one water body each");
  }

  const barriers = assertArray(geometry.barriers, "LabHoleRuntimeV1.geometry.barriers");
  assertUniqueStrings(
    barriers.map((barrier) => barrier?.id),
    "LabHoleRuntimeV1.geometry barrier ids",
  );
  barriers.forEach((barrier, index) => {
    const label = `LabHoleRuntimeV1.geometry.barriers[${index}]`;
    assertObject(barrier, label);
    if (!BARRIER_KINDS.includes(barrier.kind)) {
      throw new RangeError(`Unsupported LabHoleRuntimeV1 barrier kind: ${barrier.kind}`);
    }
    assertPointList(barrier.points, `${label}.points`, bounds, 2);
    for (const key of ["heightMeters", "thicknessMeters"]) {
      assertPositive(barrier[key], `${label}.${key}`);
    }
    for (const key of ["normalRestitution", "tangentialRetention"]) {
      assertFinite(barrier[key], `${label}.${key}`);
      if (barrier[key] < 0 || barrier[key] > 1) {
        throw new RangeError(`LabHoleRuntimeV1 barrier ${key} must be from 0 to 1`);
      }
    }
    if (barrier.baseLevelMeters !== null) {
      assertFinite(barrier.baseLevelMeters, `${label}.baseLevelMeters`);
    }
  });

  for (const key of [
    "terrainElevationAt",
    "surfaceElevationAt",
    "greenElevationAt",
  ]) {
    if (typeof geometry[key] !== "function") {
      throw new TypeError(`LabHoleRuntimeV1.geometry.${key} must be a function`);
    }
  }
  for (const [label, point] of [["tee", geometry.tee], ["pin", geometry.pin]]) {
    for (const key of ["terrainElevationAt", "surfaceElevationAt"]) {
      assertFinite(
        geometry[key](point.x, point.z),
        `LabHoleRuntimeV1.geometry.${key}(${label})`,
      );
    }
  }
  assertFinite(
    geometry.greenElevationAt(geometry.pin.x, geometry.pin.z),
    "LabHoleRuntimeV1.geometry.greenElevationAt(pin)",
  );
};

const assertPresentation = (presentation, bounds) => {
  assertObject(presentation, "LabHoleRuntimeV1.presentation");
  const theme = assertObject(presentation.theme, "LabHoleRuntimeV1.presentation.theme");
  for (const key of [
    "sky",
    "horizon",
    "rough",
    "fairway",
    "green",
    "bunker",
    "water",
    "accent",
  ]) {
    assertColor(theme[key], `LabHoleRuntimeV1.presentation.theme.${key}`);
    if (presentation[key] !== theme[key]) {
      throw new RangeError(`LabHoleRuntimeV1.presentation.${key} must alias theme.${key}`);
    }
  }
  assertString(theme.atmosphere, "LabHoleRuntimeV1.presentation.theme.atmosphere");
  if (presentation.atmosphere !== theme.atmosphere) {
    throw new RangeError(
      "LabHoleRuntimeV1.presentation.atmosphere must alias theme.atmosphere",
    );
  }
  if (!ATMOSPHERES.includes(theme.atmosphere)) {
    throw new RangeError("LabHoleRuntimeV1 presentation atmosphere is unsupported");
  }
  const palette = assertObject(
    presentation.palette,
    "LabHoleRuntimeV1.presentation.palette",
  );
  for (const key of REQUIRED_PALETTE_KEYS) {
    assertColor(palette[key], `LabHoleRuntimeV1.presentation.palette.${key}`, {
      hexOnly: WEBGL_HEX_PALETTE_KEYS.includes(key),
    });
  }
  for (const key of OPTIONAL_PALETTE_KEYS) {
    if (palette[key] !== undefined) {
      assertColor(palette[key], `LabHoleRuntimeV1.presentation.palette.${key}`);
    }
  }
  const cameras = assertObject(
    presentation.cameras,
    "LabHoleRuntimeV1.presentation.cameras",
  );
  assertCamera(cameras.overview, "LabHoleRuntimeV1.presentation.cameras.overview");
  assertCamera(cameras.greenDetail, "LabHoleRuntimeV1.presentation.cameras.greenDetail");
  const treePositions = assertArray(
    presentation.treePositions,
    "LabHoleRuntimeV1.presentation.treePositions",
  );
  treePositions.forEach((tree, index) => {
    if (!Array.isArray(tree) || tree.length !== 3) {
      throw new TypeError(
        `LabHoleRuntimeV1.presentation.treePositions[${index}] must be [x, z, height]`,
      );
    }
    const [x, z, height] = tree;
    assertFinite(x, `LabHoleRuntimeV1.presentation.treePositions[${index}][0]`);
    assertFinite(z, `LabHoleRuntimeV1.presentation.treePositions[${index}][1]`);
    assertPositive(height, `LabHoleRuntimeV1.presentation.treePositions[${index}][2]`);
    if (!pointWithinBounds({ x, z }, bounds)) {
      throw new RangeError(`LabHoleRuntimeV1 tree position ${index} is outside bounds`);
    }
  });
  const strategyPaths = assertArray(
    presentation.strategyPaths,
    "LabHoleRuntimeV1.presentation.strategyPaths",
  );
  strategyPaths.forEach((path, index) => {
    assertObject(path, `LabHoleRuntimeV1.presentation.strategyPaths[${index}]`);
    assertColor(path.color, `LabHoleRuntimeV1.presentation.strategyPaths[${index}].color`);
    if (!Array.isArray(path.points) || path.points.length < 2) {
      throw new RangeError("LabHoleRuntimeV1 strategy path requires at least two points");
    }
    path.points.forEach((point, pointIndex) => {
      assertPoint2(
        point,
        `LabHoleRuntimeV1.presentation.strategyPaths[${index}].points[${pointIndex}]`,
      );
      if (!pointWithinBounds(point, bounds)) {
        throw new RangeError(
          `LabHoleRuntimeV1 strategy path ${index} point ${pointIndex} is outside bounds`,
        );
      }
    });
  });
  const stripe = assertObject(presentation.stripe, "LabHoleRuntimeV1.presentation.stripe");
  assertFinite(stripe.startZ, "LabHoleRuntimeV1.presentation.stripe.startZ");
  assertFinite(stripe.endZ, "LabHoleRuntimeV1.presentation.stripe.endZ");
  if (stripe.startZ >= stripe.endZ) {
    throw new RangeError("LabHoleRuntimeV1 presentation stripe must have positive length");
  }
  if (stripe.startZ < bounds.minimumZ || stripe.endZ > bounds.maximumZ) {
    throw new RangeError("LabHoleRuntimeV1 presentation stripe is outside bounds");
  }
};

const assertWorldMapping = (course) => {
  const { geometry, identity, presentation } = course;
  const world = assertObject(course.world, "LabHoleRuntimeV1.world");
  if (world.id !== identity.id || world.label !== identity.label) {
    throw new RangeError("LabHoleRuntimeV1 world identity does not match definition");
  }
  if (
    world.lengthMeters !== geometry.lengthMeters ||
    world.tee?.x !== geometry.tee.x ||
    world.tee?.z !== geometry.tee.z ||
    world.pin?.x !== geometry.pin.x ||
    world.pin?.z !== geometry.pin.z ||
    !boundsEqual(world.bounds, geometry.bounds)
  ) {
    throw new RangeError("LabHoleRuntimeV1 world geometry header does not match definition");
  }
  const greenPresentation = assertObject(
    world.greenPresentation,
    "LabHoleRuntimeV1.world.greenPresentation",
  );
  assertPoint2(greenPresentation.center, "LabHoleRuntimeV1.world.greenPresentation.center");
  for (const key of [
    "radiusX",
    "radiusZ",
    "cupDiameter",
    "flagstickHeight",
    "flagWidth",
    "flagHeight",
  ]) {
    assertPositive(greenPresentation[key], `LabHoleRuntimeV1.world.greenPresentation.${key}`);
  }
  if (
    Math.abs(
      greenPresentation.cupDiameter - REGULATION_CUP_DIAMETER_METERS,
    ) > 1e-9
  ) {
    throw new RangeError("LabHoleRuntimeV1 cupDiameter must match the regulation cup");
  }
  if (!pointWithinBounds(greenPresentation.center, geometry.bounds)) {
    throw new RangeError("LabHoleRuntimeV1 green presentation center is outside bounds");
  }
  const normalizedPinDistance =
    ((geometry.pin.x - greenPresentation.center.x) /
      greenPresentation.radiusX) ** 2 +
    ((geometry.pin.z - greenPresentation.center.z) /
      greenPresentation.radiusZ) ** 2;
  if (normalizedPinDistance >= 0.9) {
    throw new RangeError("LabHoleRuntimeV1 pin lacks green-edge cup clearance");
  }
  const greenSurface = geometry.surfaces.find(({ kind }) => kind === "green");
  const greenExtentX = Math.max(...greenSurface.points.map((point) =>
    Math.abs(point.x - greenPresentation.center.x)
  ));
  const greenExtentZ = Math.max(...greenSurface.points.map((point) =>
    Math.abs(point.z - greenPresentation.center.z)
  ));
  for (const [radius, extent, axis] of [
    [greenPresentation.radiusX, greenExtentX, "X"],
    [greenPresentation.radiusZ, greenExtentZ, "Z"],
  ]) {
    if (radius < extent * 0.5 || radius > extent * 1.5) {
      throw new RangeError(
        `LabHoleRuntimeV1 green presentation radius${axis} differs from its surface`,
      );
    }
  }
  const minimumCupClearance = greenPresentation.cupDiameter / 2 + 0.02;
  const greenEdgeDistance = Math.min(...greenSurface.points.map(
    (start, index) => pointToSegmentDistance(
      geometry.pin,
      start,
      greenSurface.points[(index + 1) % greenSurface.points.length],
    ),
  ));
  if (greenEdgeDistance < minimumCupClearance) {
    throw new RangeError("LabHoleRuntimeV1 cup lacks clearance from the green edge");
  }
  if (
    geometry.terrainElevationAt !== world.terrainElevationAt ||
    geometry.surfaceElevationAt !== world.surfaceElevationAt ||
    geometry.greenElevationAt !== world.greenElevationAt
  ) {
    throw new RangeError("LabHoleRuntimeV1 terrain samplers differ from world");
  }
  for (const key of ["centerAt", "fairwayHalfWidthAt"]) {
    if (typeof world[key] !== "function") {
      throw new TypeError(`LabHoleRuntimeV1.world.${key} must be a function`);
    }
  }
  for (const z of [geometry.tee.z, geometry.pin.z]) {
    assertFinite(world.centerAt(z), `LabHoleRuntimeV1.world.centerAt(${z})`);
    assertPositive(
      world.fairwayHalfWidthAt(z),
      `LabHoleRuntimeV1.world.fairwayHalfWidthAt(${z})`,
    );
  }

  const surfacesByKind = (kind) =>
    geometry.surfaces.filter((surface) => surface.kind === kind);
  const rough = surfacesByKind("rough");
  const green = surfacesByKind("green");
  const fairways = surfacesByKind("fairway");
  const bunkers = surfacesByKind("bunker");
  const water = surfacesByKind("water");
  if (
    Object.hasOwn(course, "roughSurfaceId") &&
    course.roughSurfaceId !== rough[0].id
  ) {
    throw new RangeError("LabHoleRuntimeV1 compatibility alias roughSurfaceId differs");
  }
  if (
    Object.hasOwn(course, "greenSurfaceId") &&
    course.greenSurfaceId !== green[0].id
  ) {
    throw new RangeError("LabHoleRuntimeV1 compatibility alias greenSurfaceId differs");
  }
  if (Object.hasOwn(course, "fairwaySurfaceIds")) {
    const fairwayIds = fairways.map(({ id }) => id);
    if (
      !Array.isArray(course.fairwaySurfaceIds) ||
      course.fairwaySurfaceIds.length !== fairwayIds.length ||
      course.fairwaySurfaceIds.some((id, index) => id !== fairwayIds[index])
    ) {
      throw new RangeError("LabHoleRuntimeV1 compatibility alias fairwaySurfaceIds differs");
    }
  }
  if (Object.hasOwn(course, "bunkerSurfacePrefix")) {
    const expectedBunkerIds = bunkers.map((_, index) =>
      `${course.bunkerSurfacePrefix}-${index + 1}`
    );
    if (bunkers.some(({ id }, index) => id !== expectedBunkerIds[index])) {
      throw new RangeError("LabHoleRuntimeV1 compatibility alias bunkerSurfacePrefix differs");
    }
  }
  if (
    Object.hasOwn(course, "waterSurfaceId") &&
    course.waterSurfaceId !== (water[0]?.id ?? null)
  ) {
    throw new RangeError("LabHoleRuntimeV1 compatibility alias waterSurfaceId differs");
  }
  if (
    Object.hasOwn(course, "waterBodyId") &&
    course.waterBodyId !== (geometry.waterBodies[0]?.id ?? null)
  ) {
    throw new RangeError("LabHoleRuntimeV1 compatibility alias waterBodyId differs");
  }
  if (Object.hasOwn(course, "barrier")) {
    const firstBarrier = geometry.barriers[0] ?? null;
    if ((course.barrier === null) !== (firstBarrier === null)) {
      throw new RangeError("LabHoleRuntimeV1 compatibility alias barrier differs");
    }
    if (course.barrier && firstBarrier) {
      for (const key of [
        "id",
        "kind",
        "heightMeters",
        "baseLevelMeters",
        "thicknessMeters",
        "normalRestitution",
        "tangentialRetention",
      ]) {
        if (course.barrier[key] !== firstBarrier[key]) {
          throw new RangeError("LabHoleRuntimeV1 compatibility alias barrier differs");
        }
      }
    }
  }
  if (!pointsEqual2(rough[0].points, world.roughPoints)) {
    throw new RangeError("LabHoleRuntimeV1 rough surface differs from world");
  }
  if (!pointsEqual2(green[0].points, world.greenPoints)) {
    throw new RangeError("LabHoleRuntimeV1 green surface differs from world");
  }
  for (const [surfaces, worldSurfaces, label] of [
    [fairways, world.fairwayPoints, "fairway"],
    [bunkers, world.bunkerPoints, "bunker"],
  ]) {
    if (
      !Array.isArray(worldSurfaces) ||
      surfaces.length !== worldSurfaces.length ||
      surfaces.some((surface, index) =>
        !pointsEqual2(surface.points, worldSurfaces[index])
      )
    ) {
      throw new RangeError(`LabHoleRuntimeV1 ${label} surfaces differ from world`);
    }
  }
  const worldWaterGroups = assertArray(
    world.waterSurfaceGroups,
    "LabHoleRuntimeV1.world.waterSurfaceGroups",
  );
  const legacyWorldWater = assertArray(
    world.waterSurfacePoints,
    "LabHoleRuntimeV1.world.waterSurfacePoints",
  );
  if (
    water.length !== worldWaterGroups.length ||
    water.some((surface, index) =>
      !pointsEqual2(surface.points, worldWaterGroups[index]))
  ) {
    throw new RangeError("LabHoleRuntimeV1 water surfaces differ from world");
  }
  const worldBunkers = assertArray(world.bunkers, "LabHoleRuntimeV1.world.bunkers");
  if (worldBunkers.length !== geometry.bunkerFeatures.length) {
    throw new RangeError("LabHoleRuntimeV1 bunker features differ from world");
  }
  worldBunkers.forEach((worldBunker, index) => {
    const feature = geometry.bunkerFeatures[index];
    for (const key of [
      "x",
      "z",
      "radiusX",
      "radiusZ",
      "rotation",
      "shapeSeed",
      "floorRadius",
      "depthMeters",
      "rimHeightMeters",
      "style",
    ]) {
      if (feature[key] !== worldBunker[key]) {
        throw new RangeError(`LabHoleRuntimeV1 bunker feature ${index} differs at ${key}`);
      }
    }
  });
  const worldWaterLevels = assertArray(
    world.waterLevels,
    "LabHoleRuntimeV1.world.waterLevels",
  );
  const firstWorldWater = worldWaterGroups[0] ?? [];
  if (
    !pointsEqual2(legacyWorldWater, firstWorldWater) ||
    (worldWaterLevels.length > 0 && world.waterLevel !== worldWaterLevels[0])
  ) {
    throw new RangeError("LabHoleRuntimeV1 legacy water alias differs from world");
  }
  if (
    geometry.waterBodies.length !== water.length ||
    worldWaterLevels.length !== water.length ||
    geometry.waterBodies.some((body, index) =>
      body.surfaceId !== water[index].id ||
      body.levelMeters !== worldWaterLevels[index])
  ) {
    throw new RangeError("LabHoleRuntimeV1 water levels differ from world");
  }
  const worldBarrierGroups = assertArray(
    world.barrierPointGroups,
    "LabHoleRuntimeV1.world.barrierPointGroups",
  );
  const legacyWorldWalls = assertArray(
    world.wallPoints,
    "LabHoleRuntimeV1.world.wallPoints",
  );
  if (!pointsEqual2(legacyWorldWalls, worldBarrierGroups[0] ?? [])) {
    throw new RangeError("LabHoleRuntimeV1 legacy barrier alias differs from world");
  }
  if (
    geometry.barriers.length !== worldBarrierGroups.length ||
    geometry.barriers.some((barrier, index) =>
      !pointsEqual2(barrier.points, worldBarrierGroups[index]))
  ) {
    throw new RangeError("LabHoleRuntimeV1 barriers differ from world");
  }
  if (
    presentation.palette !== world.palette ||
    presentation.cameras.overview !== world.overviewCamera ||
    presentation.cameras.greenDetail !== world.greenDetailCamera ||
    presentation.treePositions !== world.treePositions ||
    presentation.strategyPaths !== world.strategyPaths ||
    presentation.stripe.startZ !== world.stripeStartZ ||
    presentation.stripe.endZ !== world.stripeEndZ
  ) {
    throw new RangeError("LabHoleRuntimeV1 presentation view differs from world");
  }
};

const assertLabHoleRuntimeV1Shape = (course) => {
  assertObject(course, "LabHoleRuntimeV1");
  if (course.schemaVersion !== LAB_HOLE_RUNTIME_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported LabHoleRuntimeV1 schemaVersion: ${course.schemaVersion}`);
  }
  assertString(course.contentRevision, "LabHoleRuntimeV1.contentRevision");
  const coordinateSystem = assertObject(
    course.coordinateSystem,
    "LabHoleRuntimeV1.coordinateSystem",
  );
  for (const [key, expected] of Object.entries(LAB_HOLE_RUNTIME_COORDINATE_SYSTEM)) {
    if (coordinateSystem[key] !== expected) {
      throw new RangeError("LabHoleRuntimeV1 must use the lab coordinate system");
    }
  }
  const identity = assertObject(course.identity, "LabHoleRuntimeV1.identity");
  for (const key of ["id", "layoutId", "scenarioId", "holeLabel", "label"]) {
    assertString(identity[key], `LabHoleRuntimeV1.identity.${key}`);
  }
  assertGameplay(course.gameplay);
  const compatibilityAliases = [
    ["id", identity.id],
    ["layoutId", identity.layoutId],
    ["scenarioId", identity.scenarioId],
    ["holeLabel", identity.holeLabel],
    ["label", identity.label],
    ["par", course.gameplay.par],
    ["openingClub", course.gameplay.openingClub],
    ["courseArchetype", course.gameplay.courseArchetype],
    ["physicsVersion", course.gameplay.physicsVersion],
    ["terrainVersion", course.gameplay.terrainVersion],
    ["roundSeed", course.gameplay.roundSeed],
    ["wind", course.gameplay.wind],
    ["aim", course.gameplay.aim],
    ["layoutPresentation", course.presentation?.theme],
  ];
  for (const [key, expected] of compatibilityAliases) {
    if (Object.hasOwn(course, key) && course[key] !== expected) {
      throw new RangeError(`LabHoleRuntimeV1 compatibility alias ${key} differs`);
    }
  }
  assertGeometry(course);
  assertPresentation(course.presentation, course.geometry.bounds);
  assertWorldMapping(course);
  return true;
};

const deepFreeze = (value, seen = new WeakSet()) => {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function") ||
    seen.has(value)
  ) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
};

const assertDeepFrozen = (value, label = "LabHoleRuntimeV1", seen = new WeakSet()) => {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function") ||
    seen.has(value)
  ) return;
  seen.add(value);
  if (!Object.isFrozen(value)) {
    throw new TypeError(`${label} must be recursively frozen`);
  }
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, `${label}.${key}`, seen);
  }
};

export function assertLabHoleRuntimeV1(runtime) {
  assertLabHoleRuntimeV1Shape(runtime);
  assertDeepFrozen(runtime);
  return true;
}

export function defineLabHoleRuntimeV1(runtime) {
  assertLabHoleRuntimeV1Shape(runtime);
  const frozen = deepFreeze(runtime);
  assertLabHoleRuntimeV1(frozen);
  return frozen;
}
