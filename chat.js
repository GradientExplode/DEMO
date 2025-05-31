import axios from 'axios';
import marked from 'marked';

// ====================== CONFIGURATION ======================
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'qwen/qwen-2.5-coder-32b-instruct';

// Make sure the VITE_OPENROUTER_API_KEY is set in your environment
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error('OpenRouter API key is not set. Please set the VITE_OPENROUTER_API_KEY environment variable.');
  document.body.innerHTML = `
    <div style="color: red; padding: 20px; text-align: center;">
      <h2>Configuration Error</h2>
      <p>OpenRouter API key is not set. Please set the VITE_OPENROUTER_API_KEY environment variable.</p>
    </div>
  `;
  throw new Error('OpenRouter API key is not set');
}

// ====================== DOM ELEMENTS ======================
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');

// ====================== MESSAGE HISTORY ======================
let messageHistory = [
  {
    role: 'system',
    content: 'You are a helpful AI coding assistant. You provide clear, concise, and accurate responses to programming-related questions.'
  }
];

// Show a welcome message on load
addMessage("Hello! I'm your AI coding assistant. How can I help you today?", false);

// ====================== MARKED.JS OPTIONS ======================
marked.setOptions({
  gfm: true,
  breaks: true,       // Support GFM line breaks
  headerIds: false,   // Avoid auto‐generated header IDs
  mangle: false,      // Don't mangle HTML entities in headings
  sanitize: false     // We’ll manually sanitize
});

// ====================== MATHJAX CONFIG (already in HTML) ======================
// window.MathJax was configured in index.html before loading this script.

// ====================== SANITIZATION HELPER ======================
function sanitizeHTML(html) {
  const temp = document.createElement('div');
  temp.textContent = html;
  return temp.innerHTML;
}

// ====================== FORMAT MESSAGE (Markdown + LaTeX) ======================
function formatMessage(content) {
  // 1) Escape any raw HTML
  content = sanitizeHTML(content);

  // 2) Extract and render fenced code blocks manually so Markdown inside them isn't re-parsed
  //    We turn each ```lang\n code ``` into a <pre><code class="code-block">escaped code</code></pre>.
  content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const escaped = code.trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    // You can also add a data‐attribute for the language if you want syntax‐highlighting later:
    // return `<pre><code class="language-${lang || ''} code-block">${escaped}</code></pre>`;
    return `<div class="code-block"><pre><code>${escaped}</code></pre></div>`;
  });

  // 3) Inline code: `someCodeHere`
  content = content.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 4) Convert LaTeX delimiters to MathJax syntax
  //    Inline: $...$ → \( ... \)
  content = content.replace(/\$([^\$]+)\$/g, '\\($1\\)');
  //    Display: $$...$$ → \[ ... \]
  content = content.replace(/\$\$([\s\S]+?)\$\$/g, '\\[$1\\]');

  // 5) Now let Marked.js turn the (escaped + math‐wrapped) content into HTML
  let html = marked.parse(content);

  // 6) Add a class to any <pre><code> that Marked generated, for styling
  html = html.replace(/<pre><code>/g, '<pre><code class="code-block">');

  return html;
}

// ====================== RENDER MATH IN A CONTAINER ======================
function renderMathInMessage(containerEl) {
  if (window.MathJax) {
    MathJax.typesetPromise([containerEl]).catch((err) => {
      console.error('MathJax typeset error:', err);
    });
  }
}

