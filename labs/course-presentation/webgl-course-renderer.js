import {
  WEBGL_MAX_PREPARED_WORLDS,
  createPreparedWebglCourseArtService,
  webglCourseArtIdentity,
  webglCourseArtKey,
} from "./webgl-course-art.js";
import { WEBGL_GROUND_ART_VERSION } from "./webgl-terrain-materials.js";
import { createFescueClusterVertices } from "./webgl-rough-vegetation.js";

export const VEGETATION_NEAR_CAMERA_DEPTH_METERS = 5;
export const WEBGL_MAX_RESIDENT_WORLDS = 2;
export const WEBGL_MAX_RESIDENT_BYTES = 4 * 1_024 * 1_024;
export const WEBGL_MAX_PENDING_WORLDS = WEBGL_MAX_PREPARED_WORLDS;
const PRESENTATION_LAYERS = Object.freeze(["embedded", "external"]);

const rendererError = (code, message) => {
  const error = new Error(message);
  error.name = "WebglCourseRendererError";
  error.code = code;
  return error;
};

const preparationCapacityError = () => {
  const error = new Error("WebGL geometry preparation queue is full");
  error.name = "RendererPreparationCapacityError";
  error.code = "WEBGL_PREPARATION_QUEUE_FULL";
  return error;
};

const assertCallback = (callback, name) => {
  if (typeof callback !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
};

const positiveDimension = (value, name, { integer = false } = {}) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer`);
  }
  return value;
};

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const normalize = (vector) => {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
};

const subtract = (left, right) => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});

const cross = (left, right) => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});

const dot = (left, right) =>
  left.x * right.x + left.y * right.y + left.z * right.z;

export function shouldRenderVegetationInstance(camera, instancePosition) {
  const cameraForward = normalize(subtract(camera.target, camera.position));
  const cameraToInstance = subtract(instancePosition, camera.position);
  return dot(cameraToInstance, cameraForward) >=
    VEGETATION_NEAR_CAMERA_DEPTH_METERS;
}

const color = (value) => {
  const hex = value.replace("#", "");
  const expanded = hex.length === 3
    ? hex.split("").map((part) => `${part}${part}`).join("")
    : hex;
  return [
    Number.parseInt(expanded.slice(0, 2), 16) / 255,
    Number.parseInt(expanded.slice(2, 4), 16) / 255,
    Number.parseInt(expanded.slice(4, 6), 16) / 255,
    1,
  ];
};

const colorTriplet = (value) => color(value).slice(0, 3);

const terrainPaletteFor = (world) => Object.freeze({
  rough: new Float32Array([
    ...colorTriplet(world.palette.roughTop),
    ...colorTriplet(world.palette.roughMiddle),
    ...colorTriplet(world.palette.roughBottom),
  ]),
  fairway: new Float32Array([
    ...colorTriplet(world.palette.fairwayTop),
    ...colorTriplet(world.palette.fairwayMiddle),
    ...colorTriplet(world.palette.fairwayBottom),
  ]),
  green: new Float32Array([
    ...colorTriplet(world.palette.greenTop),
    ...colorTriplet(world.palette.greenMiddle),
    ...colorTriplet(world.palette.greenBottom),
  ]),
  sand: new Float32Array([
    ...colorTriplet("#f0dfb2"),
    ...colorTriplet("#a98d59"),
  ]),
  water: new Float32Array([
    ...colorTriplet("#4d7d7f"),
    ...colorTriplet("#173e44"),
  ]),
});

const perspective = (fieldOfViewRadians, aspect, near, far) => {
  const f = 1 / Math.tan(fieldOfViewRadians / 2);
  const rangeInverse = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInverse, -1,
    0, 0, near * far * rangeInverse * 2, 0,
  ]);
};

const lookAt = (eye, target, rollRadians = 0) => {
  const zAxis = normalize(subtract(eye, target));
  let xAxis = normalize(cross({ x: 0, y: 1, z: 0 }, zAxis));
  let yAxis = normalize(cross(zAxis, xAxis));
  if (rollRadians !== 0) {
    const cosine = Math.cos(rollRadians);
    const sine = Math.sin(rollRadians);
    const rolledX = {
      x: xAxis.x * cosine - yAxis.x * sine,
      y: xAxis.y * cosine - yAxis.y * sine,
      z: xAxis.z * cosine - yAxis.z * sine,
    };
    yAxis = {
      x: yAxis.x * cosine + xAxis.x * sine,
      y: yAxis.y * cosine + xAxis.y * sine,
      z: yAxis.z * cosine + xAxis.z * sine,
    };
    xAxis = rolledX;
  }
  return new Float32Array([
    xAxis.x, yAxis.x, zAxis.x, 0,
    xAxis.y, yAxis.y, zAxis.y, 0,
    xAxis.z, yAxis.z, zAxis.z, 0,
    -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1,
  ]);
};

const multiply = (left, right) => {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      result[column * 4 + row] =
        left[row] * right[column * 4] +
        left[4 + row] * right[column * 4 + 1] +
        left[8 + row] * right[column * 4 + 2] +
        left[12 + row] * right[column * 4 + 3];
    }
  }
  return result;
};

const cameraMatrix = (camera, width, height) => {
  const projection = perspective(
    (camera.fovDegrees * Math.PI) / 180,
    width / height,
    0.1,
    1_200,
  );
  projection[8] -= (camera.focalShiftX ?? 0) * 2;
  projection[9] += (camera.focalShiftY ?? 0) * 2;
  return multiply(
    projection,
    lookAt(
      camera.position,
      camera.target,
      ((camera.rollDegrees ?? 0) * Math.PI) / 180,
    ),
  );
};

export function projectWebglCoursePoint(camera, width, height, worldPoint) {
  positiveDimension(width, "width");
  positiveDimension(height, "height");
  const matrix = cameraMatrix(camera, width, height);
  const { x, y, z } = worldPoint;
  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (clipW <= 0.45) return null;
  return Object.freeze({
    x: width * (0.5 + clipX / clipW / 2),
    y: height * (0.5 - clipY / clipW / 2),
    depth: clipW,
    scale:
      height /
      (2 * Math.tan((camera.fovDegrees * Math.PI) / 360)) /
      clipW,
  });
}

const createShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compilation failed: ${error}`);
  }
  return shader;
};

