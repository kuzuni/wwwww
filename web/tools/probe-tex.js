// 절차 생성 텍스처의 필터링 상태 실측 — 비평가 2인이 공통 지목한 "사슬이 흑백 체커로
// 에일리어싱된다"의 원인을 특정한다. 후보: ① anisotropy=1(기본) ② 논-POT 크기로 밉맵 미생성
// ③ WebGL1 폴백에서 three.js가 POT로 강제 리사이즈하며 고리 종횡비가 왜곡.
// 사용: node probe-tex.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig, null, { timeout: 60000 });

    const r = await page.evaluate(() => {
        const R = Scene3D.renderer, gl = R.getContext();
        const isPOT = (n) => (n & (n - 1)) === 0;
        const out = {
            webgl2: R.capabilities.isWebGL2,
            maxAnisotropy: R.capabilities.getMaxAnisotropy(),
            textures: [],
        };
        for (const key of Object.keys(ProChar._texCache)) {
            const t = ProChar._texCache[key];
            const iw = t.image && t.image.width, ih = t.image && t.image.height;
            out.textures.push({
                key, w: iw, h: ih, pot: isPOT(iw) && isPOT(ih),
                anisotropy: t.anisotropy,
                generateMipmaps: t.generateMipmaps,
                minFilter: t.minFilter === THREE.LinearMipmapLinearFilter ? 'LinearMipmapLinear'
                    : t.minFilter === THREE.LinearFilter ? 'Linear' : String(t.minFilter),
                repeat: [t.repeat.x, t.repeat.y],
            });
        }
        // 사슬 재질이 실제로 쓰는 repeat/텍스처를 확인
        const mailUse = [];
        Scene3D.heroRig.group.traverse(o => {
            if (o.isMesh && o.material && o.material.map === ProChar._texCache['mail']) {
                const p = o.geometry.parameters || {};
                mailUse.push({ geo: o.geometry.type, radiusTop: p.radiusTop, height: p.height });
            }
        });
        out.mailMeshes = mailUse.length;
        out.mailSample = mailUse.slice(0, 4);
        return out;
    });
    console.log('webgl2:', r.webgl2, ' maxAnisotropy:', r.maxAnisotropy);
    console.log('사슬 재질 사용 메시 수:', r.mailMeshes, JSON.stringify(r.mailSample));
    console.log('key'.padEnd(10), 'size'.padEnd(11), 'POT'.padEnd(6), 'aniso'.padEnd(6), 'mipmaps'.padEnd(8), 'minFilter');
    for (const t of r.textures) console.log(String(t.key).padEnd(10), `${t.w}x${t.h}`.padEnd(11), String(t.pot).padEnd(6), String(t.anisotropy).padEnd(6), String(t.generateMipmaps).padEnd(8), t.minFilter);
    console.log(errs.length ? 'CONSOLE: ' + errs.slice(0, 6).join(' | ') : '(no console errors/warnings)');
    await browser.close();
})();