// ====================== ADD A CHAT MESSAGE TO THE DOM ======================
function addMessage(content, isUser = false) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${isUser ? 'user-message' : 'bot-message'}`;

  const inner = document.createElement('div');
  inner.className = 'message-content';

  // Convert raw content → sanitized HTML (with Markdown + LaTeX wrappers)
  inner.innerHTML = formatMessage(content);

  wrapper.appendChild(inner);
  chatMessages.appendChild(wrapper);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Tell MathJax to process the newly added node
  renderMathInMessage(inner);

  return wrapper;
}

// ====================== HANDLE STREAMING RESPONSE FROM OPENROUTER ======================
async function handleStreamResponse(response, botMessageDiv) {
  const messageContentDiv = botMessageDiv.querySelector('.message-content');
  let accumulated = '';

  // Show a simple “typing…” indicator (three animated dots)
  messageContentDiv.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      // The stream is newline‐delimited JSON: each line begins with “data: { … }”
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta?.content || '';
            if (delta) {
              accumulated += delta;
              // Re‐format and re‐insert the entire “accumulated” text on each update
              messageContentDiv.innerHTML = formatMessage(accumulated);
              renderMathInMessage(messageContentDiv);
              chatMessages.scrollTop = chatMessages.scrollHeight;
            }
          } catch (e) {
            console.error('Error parsing chunked JSON:', e);
          }
        }
      }
    }
  } catch (err) {
    console.error('Stream read error:', err);
    // Show partial content + error note
    messageContentDiv.innerHTML = formatMessage(accumulated) +
      '<br><span style="color: red;">Error: Stream interrupted</span>';
  }

  // Final MathJax render (in case any \[…\] was split across two chunks)
  renderMathInMessage(messageContentDiv);
  return accumulated;
}

// ====================== SEND A MESSAGE TO THE OPENROUTER API ======================
async function sendToOpenRouter(messageText) {
  try {
    // 1) Show user’s message in the chat
    addMessage(messageText, true);

    // 2) Create an empty bot bubble that we will stream into
    const botBubble = addMessage('', false);

    // 3) Build request payload (including the full message history)
    const payload = {
      model: MODEL,
      provider: { only: ['nebius/fp8'] },
      messages: [
        ...messageHistory,
        { role: 'user', content: messageText }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      stream: true
    };

    // 4) Fire off the fetch with streaming enabled
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'AI Chat Assistant'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 5) Stream chunks and update the bot bubble live
    const botText = await handleStreamResponse(response, botBubble);

    // 6) Update history once the entire bot response is in
    messageHistory.push({ role: 'user', content: messageText });
    messageHistory.push({ role: 'assistant', content: botText });
  } catch (error) {
    console.error('Error in sendToOpenRouter:', error);
    let errMsg = 'Sorry, I encountered an error while processing your request.';
    if (error.response) {
      errMsg = `Error: ${error.response.status} – ${error.response.statusText}`;
    } else if (error.request) {
      errMsg = 'Error: No response from server. Check your internet connection.';
    }
    addMessage(errMsg);
  }
}

// ====================== WIRE UP “Send” BUTTON & ENTER KEY ======================
sendButton.addEventListener('click', async () => {
  const text = chatInput.value.trim();
  if (!text) return;

  // Disable input until the response completes
  chatInput.value = '';
  chatInput.disabled = true;
  sendButton.disabled = true;

  await sendToOpenRouter(text);

  // Re‐enable
  chatInput.disabled = false;
  sendButton.disabled = false;
  chatInput.focus();
});

// Also send on Enter (but not if Shift+Enter)
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendButton.click();
  }
});

// Ensure the input is focused when the page loads
chatInput.focus();

// ====================== OPTIONAL: DRAW CONNECTION LINES (from your original HTML) ======================
function updateAxonBranchLines() {
  const base = document.getElementById('axon-base-block');
  const box = document.getElementById('axon-box-block');
  const crossing = document.getElementById('axon-crossing-block');
  const soma = document.getElementById('soma-base-block');
  const somaProcess = document.getElementById('soma-process-block');
  const somaBranching = document.getElementById('soma-branching-block');
  const svg = document.getElementById('axon-branch-svg');
  if (!base || !box || !crossing || !soma || !somaProcess || !somaBranching || !svg) return;

  const parentRect = svg.parentElement.getBoundingClientRect();
  const baseRect = base.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  const crossingRect = crossing.getBoundingClientRect();
  const somaRect = soma.getBoundingClientRect();
  const somaProcessRect = somaProcess.getBoundingClientRect();
  const somaBranchingRect = somaBranching.getBoundingClientRect();

  const arrowSize = 8;

  const axonStart = {
    x: baseRect.right - parentRect.left,
    y: baseRect.top + baseRect.height / 2 - parentRect.top
  };
  const axonBoxStart = {
    x: boxRect.right - parentRect.left,
    y: boxRect.top + boxRect.height / 2 - parentRect.top
  };
  const axonBoxEnd = {
    x: boxRect.left - parentRect.left,
    y: boxRect.top + boxRect.height / 2 - parentRect.top
  };
  const axonCrossingEnd = {
    x: crossingRect.left - parentRect.left,
    y: crossingRect.top + crossingRect.height / 2 - parentRect.top
  };

  const somaStart = {
    x: somaRect.right - parentRect.left,
    y: somaRect.top + somaRect.height / 2 - parentRect.top
  };
  const somaProcessStart = {
    x: somaProcessRect.right - parentRect.left,
    y: somaProcessRect.top + somaProcessRect.height / 2 - parentRect.top
  };
  const somaProcessEnd = {
    x: somaProcessRect.left - parentRect.left,
    y: somaProcessRect.top + somaProcessRect.height / 2 - parentRect.top
  };
  const somaBranchingEnd = {
    x: somaBranchingRect.left - parentRect.left,
    y: somaBranchingRect.top + somaBranchingRect.height / 2 - parentRect.top
  };

  const axonBoxAngle = Math.atan2(
    axonBoxEnd.y - axonStart.y,
    axonBoxEnd.x - axonStart.x
  );
  const axonCrossingAngle = Math.atan2(
    axonCrossingEnd.y - axonBoxStart.y,
    axonCrossingEnd.x - axonBoxStart.x
  );
  const somaProcessAngle = Math.atan2(
    somaProcessEnd.y - somaStart.y,
    somaProcessEnd.x - somaStart.x
  );
  const somaBranchingAngle = Math.atan2(
    somaBranchingEnd.y - somaProcessStart.y,
    somaBranchingEnd.x - somaProcessStart.x
  );

  const createArrowHead = (endX, endY, angle) => {
    const x1 = endX - arrowSize * Math.cos(angle - Math.PI / 6);
    const y1 = endY - arrowSize * Math.sin(angle - Math.PI / 6);
    const x2 = endX - arrowSize * Math.cos(angle + Math.PI / 6);
    const y2 = endY - arrowSize * Math.sin(angle + Math.PI / 6);
    return `M ${endX} ${endY} L ${x1} ${y1} L ${x2} ${y2} Z`;
  };

  svg.setAttribute('width', parentRect.width);
  svg.setAttribute('height', parentRect.height);
  svg.innerHTML = `
    <!-- Axon connections -->
    <path
      d="M ${axonStart.x} ${axonStart.y} L ${axonBoxEnd.x} ${axonBoxEnd.y}"
      stroke="#2d2d8f"
      stroke-width="2.5"
      fill="none" />
    <path
      d="${createArrowHead(axonBoxEnd.x, axonBoxEnd.y, axonBoxAngle)}"
      fill="#2d2d8f" />
    <path
      d="M ${axonBoxStart.x} ${axonBoxStart.y} L ${axonCrossingEnd.x} ${axonCrossingEnd.y}"
      stroke="#2d2d8f"
      stroke-width="2.5"
      fill="none" />
    <path
      d="${createArrowHead(axonCrossingEnd.x, axonCrossingEnd.y, axonCrossingAngle)}"
      fill="#2d2d8f" />

    <!-- Soma connections -->
    <path
      d="M ${somaStart.x} ${somaStart.y} L ${somaProcessEnd.x} ${somaProcessEnd.y}"
      stroke="#6c63ff"
      stroke-width="2.5"
      fill="none" />
    <path
      d="${createArrowHead(somaProcessEnd.x, somaProcessEnd.y, somaProcessAngle)}"
      fill="#6c63ff" />
    <path
      d="M ${somaProcessStart.x} ${somaProcessStart.y} L ${somaBranchingEnd.x} ${somaBranchingEnd.y}"
      stroke="#6c63ff"
      stroke-width="2.5"
      fill="none" />
    <path
      d="${createArrowHead(somaBranchingEnd.x, somaBranchingEnd.y, somaBranchingAngle)}"
      fill="#6c63ff" />
  `;
}

window.addEventListener('DOMContentLoaded', updateAxonBranchLines);
window.addEventListener('resize', updateAxonBranchLines);
setTimeout(updateAxonBranchLines, 500);

