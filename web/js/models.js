// ===== GLB 모델 로더 (base64 임베드 → GLTFLoader.parse, file:// 호환) =====
const Models = {
    data: {},     // name → gltf {scene, animations}
    ready: false,

    load(onReady) {
        if (typeof MODEL_B64 === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
            console.warn('GLB 모델 데이터 없음 — 프로시저럴 모드로 동작');
            if (onReady) onReady(false);
            return;
        }
        const loader = new THREE.GLTFLoader();
        const names = Object.keys(MODEL_B64);
        if (names.length === 0) { if (onReady) onReady(false); return; }
        let left = names.length;
        for (const name of names) {
            try {
                const b64 = MODEL_B64[name];
                const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
                loader.parse(bin.buffer, '', gltf => {
                    this.data[name] = gltf;
                    if (--left === 0) { this.ready = true; if (onReady) onReady(true); }
                }, err => {
                    console.warn('GLB 파싱 실패:', name, err);
                    if (--left === 0) { this.ready = Object.keys(this.data).length > 0; if (onReady) onReady(this.ready); }
                });
            } catch (e) {
                console.warn('GLB 디코드 실패:', name, e);
                if (--left === 0) { this.ready = Object.keys(this.data).length > 0; if (onReady) onReady(this.ready); }
            }
        }
    },

    // 후보 이름 목록에서 존재하는 첫 클립 반환
    pickClip(gltf, candidates) {
        for (const c of candidates) {
            const clip = gltf.animations.find(a => a.name === c);
            if (clip) return clip;
        }
        return gltf.animations.find(a => a.name === 'Idle') || gltf.animations[0] || null;
    },
};
