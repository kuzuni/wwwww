// models-data.js 재생성: web/assets/models/*.glb → base64 임베드
const fs = require('fs');
const path = require('path');
const ROOT = 'c:/Users/user/Documents/GitHub/wwwww/web';
const MODELS = {
    knight: 'Knight.glb',
    skelWarrior: 'Skeleton_Warrior.glb',
    skelMinion: 'Skeleton_Minion.glb',
    skelMage: 'Skeleton_Mage.glb',
    skelRogue: 'Skeleton_Rogue.glb',
};
let out = '// 임베드된 GLB 모델 (KayKit CC0) — file:// 환경에서도 로드 가능\nconst MODEL_B64 = {\n';
for (const [key, file] of Object.entries(MODELS)) {
    const buf = fs.readFileSync(path.join(ROOT, 'assets/models', file));
    out += `  ${key}: '${buf.toString('base64')}',\n`;
    console.log(key, file, (buf.length / 1048576).toFixed(1) + 'MB');
}
out += '};\n';
fs.writeFileSync(path.join(ROOT, 'assets/models-data.js'), out);
console.log('written', (out.length / 1048576).toFixed(1) + 'MB');
