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

    // Create frustum for culling
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();

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

    let mesh = null;
    let boundingBox = null;
    let isViewerVisible = false;

    // Create intersection observer for the viewer container
    const viewerObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            isViewerVisible = entry.isIntersecting;
            // Only enable auto-rotate and rendering when the viewer is visible
            controls.autoRotate = isViewerVisible;
            if (mesh) {
                mesh.visible = isViewerVisible;
            }
            // If viewer becomes invisible, stop rendering
            if (!isViewerVisible) {
                renderer.setAnimationLoop(null);
            } else {
                renderer.setAnimationLoop(animate);
            }
        });
    }, {
        threshold: 0 // Trigger as soon as any part of the viewer enters/exits the viewport
    });

    // Start observing the viewer container
    viewerObserver.observe(container);

    // Load mesh
    const loader = new PLYLoader();
    loader.load(plyPath, geometry => {
        geometry.computeBoundingBox();
        geometry.center();
        const size = geometry.boundingBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        const material = new THREE.MeshPhongMaterial({ color, shininess: 30 });
        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // Store bounding box for culling
        boundingBox = new THREE.Box3().setFromObject(mesh);

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

        // Start animation loop if viewer is visible
        if (isViewerVisible) {
            renderer.setAnimationLoop(animate);
        }
    });

    // Responsive
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    // Animation loop
    function animate() {
        controls.update();

        // Only perform frustum culling if the viewer is visible
        if (isViewerVisible && mesh && boundingBox) {
            projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            frustum.setFromProjectionMatrix(projScreenMatrix);

            // Check if mesh is in view frustum
            const isInFrustum = frustum.intersectsBox(boundingBox);
            mesh.visible = isInFrustum;
        }

        renderer.render(scene, camera);
    }
}

// --- AI Chat Assistant Logic ---

// Configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'qwen/qwen-2.5-coder-32b-instruct';

// Check for API key (Consider a more secure way to handle API keys in production)
const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) {
    console.error('OpenRouter API key is not set. Please set the OPENROUTER_API_KEY environment variable.');
    // Optionally display an error message in the chat UI itself
}

// DOM Elements
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');

// Message history
let messageHistory = [
    {
        role: 'system',
        content: 'You are a helpful AI coding assistant. You provide clear, concise, and accurate responses to programming-related questions.'
    }
];

// Function to format code blocks in messages
function formatMessage(content) {
    // Replace code blocks with formatted HTML
    return content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
        // Basic HTML escaping for the code content
        const escapedCode = code.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        return `<div class="code-block">${escapedCode}</div>`;
    });
}

// Function to add a message to the chat
function addMessage(content, isUser = false) {
    if (!chatMessages) return; // Check if chat container exists

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.innerHTML = formatMessage(content); // Use innerHTML to render formatted content
    
    messageDiv.appendChild(messageContent);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageDiv;
}