const createProgram = (gl, vertexSource, fragmentSource) => {
  const program = gl.createProgram();
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGL program linking failed: ${error}`);
  }
  return program;
};

const createTerrainMesh = (gl, geometry) => {
  const vertexArray = gl.createVertexArray();
  const buffers = [];
  try {
    gl.bindVertexArray(vertexArray);
    const positionBuffer = gl.createBuffer();
    buffers.push(positionBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const normalBuffer = gl.createBuffer();
    buffers.push(normalBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    const materialBuffer = gl.createBuffer();
    buffers.push(materialBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, materialBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.materials, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.UNSIGNED_BYTE, false, 0, 0);
    const indexBuffer = gl.createBuffer();
    buffers.push(indexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return {
      vertexArray,
      buffers: Object.freeze(buffers),
      indexCount: geometry.indices.length,
      gridIndexCount: geometry.gridTriangleCount * 3,
      surfaceIndexCount: geometry.surfaceTriangleCount * 3,
      surfaceBatches: Object.freeze(geometry.surfaceBatches.map((batch) =>
        Object.freeze({
          ...batch,
          byteOffset: batch.firstIndex * Uint32Array.BYTES_PER_ELEMENT,
        })
      )),
      gridTriangleCount: geometry.gridTriangleCount,
      coarseGridTriangleCount: geometry.coarseGridTriangleCount,
      surfaceTriangleCount: geometry.surfaceTriangleCount,
      bunkerArtVersion: geometry.bunkerArtVersion,
      bunkerPatchCount: geometry.bunkerPatchCount,
      bunkerCollarTriangleCount: geometry.bunkerCollarTriangleCount,
      bunkerReliefTriangleCount: geometry.bunkerReliefTriangleCount,
      watercourseArtVersion: geometry.watercourseArtVersion,
      waterShorelineVertexCount: geometry.waterShorelineVertexCount,
      waterShorelineTriangleCount: geometry.waterShorelineTriangleCount,
      waterShorelineByteLength: geometry.waterShorelineByteLength,
      bytes:
        geometry.positions.byteLength +
        geometry.normals.byteLength +
        geometry.materials.byteLength +
        geometry.indices.byteLength,
    };
  } catch (cause) {
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    gl.deleteVertexArray(vertexArray);
    throw cause;
  }
};

const createVegetationMesh = (gl, instances) => {
  const blade = createFescueClusterVertices();
  const vertexArray = gl.createVertexArray();
  const buffers = [];
  try {
    gl.bindVertexArray(vertexArray);
    const bladeBuffer = gl.createBuffer();
    buffers.push(bladeBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, bladeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, blade, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const instanceBuffer = gl.createBuffer();
    buffers.push(instanceBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, instances, gl.STATIC_DRAW);
    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(
      3,
      3,
      gl.FLOAT,
      false,
      stride,
      3 * Float32Array.BYTES_PER_ELEMENT,
    );
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
    return {
      vertexArray,
      buffers: Object.freeze(buffers),
      vertexCount: blade.length / 3,
      instanceCount: instances.length / 6,
      bytes: blade.byteLength + instances.byteLength,
    };
  } catch (cause) {
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    gl.deleteVertexArray(vertexArray);
    throw cause;
  }
};

const createDynamicOverlayMesh = (gl) => {
  const vertexArray = gl.createVertexArray();
  gl.bindVertexArray(vertexArray);
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return Object.freeze({
    vertexArray,
    positionBuffer,
    colorBuffer,
    buffers: Object.freeze([positionBuffer, colorBuffer]),
  });
};

const disposeMesh = (gl, mesh) => {
  for (const buffer of mesh.buffers) gl.deleteBuffer(buffer);
  gl.deleteVertexArray(mesh.vertexArray);
};

const createOverlayGeometry = (world, camera, ballPosition, showBall) => {
  const positions = [];
  const colors = [];
  const pin = world.pin;
  const baseY = world.greenElevationAt(pin.x, pin.z) + 0.012;
  const right = normalize({
    x: camera.position.z - pin.z,
    y: 0,
    z: pin.x - camera.position.x,
  });
  const width = 0.018;
  const topY = baseY + world.greenPresentation.flagstickHeight;
  const leftX = pin.x - right.x * width;
  const leftZ = pin.z - right.z * width;
  const rightX = pin.x + right.x * width;
  const rightZ = pin.z + right.z * width;
  positions.push(
    leftX, baseY, leftZ,
    rightX, baseY, rightZ,
    leftX, topY, leftZ,
    leftX, topY, leftZ,
    rightX, baseY, rightZ,
    rightX, topY, rightZ,
  );
  for (let index = 0; index < 6; index += 1) colors.push(0.94, 0.9, 0.72, 1);
  const flagEnd = {
    x: pin.x + right.x * world.greenPresentation.flagWidth,
    z: pin.z + right.z * world.greenPresentation.flagWidth,
  };
  positions.push(
    pin.x, topY, pin.z,
    flagEnd.x, topY - world.greenPresentation.flagHeight * 0.42, flagEnd.z,
    pin.x, topY - world.greenPresentation.flagHeight, pin.z,
  );
  for (let index = 0; index < 3; index += 1) colors.push(0.95, 0.69, 0.24, 1);
  if (showBall && ballPosition) {
    const y = world.surfaceElevationAt(ballPosition.x, ballPosition.z) + ballPosition.y;
    const radius = 0.13;
    positions.push(
      ballPosition.x - right.x * radius, y, ballPosition.z - right.z * radius,
      ballPosition.x + right.x * radius, y, ballPosition.z + right.z * radius,
      ballPosition.x, y + radius * 2, ballPosition.z,
    );
    for (let index = 0; index < 3; index += 1) colors.push(0.96, 0.97, 0.94, 1);
  }
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    vertexCount: positions.length / 3,
  };
};

export function createWebglCourseRenderer(canvas, {
  preserveDrawingBuffer = true,
  presentationLayer = "embedded",
  onContextLost = () => {},
  onContextRestored = () => {},
  courseArtService = createPreparedWebglCourseArtService(),
  yieldToMainThread = () => new Promise((resolve) => setTimeout(resolve, 0)),
} = {}) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new TypeError("canvas must provide getContext");
  }
  if (!PRESENTATION_LAYERS.includes(presentationLayer)) {
    throw new RangeError(`Unknown presentation layer: ${presentationLayer}`);
  }
  if (typeof preserveDrawingBuffer !== "boolean") {
    throw new TypeError("preserveDrawingBuffer must be a boolean");
  }
  assertCallback(onContextLost, "onContextLost");
  assertCallback(onContextRestored, "onContextRestored");
  assertCallback(yieldToMainThread, "yieldToMainThread");
  if (
    !courseArtService ||
    typeof courseArtService.prepare !== "function" ||
    typeof courseArtService.status !== "function" ||
    typeof courseArtService.dispose !== "function"
  ) {
    throw new TypeError("courseArtService must implement prepare/status/dispose");
  }
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    depth: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer,
  });
  if (!gl) {
    throw new Error("WebGL2 is unavailable");
  }

  const skyProgram = createProgram(gl, `#version 300 es
    void main() {
      vec2 positions[3] = vec2[3](vec2(-1., -1.), vec2(3., -1.), vec2(-1., 3.));
      gl_Position = vec4(positions[gl_VertexID], 0., 1.);
    }
  `, `#version 300 es
    precision highp float;
    uniform vec3 uSkyTop;
    uniform vec3 uSkyHorizon;
    uniform vec2 uResolution;
    out vec4 outColor;
    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution;
      float heightMix = smoothstep(0., 1., uv.y);
      vec3 sky = mix(uSkyHorizon, uSkyTop, heightMix);
      float glow = exp(-pow((uv.x - .78) / .32, 2.) - pow((uv.y - .77) / .22, 2.));
      outColor = vec4(sky + vec3(.12, .095, .045) * glow, 1.);
    }
  `);
  const terrainProgram = createProgram(gl, `#version 300 es
    layout(location=0) in vec3 aPosition;
    layout(location=1) in vec3 aNormal;
    layout(location=4) in float aMaterial;
    uniform mat4 uViewProjection;
    uniform vec3 uCamera;
    out vec3 vWorldPosition;
    out vec3 vNormal;
    flat out int vMaterial;
    out float vReliefVisibility;
    out float vDistance;
    void main() {
      gl_Position = uViewProjection * vec4(aPosition, 1.);
      vWorldPosition = aPosition;
      vNormal = aNormal;
      int packedMaterial = int(aMaterial + .5);
      vMaterial = packedMaterial & 7;
      vReliefVisibility = float(packedMaterial >> 3) / 31.;
      vDistance = distance(aPosition, uCamera);
    }
  `, `#version 300 es
    precision highp float;
    in vec3 vWorldPosition;
    in vec3 vNormal;
    flat in int vMaterial;
    in float vReliefVisibility;
    in float vDistance;
    uniform vec3 uFogColor;
    uniform vec3 uRough[3];
    uniform vec3 uFairway[3];
    uniform vec3 uGreen[3];
    uniform vec3 uSand[2];
    uniform vec3 uWater[2];
    uniform float uEnvironmentSeconds;
    out vec4 outColor;

    float grain(vec2 point) {
      float broad = sin(point.x * 1.37 + point.y * .83) * .32;
      float crossed = sin(point.x * .41 - point.y * 1.91) * .18;
      return broad + crossed;
    }

    float cellHash(vec2 cell) {
      vec3 point = fract(vec3(cell.xyx) * vec3(.1031, .103, .0973));
      point += dot(point, point.yzx + 33.33);
      return fract((point.x + point.y) * point.z);
    }

    float valueNoise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = fract(point);
      vec2 blend = local * local * (3. - 2. * local);
      float lower = mix(
        cellHash(cell),
        cellHash(cell + vec2(1., 0.)),
        blend.x
      );
      float upper = mix(
        cellHash(cell + vec2(0., 1.)),
        cellHash(cell + vec2(1., 1.)),
        blend.x
      );
      return mix(lower, upper, blend.y) * 2. - 1.;
    }

    float turfVariation(vec2 point) {
      float broad = valueNoise(point * .026);
      vec2 rotated = mat2(.8, -.6, .6, .8) * point;
      float detail = valueNoise(rotated * .057 + vec2(11.7, -23.1));
      float detailVisibility = 1. - smoothstep(180., 420., vDistance);
      return broad * .72 + detail * .28 * detailVisibility;
    }

    float waterMotion(vec2 point) {
      vec2 firstDirection = normalize(vec2(.88, .47));
      vec2 secondDirection = normalize(vec2(-.53, .85));
      float firstWave = valueNoise(
        point * .058 + firstDirection * uEnvironmentSeconds * .018
      );
      vec2 secondPoint = mat2(.76, -.65, .65, .76) * point;
      float secondWave = valueNoise(
        secondPoint * .094 +
        secondDirection * uEnvironmentSeconds * .015 +
        vec2(13.7, -6.4)
      );
      vec2 detailPoint = mat2(.6, .8, -.8, .6) * point;
      float softDetail = valueNoise(
        detailPoint * .17 +
        (firstDirection * .009 + secondDirection * .006) *
          uEnvironmentSeconds +
        vec2(-5.2, 9.1)
      );
      return firstWave * .4 + secondWave * .38 + softDetail * .22;
    }

    vec3 surfaceColor(int material) {
      float variation = turfVariation(vWorldPosition.xz);
      if (material == 0) {
        float tone = clamp(.48 + variation * .11, 0., 1.);
        return mix(uRough[2], uRough[0], tone);
      }
      if (material == 1) {
        float tone = clamp(.56 + variation * .055, 0., 1.);
        return mix(uFairway[2], uFairway[0], tone);
      }
      if (material == 2) {
        float tone = clamp(.62 + variation * .03, 0., 1.);
        return mix(uGreen[2], uGreen[0], tone);
      }
      if (material == 3 || material == 5) {
        float sandGrain = grain(vWorldPosition.xz);
        return mix(uSand[1], uSand[0], clamp(.58 + sandGrain * .24, 0., 1.));
      }
      float motion = waterMotion(vWorldPosition.xz);
      if (material == 4) {
        return mix(
          uWater[1],
          uWater[0],
          clamp(.47 + motion * .11, 0., 1.)
        );
      }
      float shorelineNoise = valueNoise(
        vWorldPosition.xz * .14 + vec2(7.1, -4.3)
      );
      vec3 wetBank = mix(
        uRough[2],
        uSand[1],
        clamp(.46 + shorelineNoise * .10, 0., 1.)
      );
      vec3 edgeWater = mix(
        wetBank,
        mix(
          uWater[1],
          uWater[0],
          clamp(.43 + motion * .025, 0., 1.)
        ),
        .12
      );
      return mix(edgeWater, wetBank, .78);
    }

    void main() {
      int material = vMaterial;
      vec3 normal = normalize(vNormal);
      vec3 sunDirection = normalize(vec3(-.42, .82, -.38));
      float diffuse = max(0., dot(normal, sunDirection));
      float opposite = max(0., dot(normal, -sunDirection));
      float light = .67 + diffuse * .47 + opposite * .035;
      if (material >= 0 && material <= 2) {
        float turfRelief = smoothstep(.67, .91, diffuse);
        float distanceCalm = mix(1., .72, smoothstep(260., 610., vDistance));
        light = 1. + (mix(.78, 1.12, turfRelief) - 1.) * distanceCalm;
        float coarseRelief = mix(.9, 1.08, vReliefVisibility);
        light *= mix(1., coarseRelief, distanceCalm);
      }
      vec3 shaded = surfaceColor(material) * light;
      if (material == 3 || material == 5) {
        float bank = smoothstep(.08, .58, 1. - clamp(normal.y, 0., 1.));
        float sandSparkle = .5 + .5 * sin(
          vWorldPosition.x * 2.3 - vWorldPosition.z * 1.7
        );
        shaded += vec3(.035, .028, .016) * sandSparkle * (1. - bank);
        shaded *= 1. - bank * .12;
        if (material == 5) {
          float revetment = smoothstep(.35, .78, .5 + .5 * sin(
            vWorldPosition.y * 18. + vWorldPosition.x * .21
          ));
          vec3 turfCourse = vec3(.26, .205, .12);
          shaded = mix(shaded, turfCourse * light, bank * (.2 + revetment * .34));
        }
      }
      if (material == 4) {
        float highlight = pow(max(0., dot(normal, normalize(vec3(.2, 1., -.3)))), 18.);
        shaded += vec3(.19, .22, .17) * highlight;
      }
      float fog = smoothstep(250., 610., vDistance);
      outColor = vec4(mix(shaded, uFogColor, fog * .58), 1.);
    }
  `);
  const vegetationProgram = createProgram(gl, `#version 300 es
    layout(location=0) in vec3 aBlade;
    layout(location=2) in vec3 aOffset;
    layout(location=3) in vec3 aScalePhaseTint;
    const float NEAR_VEGETATION_DEPTH = ${VEGETATION_NEAR_CAMERA_DEPTH_METERS.toFixed(1)};
    uniform mat4 uViewProjection;
    uniform vec2 uWindDirection;
    uniform float uWindStrength;
    uniform float uEnvironmentSeconds;
    uniform float uMotionScale;
    uniform vec3 uFogColor;
    out float vHeight;
    out float vTint;
    out float vDistanceFade;
    out vec3 vWorldPosition;
    void main() {
      vec4 instanceClip = uViewProjection * vec4(aOffset, 1.);
      if (instanceClip.w < NEAR_VEGETATION_DEPTH) {
        gl_Position = vec4(2., 2., 2., 1.);
        vHeight = 0.;
        vTint = 0.;
        vDistanceFade = 1.;
        vWorldPosition = aOffset;
        return;
      }
      float height = aBlade.y;
      float primary = sin(
        uEnvironmentSeconds * 1.47 + aScalePhaseTint.y + aOffset.x * .033 + aOffset.z * .018
      );
      float gust = sin(
        uEnvironmentSeconds * .41 + aScalePhaseTint.y * 1.7 + aOffset.x * .011 - aOffset.z * .007
      );
      float flutter = sin(
        uEnvironmentSeconds * 2.23 + aScalePhaseTint.y * .63 - aOffset.x * .019 + aOffset.z * .024
      );
      float stiffness = .68 + fract(
        aScalePhaseTint.z * 7.13 + aScalePhaseTint.y * .17
      ) * .32;
      float wave = (primary * .62 + gust * .28 + flutter * .1) * stiffness;
      float distanceFade = 1. - smoothstep(150., 360., instanceClip.w);
      float heightLod = smoothstep(.12, .55, distanceFade);
      vec2 bend = uWindDirection * wave * uWindStrength * uMotionScale *
        height * height * heightLod;
      float yaw = aScalePhaseTint.y * .79 + aScalePhaseTint.z * 4.17;
      float yawCos = cos(yaw);
      float yawSin = sin(yaw);
      vec2 rotatedBlade = mat2(yawCos, -yawSin, yawSin, yawCos) * aBlade.xz;
      vec3 local = vec3(
        rotatedBlade.x * aScalePhaseTint.x * heightLod,
        aBlade.y * aScalePhaseTint.x * heightLod,
        rotatedBlade.y * aScalePhaseTint.x * heightLod
      );
      vec3 position = aOffset + local + vec3(bend.x, 0., bend.y);
      gl_Position = uViewProjection * vec4(position, 1.);
      vHeight = height;
      vTint = aScalePhaseTint.z;
      vDistanceFade = distanceFade;
      vWorldPosition = position;
    }
  `, `#version 300 es
    precision highp float;
    in float vHeight;
    in float vTint;
    in float vDistanceFade;
    in vec3 vWorldPosition;
    uniform vec3 uFogColor;
    out vec4 outColor;
    void main() {
      vec3 bottom = vec3(.34, .37, .19);
      vec3 top = vec3(.72, .65, .34) * vTint;
      vec3 blade = mix(bottom, top, smoothstep(0., 1., vHeight));
      vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
      float twoSidedLight = .86 + .14 * abs(dot(
        normal,
        normalize(vec3(.28, .91, -.3))
      ));
      vec3 colored = mix(bottom, blade, .45 + vDistanceFade * .55) * twoSidedLight;
      float fog = 1. - vDistanceFade;
      outColor = vec4(mix(colored, uFogColor, fog * .96), 1.);
    }
  `);
  const overlayProgram = presentationLayer === "embedded"
    ? createProgram(gl, `#version 300 es
      layout(location=0) in vec3 aPosition;
      layout(location=1) in vec4 aColor;
      uniform mat4 uViewProjection;
      out vec4 vColor;
      void main() {
        gl_Position = uViewProjection * vec4(aPosition, 1.);
        vColor = aColor;
      }
    `, `#version 300 es
      precision highp float;
      in vec4 vColor;
      out vec4 outColor;
      void main() {
        outColor = vColor;
      }
    `)
    : null;

  const uniforms = Object.freeze({
    sky: Object.freeze({
      top: gl.getUniformLocation(skyProgram, "uSkyTop"),
      horizon: gl.getUniformLocation(skyProgram, "uSkyHorizon"),
      resolution: gl.getUniformLocation(skyProgram, "uResolution"),
    }),
    terrain: Object.freeze({
      viewProjection: gl.getUniformLocation(terrainProgram, "uViewProjection"),
      camera: gl.getUniformLocation(terrainProgram, "uCamera"),
      fogColor: gl.getUniformLocation(terrainProgram, "uFogColor"),
      rough: gl.getUniformLocation(terrainProgram, "uRough[0]"),
      fairway: gl.getUniformLocation(terrainProgram, "uFairway[0]"),
      green: gl.getUniformLocation(terrainProgram, "uGreen[0]"),
      sand: gl.getUniformLocation(terrainProgram, "uSand[0]"),
      water: gl.getUniformLocation(terrainProgram, "uWater[0]"),
      environmentSeconds: gl.getUniformLocation(
        terrainProgram,
        "uEnvironmentSeconds",
      ),
    }),
    vegetation: Object.freeze({
      viewProjection: gl.getUniformLocation(
        vegetationProgram,
        "uViewProjection",
      ),
      windDirection: gl.getUniformLocation(
        vegetationProgram,
        "uWindDirection",
      ),
      windStrength: gl.getUniformLocation(vegetationProgram, "uWindStrength"),
      environmentSeconds: gl.getUniformLocation(
        vegetationProgram,
        "uEnvironmentSeconds",
      ),
      motionScale: gl.getUniformLocation(vegetationProgram, "uMotionScale"),
      fogColor: gl.getUniformLocation(vegetationProgram, "uFogColor"),
    }),
    overlay: overlayProgram
      ? Object.freeze({
        viewProjection: gl.getUniformLocation(
          overlayProgram,
          "uViewProjection",
        ),
      })
      : null,
  });
  const cache = new Map();
  const pendingGeometry = new Map();
  const overlayMesh = presentationLayer === "embedded"
    ? createDynamicOverlayMesh(gl)
    : null;
  let contextLosses = 0;
  let contextLost = false;
  let restorationRequired = false;
  let disposed = false;
  let lastColdPreparationDurationMs = 0;

  const getStatus = () => Object.freeze({
    contextLosses,
    contextLost,
    restorationRequired,
    disposed,
  });

  const assertUsable = (operation) => {
    if (disposed) {
      throw rendererError(
        "WEBGL_RENDERER_DISPOSED",
        `Cannot ${operation}: WebGL renderer is disposed`,
      );
    }
    if (contextLost) {
      throw rendererError(
        "WEBGL_CONTEXT_LOST",
        `Cannot ${operation}: WebGL context is lost`,
      );
    }
    if (restorationRequired) {
      throw rendererError(
        "WEBGL_CONTEXT_RESTORATION_REQUIRED",
        `Cannot ${operation}: recreate the WebGL renderer after context restoration`,
      );
    }
  };

  const handleContextLost = (event) => {
    event.preventDefault();
    contextLosses += 1;
    contextLost = true;
    restorationRequired = true;
    cache.clear();
    for (const pending of pendingGeometry.values()) {
      pending.controller?.abort();
    }
    pendingGeometry.clear();
    onContextLost(getStatus());
  };
  const handleContextRestored = () => {
    contextLost = false;
    restorationRequired = true;
    onContextRestored(getStatus());
  };
  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);

  const disposeWorldGeometry = (geometry) => {
    disposeMesh(gl, geometry.terrain);
    disposeMesh(gl, geometry.vegetation);
  };

  const totalResidentGeometryBytes = () => [...cache.values()].reduce(
    (total, geometry) =>
      total + geometry.terrain.bytes + geometry.vegetation.bytes,
    0,
  );

  const getPreparationStatus = () => {
    const prepared = courseArtService.status();
    return Object.freeze({
      gpuResidentWorlds: cache.size,
      gpuResidentBytes: totalResidentGeometryBytes(),
      gpuPendingWorlds: pendingGeometry.size,
      cpuPreparedWorlds: prepared.residentWorlds,
      cpuPreparedBytes: prepared.residentBytes,
      cpuPendingWorlds: prepared.pendingWorlds,
    });
  };

  const sourceIdentity = (source) => {
    const identity = webglCourseArtIdentity(source);
    if (!source?.world || source.world.id !== identity.runtimeId) {
      throw new RangeError("WebGL art source world identity is invalid");
    }
    return identity;
  };

  const consumePreparation = (pending, signal) => {
    if (signal?.aborted) {
      const error = new Error("WebGL geometry preparation was aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    }
    pending.consumers += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      pending.consumers -= 1;
      if (pending.consumers === 0 && !pending.settled) {
        if (pendingGeometry.get(pending.key) === pending) {
          pendingGeometry.delete(pending.key);
        }
        pending.controller?.abort();
      }
    };
    if (!signal) return pending.request.finally(release);
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        release();
        const error = new Error("WebGL geometry preparation was aborted");
        error.name = "AbortError";
        reject(error);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      pending.request.then(resolve, reject).finally(() => {
        signal.removeEventListener("abort", onAbort);
        release();
      });
    });
  };

  const retainGeometry = (key, geometry) => {
    const geometryBytes = geometry.terrain.bytes + geometry.vegetation.bytes;
    if (geometryBytes > WEBGL_MAX_RESIDENT_BYTES) {
      disposeWorldGeometry(geometry);
      throw new RangeError("WebGL world geometry exceeds the GPU byte ceiling");
    }
    cache.set(key, geometry);
    while (
      cache.size > WEBGL_MAX_RESIDENT_WORLDS ||
      totalResidentGeometryBytes() > WEBGL_MAX_RESIDENT_BYTES
    ) {
      const oldestKey = cache.keys().next().value;
      const oldestGeometry = cache.get(oldestKey);
      cache.delete(oldestKey);
      disposeWorldGeometry(oldestGeometry);
    }
  };

  const prepare = (source, { signal } = {}) => {
    assertUsable("prepare");
    const identity = sourceIdentity(source);
    if (signal?.aborted) {
      const error = new Error("WebGL geometry preparation was aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    }
    const key = webglCourseArtKey(identity);
    const retained = cache.get(key);
    if (retained) {
      if (retained.world !== source.world) {
        throw new RangeError("WebGL prepared world reference is not authoritative");
      }
      cache.delete(key);
      cache.set(key, retained);
      const evidence = Object.freeze({
        ...retained.preparationEvidence,
        cpuCacheHit: null,
        gpuCacheHit: true,
        workerDurationMs: 0,
        workerObservedDurationMs: 0,
        totalDurationMs: 0,
        gpuUploadDurationMs: 0,
        maximumUploadStepDurationMs: 0,
      });
      return consumePreparation({
        consumers: 0,
        settled: true,
        request: Promise.resolve(evidence),
      }, signal);
    }
    const pending = pendingGeometry.get(key);
    if (pending && pending.world !== source.world) {
      throw new RangeError("Pending WebGL world reference is not authoritative");
    }
    let request = pending?.request;
    let pendingState = pending;
    if (!request) {
      if (pendingGeometry.size >= WEBGL_MAX_PENDING_WORLDS) {
        return Promise.reject(preparationCapacityError());
      }
      const startedAt = performance.now();
      const controller = new AbortController();
      pendingState = {
        key,
        world: source.world,
        consumers: 0,
        controller,
        request: null,
        settled: false,
      };
      request = Promise.resolve()
        .then(() => courseArtService.prepare(source, {
          signal: controller.signal,
        }))
        .then(async (preparedArt) => {
          const assertPreparationCurrent = () => {
            assertUsable("prepare");
            if (
              controller.signal.aborted ||
              pendingState.consumers === 0
            ) {
              const error = new Error("WebGL geometry preparation was aborted");
              error.name = "AbortError";
              throw error;
            }
          };
          assertPreparationCurrent();
          const workerObservedDurationMs = performance.now() - startedAt;
          await yieldToMainThread();
          assertPreparationCurrent();
          const terrainStartedAt = performance.now();
          const terrain = createTerrainMesh(gl, preparedArt.terrainGeometry);
          const terrainUploadDurationMs = performance.now() - terrainStartedAt;
          let vegetation;
          let vegetationUploadDurationMs = 0;
          try {
            await yieldToMainThread();
            assertPreparationCurrent();
            const vegetationStartedAt = performance.now();
            vegetation = createVegetationMesh(
              gl,
              preparedArt.vegetationInstances,
            );
            vegetationUploadDurationMs =
              performance.now() - vegetationStartedAt;
          } catch (cause) {
            disposeMesh(gl, terrain);
            throw cause;
          }
          assertPreparationCurrent();
          const evidence = Object.freeze({
            schemaVersion: 1,
            executionContext: preparedArt.executionContext,
            sourceKind: identity.sourceKind,
            packageId: identity.packageId,
            packageVersion: identity.packageVersion,
            runtimeId: identity.runtimeId,
            contentRevision: identity.contentRevision,
            groundArtVersion: identity.groundArtVersion,
            cpuCacheHit: preparedArt.cacheHit,
            gpuCacheHit: false,
            workerDurationMs: preparedArt.workerDurationMs,
            sourceWorkerDurationMs: preparedArt.sourceWorkerDurationMs,
            workerObservedDurationMs,
            gpuUploadDurationMs:
              terrainUploadDurationMs + vegetationUploadDurationMs,
            maximumUploadStepDurationMs: Math.max(
              terrainUploadDurationMs,
              vegetationUploadDurationMs,
            ),
            totalDurationMs: performance.now() - startedAt,
            preparedBytes:
              preparedArt.terrainGeometry.positions.byteLength +
              preparedArt.terrainGeometry.normals.byteLength +
              preparedArt.terrainGeometry.materials.byteLength +
              preparedArt.terrainGeometry.indices.byteLength +
              preparedArt.vegetationInstances.byteLength,
          });
          const geometry = Object.freeze({
            world: source.world,
            identity,
            terrain,
            vegetation,
            palette: terrainPaletteFor(source.world),
            preparationEvidence: evidence,
          });
          retainGeometry(key, geometry);
          if (!preparedArt.cacheHit) {
            lastColdPreparationDurationMs = evidence.totalDurationMs;
          }
          return evidence;
        })
        .finally(() => {
          pendingState.settled = true;
          if (pendingGeometry.get(key)?.request === request) {
            pendingGeometry.delete(key);
          }
        });
      pendingState.request = request;
      pendingGeometry.set(key, pendingState);
    }
    return consumePreparation(pendingState, signal);
  };

  const geometryFor = (source) => {
    const identity = sourceIdentity(source);
    const key = webglCourseArtKey(identity);
    const geometry = cache.get(key);
    if (!geometry || geometry.world !== source.world) {
      throw rendererError(
        "WEBGL_WORLD_NOT_PREPARED",
        `Cannot render unprepared WebGL world: ${identity.runtimeId}`,
      );
    }
    cache.delete(key);
    cache.set(key, geometry);
    return geometry;
  };

  const resize = ({
    backingWidth,
    backingHeight,
    cssWidth,
    cssHeight,
  }) => {
    assertUsable("resize");
    positiveDimension(backingWidth, "backingWidth", { integer: true });
    positiveDimension(backingHeight, "backingHeight", { integer: true });
    if (cssWidth !== undefined) positiveDimension(cssWidth, "cssWidth");
    if (cssHeight !== undefined) positiveDimension(cssHeight, "cssHeight");
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    if (cssWidth !== undefined && canvas.style.width !== `${cssWidth}px`) {
      canvas.style.width = `${cssWidth}px`;
    }
    if (cssHeight !== undefined && canvas.style.height !== `${cssHeight}px`) {
      canvas.style.height = `${cssHeight}px`;
    }
    return Object.freeze({
      backingWidth,
      backingHeight,
      cssWidth: cssWidth ?? canvas.clientWidth ?? backingWidth,
      cssHeight: cssHeight ?? canvas.clientHeight ?? backingHeight,
    });
  };

  const render = ({
    sourceKind,
    packageId,
    packageVersion,
    runtimeId,
    contentRevision,
    world,
    camera,
    environmentTimeMs = 0,
    ballPosition = null,
    showBall = true,
    reducedMotion = false,
    wind,
  }) => {
    assertUsable("render");
    const geometry = geometryFor({
      sourceKind,
      packageId,
      packageVersion,
      runtimeId,
      contentRevision,
      world,
    });
    const viewProjection = cameraMatrix(camera, canvas.width, canvas.height);
    const skyTop = color(world.palette.skyTop);
    const skyHorizon = color(world.palette.skyHorizon);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(skyProgram);
    gl.uniform3fv(uniforms.sky.top, skyTop.slice(0, 3));
    gl.uniform3fv(uniforms.sky.horizon, skyHorizon.slice(0, 3));
    gl.uniform2f(
      uniforms.sky.resolution,
      canvas.width,
      canvas.height,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.useProgram(terrainProgram);
    gl.uniformMatrix4fv(
      uniforms.terrain.viewProjection,
      false,
      viewProjection,
    );
    gl.uniform3f(
      uniforms.terrain.camera,
      camera.position.x,
      camera.position.y,
      camera.position.z,
    );
    gl.uniform3fv(uniforms.terrain.fogColor, skyHorizon.slice(0, 3));
    gl.uniform3fv(uniforms.terrain.rough, geometry.palette.rough);
    gl.uniform3fv(uniforms.terrain.fairway, geometry.palette.fairway);
    gl.uniform3fv(uniforms.terrain.green, geometry.palette.green);
    gl.uniform3fv(uniforms.terrain.sand, geometry.palette.sand);
    gl.uniform3fv(uniforms.terrain.water, geometry.palette.water);
    gl.uniform1f(
      uniforms.terrain.environmentSeconds,
      environmentTimeMs / 1_000,
    );
    gl.bindVertexArray(geometry.terrain.vertexArray);
    gl.depthFunc(gl.LESS);
    gl.drawElements(
      gl.TRIANGLES,
      geometry.terrain.gridIndexCount,
      gl.UNSIGNED_INT,
      0,
    );
    if (geometry.terrain.surfaceBatches.length > 0) {
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      geometry.terrain.surfaceBatches.forEach((batch, index) => {
        const priority = batch.material === "water" ? -12 : -(index + 1);
        gl.polygonOffset(priority, priority);
        gl.drawElements(
          gl.TRIANGLES,
          batch.indexCount,
          gl.UNSIGNED_INT,
          batch.byteOffset,
        );
      });
      gl.polygonOffset(0, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.depthFunc(gl.LESS);
    }

    gl.disable(gl.CULL_FACE);
    gl.useProgram(vegetationProgram);
    gl.uniformMatrix4fv(
      uniforms.vegetation.viewProjection,
      false,
      viewProjection,
    );
    const windRadians = (((wind?.towardDegrees ?? 0) - 90) * Math.PI) / 180;
    gl.uniform2f(
      uniforms.vegetation.windDirection,
      Math.cos(windRadians),
      Math.sin(windRadians),
    );
    gl.uniform1f(
      uniforms.vegetation.windStrength,
      clamp((wind?.speed ?? 0) * 0.03, 0, 0.32),
    );
    gl.uniform1f(
      uniforms.vegetation.environmentSeconds,
      environmentTimeMs / 1_000,
    );
    gl.uniform1f(
      uniforms.vegetation.motionScale,
      reducedMotion ? 0 : 1,
    );
    gl.uniform3fv(
      uniforms.vegetation.fogColor,
      skyHorizon.slice(0, 3),
    );
    gl.bindVertexArray(geometry.vegetation.vertexArray);
    gl.drawArraysInstanced(
      gl.TRIANGLES,
      0,
      geometry.vegetation.vertexCount,
      geometry.vegetation.instanceCount,
    );

    let frameUploadBytes = 0;
    if (overlayMesh) {
      const overlay = createOverlayGeometry(
        world,
        camera,
        ballPosition,
        showBall,
      );
      gl.bindVertexArray(overlayMesh.vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, overlayMesh.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, overlay.positions, gl.STREAM_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, overlayMesh.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, overlay.colors, gl.STREAM_DRAW);
      gl.useProgram(overlayProgram);
      gl.uniformMatrix4fv(
        uniforms.overlay.viewProjection,
        false,
        viewProjection,
      );
      gl.drawArrays(gl.TRIANGLES, 0, overlay.vertexCount);
      frameUploadBytes = overlay.positions.byteLength + overlay.colors.byteLength;
    }
    gl.bindVertexArray(null);

    const preparedArtStatus = courseArtService.status();
    return Object.freeze({
      groundArtVersion: WEBGL_GROUND_ART_VERSION,
      terrainTriangles: geometry.terrain.indexCount / 3,
      terrainGridTriangles: geometry.terrain.gridTriangleCount,
      terrainCoarseGridTriangles: geometry.terrain.coarseGridTriangleCount,
      surfaceTriangles: geometry.terrain.surfaceTriangleCount,
      surfaceDrawCalls: geometry.terrain.surfaceBatches.length,
      bunkerArtVersion: geometry.terrain.bunkerArtVersion,
      bunkerPatchCount: geometry.terrain.bunkerPatchCount,
      bunkerCollarTriangles: geometry.terrain.bunkerCollarTriangleCount,
      bunkerReliefTriangles: geometry.terrain.bunkerReliefTriangleCount,
      watercourseArtVersion: geometry.terrain.watercourseArtVersion,
      waterShorelineVertices: geometry.terrain.waterShorelineVertexCount,
      waterShorelineTriangles: geometry.terrain.waterShorelineTriangleCount,
      waterShorelineBytes: geometry.terrain.waterShorelineByteLength,
      vegetationInstances: geometry.vegetation.instanceCount,
      drawCalls:
        geometry.terrain.surfaceBatches.length + (overlayMesh ? 4 : 3),
      gpuCacheHit: true,
      preparedArtCacheHit: null,
      preparationDurationMs: 0,
      renderPathPreparationDurationMs: 0,
      lastColdPreparationDurationMs,
      preparationEvidence: geometry.preparationEvidence,
      residentWorlds: cache.size,
      residentGeometryBytes: geometry.terrain.bytes + geometry.vegetation.bytes,
      totalResidentGeometryBytes: totalResidentGeometryBytes(),
      preparedWorlds: preparedArtStatus.residentWorlds,
      preparedGeometryBytes: preparedArtStatus.residentBytes,
      pendingPreparedWorlds: preparedArtStatus.pendingWorlds,
      frameUploadBytes,
      contextLosses,
    });
  };

  const dispose = () => {
    if (disposed) return false;
    disposed = true;
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    for (const geometry of cache.values()) {
      disposeWorldGeometry(geometry);
    }
    cache.clear();
    for (const pending of pendingGeometry.values()) {
      pending.controller?.abort();
    }
    pendingGeometry.clear();
    courseArtService.dispose();
    if (overlayMesh) disposeMesh(gl, overlayMesh);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.useProgram(null);
    gl.deleteProgram(skyProgram);
    gl.deleteProgram(terrainProgram);
    gl.deleteProgram(vegetationProgram);
    if (overlayProgram) gl.deleteProgram(overlayProgram);
    return true;
  };

  return Object.freeze({
    backend: "webgl2-hybrid",
    gl,
    presentationLayer,
    resize,
    prepare,
    render,
    dispose,
    getStatus,
    getPreparationStatus,
    getContextLosses: () => contextLosses,
  });
}
