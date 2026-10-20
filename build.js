const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'test_builds');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const htmlSource = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(__dirname, 'css', 'style.css'), 'utf8');
const battleCssSource = fs.readFileSync(path.join(__dirname, 'css', 'battle.css'), 'utf8');

const jsFiles = [
  'src/core/EntityManager.js',
  'src/core/EventBus.js',
  'src/core/World.js',
  'src/config/GameConfig.js',
  'src/visuals/HealthVisuals.js',
  'src/components/TransformComponent.js',
  'src/components/VelocityComponent.js',
  'src/components/CircleColliderComponent.js',
  'src/components/HealthComponent.js',
  'src/components/ArmorComponent.js',
  'src/components/DefenseComponent.js',
  'src/components/AttackComponent.js',
  'src/components/TargetComponent.js',
  'src/components/RenderComponent.js',
  'src/components/TowerComponent.js',
  'src/components/EnemyComponent.js',
  'src/components/ProjectileComponent.js',
  'src/components/EconomyComponent.js',
  'src/combat/DamageCalculation.js',
  'src/systems/MovementSystem.js',
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
  'src/ui/UIManager.js',
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
  /<link\s+rel=["']stylesheet["']\s+href=["']css\/style\.css["']>\s*/i,
  `<style>\n${cssSource}\n</style>\n`
);

bundledHtml = bundledHtml.replace(
  /<link\s+rel=["']stylesheet["']\s+href=["']css\/battle\.css(?:\?[^"']*)?["']>\s*/i,
  `<style>\n${battleCssSource}\n</style>\n`
);

// Replace external module script with inline <script>
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