// Function to handle streaming response
async function handleStreamResponse(response, messageDiv) {
    const messageContent = messageDiv.querySelector('.message-content');
    let accumulatedContent = '';
    
    // Add typing indicator dots - ensure messageContent is clear first if it had temporary dots
     messageContent.innerHTML = ''; // Clear placeholder/dots if any
    const typingDotsSpan = document.createElement('span');
    typingDotsSpan.className = 'typing-dots';
    typingDotsSpan.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    messageContent.appendChild(typingDotsSpan);

    try {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices[0]?.delta?.content || '';
                        if (content) {
                            accumulatedContent += content;
                             // Update content, keeping dots until done
                            messageContent.innerHTML = formatMessage(accumulatedContent) + '<span class="typing-dots"></span>';
                            if (messageContent.querySelector('.typing-dots')) { // Ensure dots are still there before trying to append
                                messageContent.querySelector('.typing-dots').innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
                            }
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        }
                    } catch (e) {
                        console.error('Error parsing streaming data:', e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error reading stream:', error);
        messageContent.innerHTML = formatMessage(accumulatedContent) + '<br><span style="color: red;">Error: Stream interrupted</span>';
    }
    
    // Remove typing indicator dots
    const dots = messageContent.querySelector('.typing-dots');
    if(dots) {
        dots.remove();
    }
     messageContent.innerHTML = formatMessage(accumulatedContent); // Final render without dots

    return accumulatedContent;
}

// Function to send message to OpenRouter API
async function sendToOpenRouter(message) {
     if (!chatMessages) return; // Check if chat container exists

    try {
        // Add user message to chat
        addMessage(message, true);
        
        // Create bot message placeholder
        const botMessageDiv = addMessage('', false);
        const messageContent = botMessageDiv.querySelector('.message-content');
        
        // Ensure message history is properly formatted
        const currentMessages = messageHistory.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        const requestBody = {
            model: MODEL,
            provider: {
                only: ["nebius/fp8"]
            },
            messages: [...currentMessages, { role: 'user', content: message }],
            temperature: 0.7,
            max_tokens: 1000,
            stream: true
        };

        // Make the streaming request
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'AI Chat Assistant'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Handle the streaming response
        const botResponse = await handleStreamResponse(response, botMessageDiv);
        
        // Update message history
        messageHistory.push({ role: 'user', content: message });
        messageHistory.push({ role: 'assistant', content: botResponse });
        
    } catch (error) {
        console.error('Error:', error);
        let errorMessage = 'Sorry, I encountered an error while processing your request.';
        if (error.response) {
            console.error('API Error Response:', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data,
                headers: error.response.headers
            });
            errorMessage = `Error: ${error.response.status} - ${error.response.data?.error?.message || 'Unknown error'}`;
        } else if (error.request) {
            console.error('No response received:', error.request);
            errorMessage = 'Error: No response received from the server. Please check your internet connection.';
        } else {
            console.error('Error setting up request:', error.message);
        }
        addMessage(errorMessage);
    } finally {
        // Re-enable input
         if(chatInput) chatInput.disabled = false;
         if(sendButton) sendButton.disabled = false;
         if(chatInput) chatInput.focus();
    }
}

// Event Listeners
// Add event listeners after the DOM is fully loaded
window.addEventListener('DOMContentLoaded', () => {
    // Existing Three.js setup
    createMeshViewer('axon-viewer', 'mesh/axon.ply', 0x6c63ff);
    createMeshViewer('soma-viewer', 'mesh/soma.ply', 0x6c63ff);
    createMeshViewer('axonbox-viewer', 'mesh/axonbox_low.ply', 0x6c63ff);
    createMeshViewer('axoncrossing-viewer', 'mesh/axoncrossing_low.ply', 0x6c63ff);
    createMeshViewer('somaprocess-viewer', 'mesh/soma_process.ply', 0x6c63ff);
    createMeshViewer('somabranching-viewer', 'mesh/soma_process_branching.ply', 0x6c63ff);
    
    // Add visible class to mesh and dmri sections when they come into view
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.1
    });

    document.querySelector('.mesh-inner')?.classList.add('visible');
    const dmriInner = document.querySelector('.dmri-inner');
    if (dmriInner) {
        observer.observe(dmriInner);
    }

    // Chat Assistant Initialization
    if (chatInput && sendButton) {
        // Add welcome message when the page loads
        addMessage("Hello! I'm your AI coding assistant. How can I help you today?", false);

        sendButton.addEventListener('click', async () => {
            const message = chatInput.value.trim();
            if (!message) return;

            // Clear input and disable it while processing
            chatInput.value = '';
            chatInput.disabled = true;
            sendButton.disabled = true;
            
            await sendToOpenRouter(message);
            
            // Re-enable input is handled in finally block of sendToOpenRouter
        });

        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendButton.click();
            }
        });

        // Focus input on page load
        chatInput.focus();
    }
}); 