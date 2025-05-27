import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

function createMeshViewer(containerId, plyPath, color = 0x2d2d8f) {
    const container = document.getElementById(containerId);
    // Clear previous content
    container.innerHTML = '';
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f7fa);
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 2, 2);
    scene.add(dirLight);
    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.0;
    
    if (containerId === 'somabranching-viewer') {
        controls.autoRotateSpeed = 0.5;
    } else if (containerId === 'somaprocess-viewer') {
        controls.autoRotateSpeed = 0.7;
    } else if (containerId === 'axon-viewer' || containerId === 'axoncrossing-viewer') {
        controls.autoRotateSpeed = 0.8;
    } else {
        controls.autoRotateSpeed = 1.0;
    }

    // Load mesh
    const loader = new PLYLoader();
    loader.load(plyPath, geometry => {
        geometry.computeBoundingBox();
        geometry.center();
        const size = geometry.boundingBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        const material = new THREE.MeshPhongMaterial({ color, shininess: 30 });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // Center the mesh and adjust camera
        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        const size2 = box.getSize(new THREE.Vector3());
        
        // Adjust camera position based on mesh size
        const maxDim2 = Math.max(size2.x, size2.y, size2.z);
        const fov = camera.fov * (Math.PI / 180);
        const cameraDistance = Math.abs(maxDim2 / Math.sin(fov / 2));
        
        // Position camera to view the entire mesh
        if (containerId === 'somabranching-viewer') {
            camera.position.set(0, 0, cameraDistance * 0.4);
        } else if (containerId === 'somaprocess-viewer') {
            camera.position.set(0, 0, cameraDistance * 0.5);
        } else if (containerId === 'axon-viewer' || containerId === 'axoncrossing-viewer') {
            camera.position.set(0, 0, cameraDistance * 0.7);
        } else {
            camera.position.set(0, 0, cameraDistance);
        }
        camera.lookAt(center);
        
        // Update controls target to center of mesh
        controls.target.copy(center);
        controls.update();

        animate();
    });
    // Responsive
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    createMeshViewer('axon-viewer', 'mesh/axon.ply', 0x6c63ff);
    createMeshViewer('soma-viewer', 'mesh/soma.ply', 0x6c63ff);
    createMeshViewer('axonbox-viewer', 'mesh/axonbox_low.ply', 0x6c63ff);
    createMeshViewer('axoncrossing-viewer', 'mesh/axoncrossing_low.ply', 0x6c63ff);
    createMeshViewer('somaprocess-viewer', 'mesh/soma_process.ply', 0x6c63ff);
    createMeshViewer('somabranching-viewer', 'mesh/soma_process_branching.ply', 0x6c63ff);
    document.querySelector('.mesh-inner').classList.add('visible');
}); 