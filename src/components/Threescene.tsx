"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
// @ts-expect-error no type declarations for GLTFLoader
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as CANNON from "cannon-es";

export default function ThreeBunnies() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    let walls: CANNON.Body[] = [];
    let platformBody: CANNON.Body | null = null;   // ⭐ 物理平台
    let platformMesh: THREE.Mesh | null = null;    // ⭐ 視覺平台

    // === THREE 場景 ===
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 8;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // === 光源 ===
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // === CANNON 世界 ===
    const world = new CANNON.World();
    world.broadphase = new CANNON.NaiveBroadphase();
	// @ts-expect-error no type declarations for NaiveBroadphase
    world.solver.iterations = 10;

	// 👉 拋擲狀態（只給 landscape 用）
	const throwState = {
		last: new THREE.Vector2(),   // 上一次的手指目標點（世界座標）
		v: new THREE.Vector2(),      // 當前估計速度（世界座標 / 毫秒）
		t: 0,                        // 上一次時間戳 (ms)
	};
  

    // === 物件容器 ===
    const loader = new GLTFLoader();
    const bunnies: THREE.Object3D[] = [];
    const bunnyBodies: CANNON.Body[] = [];

	// 太空漂浮參數
	const floatParams = {
	baseForce: 0.02,
	waveAmplitude: 0.01,
	waveFrequency: 0.002,
	rotationSpeed: 0.5,
	maxVelocity: 2.0
	};

	// 每個兔子的漂浮狀態
	const floatStates: Array<{
	timeOffset: number;
	rotAxis: THREE.Vector3;
	rotSpeed: number;
	floatDir: THREE.Vector2;
	}> = [];

    // === Raycaster for click / hover ===
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // === 手機重力判斷 ===
    let gravityOn = false;

    const buildOrUpdatePlatform = (halfW: number, halfH: number) => {
      // 只在 landscape + mobile 有平台
      if (!gravityOn) {
        // 清掉舊平台
        if (platformBody) {
          world.removeBody(platformBody);
          platformBody = null;
        }
        if (platformMesh) {
          scene.remove(platformMesh);
          platformMesh.geometry.dispose();
          // material 可重用就不強制 dispose
          platformMesh = null;
        }
        return;
      }

      // 先移除既有平台再重建（避免重覆 body）
      if (platformBody) {
        world.removeBody(platformBody);
        platformBody = null;
      }
      if (platformMesh) {
        scene.remove(platformMesh);
        platformMesh.geometry.dispose();
        platformMesh = null;
      }

      // 視覺尺寸（留左右邊界一點空間）
      const platformWidth = halfW * 1.6;     // 約 80% 視口寬
      const platformThickness = 0.6;
      const platformDepth = 1.0;
      const safeMargin = 0.8;                // 距離底邊界往上留的安全距離
      const yTop = -halfH + safeMargin + platformThickness / 2;

      // THREE 平台
      const geo = new THREE.BoxGeometry(platformWidth * 2, platformThickness, platformDepth);
      const mat = new THREE.MeshStandardMaterial({ color: 0x222222 });
      platformMesh = new THREE.Mesh(geo, mat);
      platformMesh.position.set(0, yTop, 0);
      scene.add(platformMesh);

      // CANNON 平台剛體（靜態）
      platformBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(platformWidth, platformThickness / 2, platformDepth / 2)),
        position: new CANNON.Vec3(0, yTop, 0),
      });
      world.addBody(platformBody);
    };

    const checkMobileLandscape = () => {
      const isMobile =
        /Mobi|Android|iPad|iPhone/i.test(navigator.userAgent) ||
        window.innerWidth <= 1024;
      const isLandscape = window.matchMedia("(orientation: landscape)").matches;
      gravityOn = isMobile && isLandscape;

      // === 每次都重新計算相機視椎體大小 ===
      const aspect = window.innerWidth / window.innerHeight;
      const frustumHeight = camera.position.z * Math.tan((camera.fov * Math.PI) / 360) * 2;
      const frustumWidth = frustumHeight * aspect;

      const halfW = frustumWidth / 2;
      const halfH = frustumHeight / 2;

      // 🔹 先清除舊的牆壁
      walls.forEach((w) => world.removeBody(w));
      walls = [];

      // 🔹 新建牆壁（四面牆，防止超出 viewport）
      const wallL = new CANNON.Body({ mass: 0 });
      wallL.addShape(new CANNON.Plane());
      wallL.position.set(-halfW, 0, 0);
      wallL.quaternion.setFromEuler(0, Math.PI / 2, 0);
      world.addBody(wallL);
      walls.push(wallL);

      const wallR = new CANNON.Body({ mass: 0 });
      wallR.addShape(new CANNON.Plane());
      wallR.position.set(halfW, 0, 0);
      wallR.quaternion.setFromEuler(0, -Math.PI / 2, 0);
      world.addBody(wallR);
      walls.push(wallR);

      const wallT = new CANNON.Body({ mass: 0 });
      wallT.addShape(new CANNON.Plane());
      wallT.position.set(0, halfH, 0);
      wallT.quaternion.setFromEuler(Math.PI / 2, 0, 0);
      world.addBody(wallT);
      walls.push(wallT);

      const wallB = new CANNON.Body({ mass: 0 });
      wallB.addShape(new CANNON.Plane());
      wallB.position.set(0, -halfH, 0);
      wallB.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      world.addBody(wallB);
      walls.push(wallB);

      // 重力設定
      if (gravityOn) {
        world.gravity.set(0, -9.82, 0);
      } else {
        world.gravity.set(0, 0, 0);
      }

      // ⭐ 建立 / 更新平台（僅 landscape）
      buildOrUpdatePlatform(halfW, halfH);
    };

    checkMobileLandscape();
    window.addEventListener("resize", checkMobileLandscape);
    window
      .matchMedia("(orientation: landscape)")
      .addEventListener("change", checkMobileLandscape);

    // === 載入兔子模型 ===
    loader.load("/models/ghost.glb", (gltf: GLTF) => {
      for (let i = 0; i < 5; i++) {
        const bunny = gltf.scene.clone();
        bunny.scale.set(1.5, 1.5, 1.5);
        scene.add(bunny);
        bunnies.push(bunny);

        // 用 Box 當作碰撞體
        const shape = new CANNON.Box(new CANNON.Vec3(0.8, 0.8, 0.8));
        const body = new CANNON.Body({
          mass: 1,
          shape,
          position: new CANNON.Vec3(
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 4,
            0
          ),
        });
        // 鎖 XY 平面、只繞 Z 旋轉
        body.linearFactor.set(1, 1, 0);
        body.angularFactor.set(0, 0, 1);
        // 阻尼讓手感自然一點
        body.linearDamping = 0.2;
        body.angularDamping = 0.4;

        world.addBody(body);
        bunnyBodies.push(body);

        // 太空模式初始小漂浮力
        if (!gravityOn) {
          body.velocity.set(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
            0
          );
        }

		// 初始化漂浮狀態
		floatStates.push({
			timeOffset: Math.random() * Math.PI * 2,
			rotAxis: new THREE.Vector3(
			(Math.random() - 0.5) * 2,
			(Math.random() - 0.5) * 2,
			(Math.random() - 0.5) * 2
			).normalize(),
			rotSpeed: (Math.random() * 0.5 + 0.5) * floatParams.rotationSpeed,
			floatDir: new THREE.Vector2(
			(Math.random() - 0.5) * 2,
			(Math.random() - 0.5) * 2
			).normalize()
		});
      }
    });

    // === 👉 只在 mobile landscape 啟用的抓取功能 ===
    let grabbedIndex: number | null = null;
    const grabPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // Z=0 平面
    const grabPoint = new THREE.Vector3();
    const grabOffset = new THREE.Vector3();

    const findBunnyIndex = (obj: THREE.Object3D) => {
      let n: THREE.Object3D | null = obj;
      while (n && !bunnies.includes(n)) n = n.parent;
      return n ? bunnies.indexOf(n) : -1;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!gravityOn) return;
      e.preventDefault();

      const t = e.touches[0];
      mouse.x = (t.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(bunnies, true);
      if (!hits.length) return;

      const idx = findBunnyIndex(hits[0].object);
      if (idx < 0) return;

      grabbedIndex = idx;
      const body = bunnyBodies[idx];

      // 暫停物理，由我們直接設位置
      body.type = CANNON.Body.KINEMATIC;
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);

      // 記住手勢投影點與當前剛體位置的偏移
      raycaster.ray.intersectPlane(grabPlane, grabPoint);
      grabOffset.set(
        body.position.x - grabPoint.x,
        body.position.y - grabPoint.y,
        0
      );

	  throwState.t = performance.now();
		throwState.last.set(
		grabPoint.x + grabOffset.x,
		grabPoint.y + grabOffset.y
		);
		throwState.v.set(0, 0);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (grabbedIndex === null) return;
      e.preventDefault();

      const t = e.touches[0];
      mouse.x = (t.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      raycaster.ray.intersectPlane(grabPlane, grabPoint);

      const body = bunnyBodies[grabbedIndex];

	  // 目標位置（夾娃娃機要移到的位置）
const targetX = grabPoint.x + grabOffset.x;
const targetY = grabPoint.y + grabOffset.y;

// 估計速度（世界座標 / 秒）
const now = performance.now();
const dt = Math.max(1, now - throwState.t); // 避免 0 除
throwState.v.set(
  (targetX - throwState.last.x) / dt,
  (targetY - throwState.last.y) / dt
);
throwState.last.set(targetX, targetY);
throwState.t = now;

// 再把剛體移到目標位置
body.position.set(targetX, targetY, 0);
    };

    const onTouchEnd = () => {
      if (grabbedIndex === null) return;

      const body = bunnyBodies[grabbedIndex];
body.type = CANNON.Body.DYNAMIC;

// 將世界座標/毫秒 轉成 世界座標/秒，並做上限限制
const throwScale = 800;   // ← 調整力度：數值越大，拋得越遠
const maxSpeed  = 8;      // ← 最高速度上限，避免飛太誇張

let vx = throwState.v.x * throwScale;
let vy = throwState.v.y * throwScale;

// 限速（保留方向）
const speed = Math.hypot(vx, vy);
if (speed > maxSpeed) {
  const s = maxSpeed / speed;
  vx *= s; vy *= s;
}

// 套到剛體速度（只在 XY）
body.velocity.set(vx, vy, 0);

// 依速度給一點旋轉（繞 Z 軸）
const spin = THREE.MathUtils.clamp((Math.random() - 0.5) * speed * 0.6, -5, 5);
body.angularVelocity.z += spin;

grabbedIndex = null;

    };

    window.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: false });

    // === 滑鼠事件 → 推開兔子（桌機/portrait 用） ===
    const onMouseMove = (event: MouseEvent) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onMouseMove);

    const onClick = (event: MouseEvent) => {
      if (gravityOn) return; // landscape 用 touch 抓取，不用 click 推
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(bunnies, true);

      if (intersects.length > 0) {
        const idx = bunnies.indexOf(intersects[0].object.parent!);
        if (idx >= 0) {
          const body = bunnyBodies[idx];
          const dir = new THREE.Vector3()
            .subVectors(bunnies[idx].position.clone(), camera.position.clone())
            .normalize();

          const pushStrength = 5;
          const impulse = new CANNON.Vec3(dir.x * pushStrength, dir.y * pushStrength, 0);
          body.applyImpulse(impulse, body.position);

          const torqueStrength = 10;
          body.angularVelocity.z += (Math.random() - 0.5) * torqueStrength;
        }
      }
    };
    window.addEventListener("click", onClick);

    // === 動畫迴圈 ===
    const clock = new THREE.Clock();
    const animate = () => {
      requestAnimationFrame(animate);

      // 桌機 / portrait 時的 hover 推開
      if (!gravityOn) {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(bunnies, true);

        intersects.forEach((hit) => {
          const idx = bunnies.indexOf(hit.object.parent!);
          if (idx >= 0) {
            const body = bunnyBodies[idx];
            const dir = new THREE.Vector3()
              .subVectors(bunnies[idx].position.clone(), camera.position.clone())
              .normalize();

            const pushStrength = 5;
            const impulse = new CANNON.Vec3(dir.x * pushStrength, dir.y * pushStrength, 0);
            body.applyImpulse(impulse, body.position);

            const torqueStrength = 10;
            body.angularVelocity.z += (Math.random() - 0.5) * torqueStrength;
          }
        });
      }

      const delta = clock.getDelta();
      world.step(1 / 60, delta, 3);

      // 增強的太空漂浮效果
if (!gravityOn) {
	const time = clock.getElapsedTime();
	
	bunnyBodies.forEach((body, i) => {
	  if (body.mass > 0 && floatStates[i]) {
		const state = floatStates[i];
		const t = time + state.timeOffset;
		
		// 波動式漂浮力
		const waveX = Math.sin(t * floatParams.waveFrequency) * floatParams.waveAmplitude;
		const waveY = Math.cos(t * floatParams.waveFrequency * 1.3) * floatParams.waveAmplitude;
		
		// 基礎漂浮力 + 波動
		const forceX = state.floatDir.x * floatParams.baseForce + waveX;
		const forceY = state.floatDir.y * floatParams.baseForce + waveY;
		
		body.velocity.x += forceX;
		body.velocity.y += forceY;
		
		// 速度限制
		const speed = Math.hypot(body.velocity.x, body.velocity.y);
		if (speed > floatParams.maxVelocity) {
		  const scale = floatParams.maxVelocity / speed;
		  body.velocity.x *= scale;
		  body.velocity.y *= scale;
		}
		
		// 自然旋轉
		body.angularVelocity.z += Math.sin(t * state.rotSpeed) * 0.03;

		// 邊界反彈檢測
		const aspect = window.innerWidth / window.innerHeight;
		const frustumHeight = camera.position.z * Math.tan((camera.fov * Math.PI) / 360) * 2;
		const frustumWidth = frustumHeight * aspect;
		const halfW = frustumWidth / 2;
		const halfH = frustumHeight / 2;

		const margin = 1.0; // 邊界緩衝區

		// 檢測並反彈
		if (body.position.x > halfW - margin) {
		body.velocity.x = Math.min(body.velocity.x, -0.5);
		state.floatDir.x = -Math.abs(state.floatDir.x);
		}
		if (body.position.x < -halfW + margin) {
		body.velocity.x = Math.max(body.velocity.x, 0.5);
		state.floatDir.x = Math.abs(state.floatDir.x);
		}
		if (body.position.y > halfH - margin) {
		body.velocity.y = Math.min(body.velocity.y, -0.5);
		state.floatDir.y = -Math.abs(state.floatDir.y);
		}
		if (body.position.y < -halfH + margin) {
		body.velocity.y = Math.max(body.velocity.y, 0.5);
		state.floatDir.y = Math.abs(state.floatDir.y);
		}
	  }
	});
  }

      // 同步位置
      for (let i = 0; i < bunnies.length; i++) {
        const bunny = bunnies[i];
        const body = bunnyBodies[i];
        if (bunny && body) {
          bunny.position.copy(body.position);
          bunny.quaternion.copy(body.quaternion);
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // === Resize ===
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      checkMobileLandscape(); // 會重建牆+平台位置
    };
    window.addEventListener("resize", handleResize);

    // === Cleanup ===
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      walls.forEach((w) => world.removeBody(w));
      if (platformBody) world.removeBody(platformBody);
      if (platformMesh) scene.remove(platformMesh);
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        touchAction: "none",
      }}
    />
  );
}
