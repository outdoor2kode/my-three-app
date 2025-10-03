"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
// @ts-expect-error no type declarations for OrbitControls
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
// @ts-expect-error no type declarations for GLTFLoader
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

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

    loader.load("/models/ghost.glb", (gltf: GLTF) => {
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

        // 初始漂浮速度
        velocities.set(
          bunny,
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.02,
            (Math.random() - 0.5) * 0.02,
            0
          )
        );

        // 初始自轉速度
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

    // === Mobile + Landscape 偵測 ===
    let gravityOn = false;
    const checkMobileLandscape = () => {
      const isMobile =
        /Mobi|Android|iPad|iPhone/i.test(navigator.userAgent) ||
        window.innerWidth <= 1024;
      const isLandscape = window.matchMedia(
        "(orientation: landscape)"
      ).matches;
      gravityOn = isMobile && isLandscape;
    };
    checkMobileLandscape();
    window.addEventListener("resize", checkMobileLandscape);
    window
      .matchMedia("(orientation: landscape)")
      .addEventListener("change", checkMobileLandscape);

    // === 動畫迴圈 ===
    const animate = () => {
      requestAnimationFrame(animate);

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(bunnies, true);

      // 滑鼠碰到 → 撥開效果
      intersects.forEach((hit) => {
        const root = hit.object;
        const bunny = root.parent || root;

        if (velocities.has(bunny)) {
          const v = velocities.get(bunny)!;

          // 推開方向 (只在 XY 平面)
          const pushDir = new THREE.Vector3()
            .subVectors(bunny.position, camera.position)
            .normalize();
          pushDir.z = 0;

          v.add(pushDir.multiplyScalar(0.005));

          // 加旋轉速度
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
          // 如果進入 mobile + landscape → 套用重力
          if (gravityOn) {
            v.y -= 0.02; // 重力加速度
          }

          // 位置更新
          bunny.position.add(v);
          if (!gravityOn) {
            v.multiplyScalar(0.999); // 太空漂浮摩擦力
          }

          // === 邊界計算 ===
          const aspect = window.innerWidth / window.innerHeight;
          const frustumHeight =
            camera.position.z * Math.tan((camera.fov * Math.PI) / 360) * 2;
          const frustumWidth = frustumHeight * aspect;

          const limitX = frustumWidth / 2;
          const limitY = frustumHeight / 2;

          // 邊界檢查
          if (bunny.position.x > limitX || bunny.position.x < -limitX) {
            v.x *= -1;
            bunny.position.x = THREE.MathUtils.clamp(
              bunny.position.x,
              -limitX,
              limitX
            );
          }
          if (gravityOn) {
            // === 有重力的時候，底部是地面 ===
            if (bunny.position.y < -limitY) {
              bunny.position.y = -limitY;
              if (Math.abs(v.y) > 0.01) {
                v.y *= -0.6; // 彈性碰撞
              } else {
                v.y = 0; // 停止
              }
            }
          } else {
            // === 太空模式的上下邊界 ===
            if (bunny.position.y > limitY || bunny.position.y < -limitY) {
              v.y *= -1;
              bunny.position.y = THREE.MathUtils.clamp(
                bunny.position.y,
                -limitY,
                limitY
              );
            }
          }

          // 旋轉更新
          bunny.rotation.x += av.x;
          bunny.rotation.y += av.y;
          bunny.rotation.z += av.z;
          av.multiplyScalar(0.999);
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
      checkMobileLandscape(); // 確保重力判斷也會更新
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
