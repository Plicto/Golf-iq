const bootStatus = document.querySelector("#golf-iq-boot");
const baseUrl = new URL("./", document.baseURI);
const sourceRoot = new URL("./_client/", baseUrl);

const SOURCE_FILES = new Set([
  "boot.tsx",
  "app/LabFirstGame.tsx",
  "app/lab-first-course-layout.ts",
  "app/lab-first-presentation.ts",
  "app/lab-first-round.ts",
  "app/gameplay-v119/ImpactStroke.tsx",
  "app/gameplay-v119/ball-impact.ts",
  "app/gameplay-v119/course-character.ts",
  "app/gameplay-v119/course-layout.ts",
  "app/gameplay-v119/course-terrain-sampler.ts",
  "app/gameplay-v119/face-rail-model.mjs",
  "app/gameplay-v119/game-engine.ts",
  "app/gameplay-v119/ground-contact.ts",
  "app/gameplay-v119/ground-materials.ts",
  "app/gameplay-v119/impact-stroke.ts",
  "app/gameplay-v119/putt-cup-physics.ts",
  "src/content/authoredCourseHole.ts",
  "src/content/courseAssetManifest.ts",
  "src/content/courseData.ts",
  "src/content/courseOneAuthoredCourse.ts",
  "src/content/courseOneCanonicalPackage.ts",
  "src/content/courseOneHoleEight.ts",
  "src/content/courseOneHoleFive.ts",
  "src/content/courseOneHoleFour.ts",
  "src/content/courseOneHoleNine.ts",
  "src/content/courseOneHoleOne.ts",
  "src/content/courseOneHoleSeven.ts",
  "src/content/courseOneHoleSix.ts",
  "src/content/courseOneHoleThree.ts",
  "src/content/courseOneHoleTwo.ts",
  "src/content/courseValidator.ts",
  "src/content/gameplaySurfaceShapes.ts",
  "src/content/hazardRulesData.ts",
  "src/content/holeData.ts",
  "src/content/labHoleRuntimeAdapter.ts",
  "src/content/teePinConfigurations.ts",
  "src/game/worldCoordinates.ts"
]);

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  isolatedModules: true,
  removeComments: true,
  sourceMap: false,
  inlineSourceMap: false
};

const compiledUrls = new Map();
const compilePromises = new Map();

function normalizePath(path) {
  const parts = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function dirname(path) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function originalPathFor(key) {
  if (key === "boot.tsx") return "apps/lab-first/boot.tsx";
  if (key.startsWith("app/")) return `apps/lab-first/${key}`;
  return key;
}

function sourceKeyFromOriginal(originalPath) {
  const candidates = [originalPath];
  if (originalPath.endsWith(".js")) {
    candidates.push(
      `${originalPath.slice(0, -3)}.ts`,
      `${originalPath.slice(0, -3)}.tsx`,
      `${originalPath.slice(0, -3)}.mjs`
    );
  } else if (!/\.[a-z0-9]+$/i.test(originalPath)) {
    candidates.push(`${originalPath}.ts`, `${originalPath}.tsx`, `${originalPath}.mjs`);
  }
  for (const candidate of candidates) {
    const key = candidate.startsWith("apps/lab-first/")
      ? candidate.slice("apps/lab-first/".length)
      : candidate;
    if (SOURCE_FILES.has(key)) return key;
  }
  return null;
}

function publicUrlFromOriginal(originalPath) {
  const prefix = "apps/lab-first/public/";
  if (!originalPath.startsWith(prefix)) return null;
  return new URL(originalPath.slice(prefix.length), baseUrl).href;
}

async function resolveModule(specifier, importerKey) {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
    return specifier;
  }
  if (specifier.startsWith("/")) {
    return new URL(`.${specifier}`, baseUrl).href;
  }
  const importerOriginal = originalPathFor(importerKey);
  const resolvedOriginal = normalizePath(`${dirname(importerOriginal)}/${specifier}`);
  const publicUrl = publicUrlFromOriginal(resolvedOriginal);
  if (publicUrl) return publicUrl;
  const sourceKey = sourceKeyFromOriginal(resolvedOriginal);
  if (!sourceKey) {
    throw new Error(`Static client dependency is missing: ${specifier} from ${importerKey}`);
  }
  if (sourceKey.endsWith(".mjs")) {
    return new URL(sourceKey, sourceRoot).href;
  }
  return compileModule(sourceKey);
}

function importSpecifiers(source) {
  const file = ts.createSourceFile("module.js", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const found = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { file, found };
}

async function rewriteImports(source, importerKey) {
  const { file, found } = importSpecifiers(source);
  const replacements = [];
  for (const literal of found) {
    const specifier = literal.text;
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) continue;
    const resolved = await resolveModule(specifier, importerKey);
    replacements.push({
      start: literal.getStart(file) + 1,
      end: literal.getEnd() - 1,
      value: resolved
    });
  }
  replacements.sort((left, right) => right.start - left.start);
  let rewritten = source;
  for (const replacement of replacements) {
    rewritten = rewritten.slice(0, replacement.start) + replacement.value + rewritten.slice(replacement.end);
  }
  return rewritten;
}

async function compileModule(key) {
  if (compiledUrls.has(key)) return compiledUrls.get(key);
  if (compilePromises.has(key)) return compilePromises.get(key);

  const promise = (async () => {
    const response = await fetch(new URL(key, sourceRoot), { cache: "no-cache" });
    if (!response.ok) throw new Error(`Static client source failed to load: ${key} (${response.status})`);
    let source = await response.text();
    if (key === "app/LabFirstGame.tsx") {
      source = source.replace(
        'src="/labs/course-presentation/index.html?game=1"',
        'src="./labs/course-presentation/index.html?game=1"'
      );
    }
    if (key === "app/gameplay-v119/ImpactStroke.tsx") {
      source = source
        .replaceAll('"/assets/impact-stroke/', '"./assets/impact-stroke/')
        .replaceAll("driver-head.png", "wood-address.svg")
        .replaceAll("fairway-head.png", "fairway-wood-address.svg")
        .replaceAll("iron-head.png", "iron-address.svg");
    }
    const transpiled = ts.transpileModule(source, {
      compilerOptions,
      fileName: key,
      reportDiagnostics: true
    });
    const fatalDiagnostics = (transpiled.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
    );
    if (fatalDiagnostics.length > 0) {
      const message = fatalDiagnostics
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "))
        .join("; ");
      throw new Error(`Static client transpilation failed for ${key}: ${message}`);
    }
    const rewritten = await rewriteImports(transpiled.outputText, key);
    const url = URL.createObjectURL(new Blob([
      `${rewritten}\n//# sourceURL=golf-iq-static:${key}\n`
    ], { type: "text/javascript" }));
    compiledUrls.set(key, url);
    return url;
  })();

  compilePromises.set(key, promise);
  try {
    return await promise;
  } finally {
    compilePromises.delete(key);
  }
}

async function boot() {
  if (!globalThis.ts) throw new Error("TypeScript runtime compiler did not load.");
  const entry = await compileModule("boot.tsx");
  await import(entry);
  bootStatus?.remove();
}

boot().catch((cause) => {
  console.error(cause);
  if (bootStatus) {
    bootStatus.textContent = cause instanceof Error ? cause.message : "Golf IQ failed to start.";
    bootStatus.dataset.error = "true";
  }
});
