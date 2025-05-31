import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

// ---------- MESH VIEWER (unchanged) ----------
function createMeshViewer(containerId, plyPath, color = 0x2d2d8f) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f7fa);
  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const frustum = new THREE.Frustum();
  const projScreenMatrix = new THREE.Matrix4();

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2, 2, 2);
  scene.add(dirLight);

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

  const viewerObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      isViewerVisible = entry.isIntersecting;
      controls.autoRotate = isViewerVisible;
      if (mesh) mesh.visible = isViewerVisible;

      if (!isViewerVisible) {
        renderer.setAnimationLoop(null);
      } else {
        renderer.setAnimationLoop(animate);
      }
    });
  }, { threshold: 0 });

  viewerObserver.observe(container);

  const loader = new PLYLoader();
  loader.load(plyPath, geometry => {
    geometry.computeBoundingBox();
    geometry.center();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    const material = new THREE.MeshPhongMaterial({ color, shininess: 30 });
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    boundingBox = new THREE.Box3().setFromObject(mesh);

    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size2 = box.getSize(new THREE.Vector3());
    const maxDim2 = Math.max(size2.x, size2.y, size2.z);
    const fov = camera.fov * (Math.PI / 180);
    const cameraDistance = Math.abs(maxDim2 / Math.sin(fov / 2));

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

    controls.target.copy(center);
    controls.update();

    if (isViewerVisible) {
      renderer.setAnimationLoop(animate);
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  function animate() {
    controls.update();

    if (isViewerVisible && mesh && boundingBox) {
      projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreenMatrix);
      const isInFrustum = frustum.intersectsBox(boundingBox);
      mesh.visible = isInFrustum;
    }

    renderer.render(scene, camera);
  }
}

// ---------- AI CHAT ASSISTANT WITH LaTeX SUPPORT ----------
// Configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'qwen/qwen-2.5-coder-32b-instruct';
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error('OpenRouter API key is not set. Please set the OPENROUTER_API_KEY environment variable.');
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

/**
 * formatMessage(content):
 *   1) Runs `marked()` to turn Markdown (including code fences, bullet lists, and inline LaTeX delimiters) → HTML.
 *   2) Returns raw HTML string (do NOT escape `$...$`, since MathJax will handle it).
 */
function formatMessage(content) {
  // We use marked() to convert Markdown → HTML.
  // marked() will leave `$…$` and `$$…$$` intact (because MathJax will parse it).
  const html = marked.parse(content);
  return html;
}

/**
 * addMessage(content, isUser):
 *   - Creates a new message DIV
 *   - Inserts the Markdown→HTML via formatMessage()
 *   - Calls MathJax.typesetPromise() on that new DIV to render any LaTeX.
 */
function addMessage(content, isUser = false) {
  if (!chatMessages) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;

  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';

  // Insert our converted HTML
  messageContent.innerHTML = formatMessage(content);

  messageDiv.appendChild(messageContent);
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Ask MathJax to typeset only this new fragment:
  if (window.MathJax && window.MathJax.typesetPromise) {
    // Pass the specific DOM node so MathJax only processes that node
    MathJax.typesetPromise([messageContent]).catch((err) => console.error('MathJax typeset failed: ', err));
  }

  return messageDiv;
}

/**
 * handleStreamResponse(response, messageDiv):
 *   - Streams token-by-token from OpenRouter
 *   - Buffers content in `accumulatedContent`
 *   - After the stream ends, renders final content and re-typesets LaTeX.
 */
async function handleStreamResponse(response, messageDiv) {
  const messageContent = messageDiv.querySelector('.message-content');
  let accumulatedContent = '';

  // Clear placeholder/dots
  messageContent.innerHTML = '';
  const typingDotsSpan = document.createElement('span');
  typingDotsSpan.className = 'typing-dots';
  typingDotsSpan.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
  messageContent.appendChild(typingDotsSpan);

  // Helper function for smooth scrolling
  const scrollToBottom = () => {
    if (!chatMessages) return;
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: 'smooth'
      });
    });
  };

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
              // Update content and scroll
              messageContent.innerHTML = formatMessage(accumulatedContent) + '<span class="typing-dots"></span>';
              scrollToBottom();
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
    scrollToBottom();
  }

  // Remove typing indicator dots
  const dots = messageContent.querySelector('.typing-dots');
  if (dots) dots.remove();

  // Final render without dots
  messageContent.innerHTML = formatMessage(accumulatedContent);
  scrollToBottom();

  // Typeset final LaTeX and scroll one more time after typesetting
  if (window.MathJax && window.MathJax.typesetPromise) {
    await MathJax.typesetPromise([messageContent]).catch((err) => console.error('MathJax typeset failed:', err));
    scrollToBottom();
  }

  return accumulatedContent;
}

/**
 * sendToOpenRouter(message):
 *   - Appends the user's message
 *   - Sends a streaming request
 *   - Renders the streaming assistant's response (including LaTeX)
 */
async function sendToOpenRouter(message) {
  if (!chatMessages) return;

  try {
    // Add user message
    addMessage(message, true);

    // Create bot placeholder
    const botMessageDiv = addMessage('', false);
    const messageContent = botMessageDiv.querySelector('.message-content');

    // Compose request body
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

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'AI Coding Assistant'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Handle the streaming response
    const botResponse = await handleStreamResponse(response, botMessageDiv);

    // Update history
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
    if (chatInput) chatInput.disabled = false;
    if (sendButton) sendButton.disabled = false;
    if (chatInput) chatInput.focus();
  }
}

// Add debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Event Listeners
window.addEventListener('DOMContentLoaded', () => {
  // Add scroll event listener for navigation bar
  const mainNav = document.querySelector('.main-nav');
  const scrollThreshold = 400; // pixels from top to trigger the change
  let isScrolled = false;

  const handleScroll = debounce(() => {
    const shouldBeScrolled = window.scrollY > scrollThreshold;
    if (shouldBeScrolled !== isScrolled) {
      isScrolled = shouldBeScrolled;
      if (isScrolled) {
        mainNav.classList.add('scrolled');
      } else {
        mainNav.classList.remove('scrolled');
      }
    }
  }, 100); // 100ms debounce time

  window.addEventListener('scroll', handleScroll);

  // Initialize all your mesh viewers (exactly as before)
  createMeshViewer('axon-viewer', 'mesh/axon.ply', 0x6c63ff);
  createMeshViewer('soma-viewer', 'mesh/soma.ply', 0x6c63ff);
  createMeshViewer('axonbox-viewer', 'mesh/axonbox_low.ply', 0x6c63ff);
  createMeshViewer('axoncrossing-viewer', 'mesh/axoncrossing_low.ply', 0x6c63ff);
  createMeshViewer('somaprocess-viewer', 'mesh/soma_process.ply', 0x6c63ff);
  createMeshViewer('somabranching-viewer', 'mesh/soma_process_branching.ply', 0x6c63ff);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });

  document.querySelector('.mesh-inner')?.classList.add('visible');
  const dmriInner = document.querySelector('.dmri-inner');
  if (dmriInner) {
    observer.observe(dmriInner);
  }

  // Chat Assistant Initialization
  if (chatInput && sendButton) {
    addMessage("Hello! I'm your AI coding assistant. How can I help you today?", false);

    sendButton.addEventListener('click', async () => {
      const message = chatInput.value.trim();
      if (!message) return;

      chatInput.value = '';
      chatInput.disabled = true;
      sendButton.disabled = true;

      await sendToOpenRouter(message);
    });

    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendButton.click();
      }
    });
  }
});
