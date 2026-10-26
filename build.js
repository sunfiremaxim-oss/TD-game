const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'test_builds');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const htmlSource = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(__dirname, 'css', 'style.css'), 'utf8');
const battleCssSource = fs.readFileSync(path.join(__dirname, 'css', 'battle.css'), 'utf8');
const menuCssSource = fs.readFileSync(path.join(__dirname, 'css', 'menu.css'), 'utf8');
const devToolsCssSource = fs.readFileSync(path.join(__dirname, 'css', 'devtools.css'), 'utf8');
const fontCssSource = fs.readFileSync(path.join(__dirname, 'css', 'fonts.css'), 'utf8')
  .replace(/url\('\.\.\/fonts\/([^']+\.woff2)'\)/g, (_, name) => {
    const data = fs.readFileSync(path.join(__dirname, 'fonts', name)).toString('base64');
    return `url('data:font/woff2;base64,${data}')`;
  });
const fontLicenses = ['WDXL-Lubrifont-OFL.txt', 'Orbitron-OFL.txt']
  .map(name => `/* ${name}\n${fs.readFileSync(path.join(__dirname, 'fonts', name), 'utf8')}\n*/`)
  .join('\n');

const jsFiles = [
  'src/core/EntityManager.js',
  'src/core/EventBus.js',
  'src/core/World.js',
  'src/i18n/Translations.js',
  'src/i18n/I18n.js',
  'src/config/GameConfig.js',
  'src/config/StageConfig.js',
  'src/config/UpgradeTiers.js',
  'src/visuals/HealthVisuals.js',
  'src/visuals/BossHealthVisual.js',
  'src/visuals/ArchitectVisual.js',
  'src/visuals/CarrierVisual.js',
  'src/visuals/ScoutBossVisual.js',
  'src/visuals/RailgunVisual.js',
  'src/visuals/ArchitectDrillVisual.js',
  'src/visuals/AegisShieldVisual.js',
  'src/visuals/MenuCoreVisual.js',
  'src/visuals/BattleVisualCache.js',
  'src/visuals/SpaceVisualCache.js',
  'src/components/TransformComponent.js',
  'src/components/VelocityComponent.js',
  'src/components/CircleColliderComponent.js',
  'src/components/HealthComponent.js',
  'src/components/ArmorComponent.js',
  'src/components/DefenseComponent.js',
  'src/components/DevControlComponent.js',
  'src/components/ArchitectDrillComponent.js',
  'src/components/ArchitectSiegeComponent.js',
  'src/components/CarrierComponent.js',
  'src/components/RailgunComponent.js',
  'src/components/AttackComponent.js',
  'src/components/TargetComponent.js',
  'src/components/RenderComponent.js',
  'src/components/TowerComponent.js',
  'src/components/EnemyComponent.js',
  'src/components/FighterFlightComponent.js',
  'src/components/ProjectileComponent.js',
  'src/components/EconomyComponent.js',
  'src/combat/DamageCalculation.js',
  'src/combat/CarrierMechanics.js',
  'src/combat/RailgunMechanics.js',
  'src/systems/FighterSteering.js',
  'src/systems/MovementSystem.js',
  'src/systems/CarrierAISystem.js',
  'src/systems/RailgunAISystem.js',
  'src/systems/PhysicsSeparationSystem.js',
  'src/systems/TargetingSystem.js',
  'src/systems/SniperAISystem.js',
  'src/systems/WeaponSystem.js',
  'src/systems/CollisionSystem.js',
  'src/systems/DamageSystem.js',
  'src/systems/WaveSystem.js',
  'src/systems/EconomySystem.js',
  'src/systems/ParticleSystem.js',
  'src/systems/AudioSystem.js',
  'src/systems/RenderSystem.js',
  'src/managers/UpgradeManager.js',
  'src/managers/PlayerProgress.js',
  'src/ui/UIManager.js',
  'src/ui/DevTools.js',
  'src/main.js'
];

let bundledJs = '(function() {\n  "use strict";\n\n';

for (const relPath of jsFiles) {
  const fullPath = path.join(__dirname, relPath);
  let content = fs.readFileSync(fullPath, 'utf8');

  // Strip all import statements (single-line and multi-line)
  content = content.replace(/import\s+[^;]+;\s*/g, '');

  // Strip export keywords
  content = content.replace(/export\s+(class|const|let|var|function)/g, '$1');

  bundledJs += `  // ==================================================\n  // Source: ${relPath}\n  // ==================================================\n` + content + '\n\n';
}

bundledJs += '})();\n';

// Replace external CSS link with inline <style>
let bundledHtml = htmlSource.replace(
  /<link\s+rel=["']stylesheet["']\s+href=["']css\/style\.css(?:\?[^"']*)?["']>\s*/i,
  `<style>\n${cssSource}\n</style>\n`
);

// Fonts travel inside the standalone HTML, including their OFL licenses.
bundledHtml = bundledHtml.replace(
  /<link\s+rel=["']stylesheet["']\s+href=["']css\/fonts\.css(?:\?[^"']*)?["']>\s*/i,
  `<style>\n${fontLicenses}\n${fontCssSource}\n</style>\n`
).replace(/\s*<link\s+rel="preload"\s+href="fonts\/[^"]+"[^>]*>/g, '');

bundledHtml = bundledHtml.replace(
  /<link\s+rel=["']stylesheet["']\s+href=["']css\/battle\.css(?:\?[^"']*)?["']>\s*/i,
  `<style>\n${battleCssSource}\n</style>\n`
);

// Inline the command hub styles alongside the battle styles.
bundledHtml = bundledHtml.replace(
  /<link\s+rel=["']stylesheet["']\s+href=["']css\/menu\.css(?:\?[^"']*)?["']>\s*/i,
  `<style>\n${menuCssSource}\n</style>\n`
);

// Replace external module script with inline <script>
bundledHtml = bundledHtml.replace(
  /<link\s+rel=["']stylesheet["']\s+href=["']css\/devtools\.css(?:\?[^"']*)?["']>\s*/i,
  `<style>\n${devToolsCssSource}\n</style>\n`
);

bundledHtml = bundledHtml.replace(
  /<script\s+type=["']module["']\s+src=["'][^"']+["']>\s*<\/script>/i,
  `<script>\n${bundledJs}\n</script>`
);

const targetFileName = process.argv[2] || 'index_test.html';
const outFile = path.join(outDir, targetFileName);
fs.writeFileSync(outFile, bundledHtml, 'utf8');


// Copy music folder to test_builds/music so standalone build has audio available
const musicSrcDir = path.join(__dirname, 'music');
const musicDestDir = path.join(outDir, 'music');
if (fs.existsSync(musicSrcDir)) {
  if (!fs.existsSync(musicDestDir)) {
    fs.mkdirSync(musicDestDir, { recursive: true });
  }
  const files = fs.readdirSync(musicSrcDir);
  for (const file of files) {
    fs.copyFileSync(path.join(musicSrcDir, file), path.join(musicDestDir, file));
  }
  console.log(`Copied ${files.length} music track(s) to: ${musicDestDir}`);
}

console.log('Build generated successfully at:', outFile);
console.log('File size:', (bundledHtml.length / 1024).toFixed(1), 'KB');
