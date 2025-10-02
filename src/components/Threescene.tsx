"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
// @ts-expect-error no type declarations for OrbitControls
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
// @ts-expect-error no type declarations for GLTFLoader
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

export default function ThreeBunnies() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // === 場景 ===
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // === OrbitControls ===
    const controls = new OrbitControls(camera, renderer.domElement);

    // === 載入 GLB 模型 ===
    const loader = new GLTFLoader();
    const bunnies: THREE.Object3D[] = [];
    // 記錄線性速度 + 旋轉速度
	const velocities = new Map<THREE.Object3D, THREE.Vector3>();
	const angularVelocities = new Map<THREE.Object3D, THREE.Vector3>();

	loader.load("/models/ghost.glb", (gltf) => {
		for (let i = 0; i < 5; i++) {
		  const bunny = gltf.scene.clone();
		  bunny.position.set(
			(Math.random() - 0.5) * 6,
			(Math.random() - 0.5) * 4,
			0
		  );
		  bunny.scale.set(1.5, 1.5, 1.5);
		  scene.add(bunny);
	  
		  bunnies.push(bunny);
	  
		  // 初始漂浮速度 (很小很慢)
		  velocities.set(
			bunny,
			new THREE.Vector3(
			  (Math.random() - 0.5) * 0.02,
			  (Math.random() - 0.5) * 0.02,
			  0
			)
		  );
	  
		  // 初始自轉速度 (很慢)
		  angularVelocities.set(
			bunny,
			new THREE.Vector3(
			  (Math.random() - 0.5) * 0.005,
			  (Math.random() - 0.5) * 0.005,
			  (Math.random() - 0.5) * 0.01
			)
		  );
		}
	  });

    // === Raycaster 滑鼠偵測 ===
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseMove = (event: MouseEvent) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onMouseMove);

    // === 動畫迴圈 ===
	const animate = () => {
		requestAnimationFrame(animate);
	
		raycaster.setFromCamera(mouse, camera);
		const intersects = raycaster.intersectObjects(bunnies, true);
	
		
		// 滑鼠碰到 → 加一點額外速度 (像撥開)
intersects.forEach((hit) => {
	const root = hit.object;
	const bunny = root.parent || root;
  
	if (velocities.has(bunny)) {
	  const v = velocities.get(bunny)!;
  
	  // 計算推開方向 (只在 XY 平面)
	  const pushDir = new THREE.Vector3()
		.subVectors(bunny.position, camera.position)
		.normalize();
	  pushDir.z = 0;
  
	  // 在原有速度上加一點力，不要太大
	  v.add(pushDir.multiplyScalar(0.005));
  
	  // 加一些旋轉速度
	  const av = angularVelocities.get(bunny)!;
	  av.x += (Math.random() - 0.5) * 0.02;
	  av.y += (Math.random() - 0.5) * 0.02;
	  av.z += (Math.random() - 0.5) * 0.05;
	}
  });
  
  // 動畫更新
  bunnies.forEach((bunny) => {
	const v = velocities.get(bunny);
	const av = angularVelocities.get(bunny);
  
	if (v && av) {
	  // 位置更新 (太空漂浮)
	  bunny.position.add(v);
	  v.multiplyScalar(0.999); // 幾乎無摩擦，保持漂浮感
  
	  // 邊界反彈
	  const limitX = 6;
	  const limitY = 4;
	  if (bunny.position.x > limitX || bunny.position.x < -limitX) {
		v.x *= -1;
		bunny.position.x = THREE.MathUtils.clamp(bunny.position.x, -limitX, limitX);
	  }
	  if (bunny.position.y > limitY || bunny.position.y < -limitY) {
		v.y *= -1;
		bunny.position.y = THREE.MathUtils.clamp(bunny.position.y, -limitY, limitY);
	  }
  
	  // 旋轉更新 (持續自轉)
	  bunny.rotation.x += av.x;
	  bunny.rotation.y += av.y;
	  bunny.rotation.z += av.z;
	  av.multiplyScalar(0.999); // 幾乎不會停，像太空物理
	}
  });
  
		controls.update();
		renderer.render(scene, camera);
  	};
    animate();

    // === Resize ===
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // === Cleanup ===
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", onMouseMove);
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} style={{ width: "100%", height: "100vh" }} />;
}
