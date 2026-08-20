export type TerrainPoint = Readonly<{
  x: number;
  z: number;
}>;

export type TerrainSample = Readonly<{
  heightMeters: number;
  gradient: TerrainPoint;
  normal: Readonly<{ x: number; y: number; z: number }>;
  downhillAcceleration: TerrainPoint;
  grade: number;
}>;

const ROLLING_GRAVITY = 9.80665 * (5 / 7);
const DIFFERENCE_STEP_METERS = 0.025;

export function terrainSampler(
  heightAt: (point: TerrainPoint) => number,
) {
  return (point: TerrainPoint): TerrainSample => {
    const heightMeters = heightAt(point);
    const step = DIFFERENCE_STEP_METERS;
    const gradient = Object.freeze({
      x:
        (heightAt({ x: point.x + step, z: point.z }) -
          heightAt({ x: point.x - step, z: point.z })) /
        (step * 2),
      z:
        (heightAt({ x: point.x, z: point.z + step }) -
          heightAt({ x: point.x, z: point.z - step })) /
        (step * 2),
    });
    const normalLength = Math.hypot(gradient.x, 1, gradient.z);
    const metric = 1 + gradient.x ** 2 + gradient.z ** 2;
    return Object.freeze({
      heightMeters,
      gradient,
      normal: Object.freeze({
        x: -gradient.x / normalLength,
        y: 1 / normalLength,
        z: -gradient.z / normalLength,
      }),
      downhillAcceleration: Object.freeze({
        x: (-gradient.x * ROLLING_GRAVITY) / metric,
        z: (-gradient.z * ROLLING_GRAVITY) / metric,
      }),
      grade: Math.hypot(gradient.x, gradient.z),
    });
  };
}
