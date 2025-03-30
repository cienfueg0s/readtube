(function() {
  'use strict';
  
  console.log('MeTube: Script loaded');
  
  let sidebarInitialized = false;
  let currentSettings = {
    darkMode: false,
    fontSize: 14,
    sidebarWidth: 350,
    sidebarHeight: 70,
    autoFetch: true
  };

  // Message handling from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('MeTube: Received message:', request.action);
    switch (request.action) {
      case 'checkTranscript':
        const transcriptContent = document.getElementById('metube-transcript-content');
        const hasTranscript = transcriptContent && 
          transcriptContent.querySelector('.transcript-line') !== null;
        sendResponse({ hasTranscript });
        break;
        
      case 'toggleSidebar':
        toggleSidebar();
        sendResponse({ success: true });
        break;
        
      case 'fetchTranscript':
        fetchTranscript().then(() => {
          chrome.runtime.sendMessage({ 
            action: 'transcriptStatus', 
            hasTranscript: true 
          });
        });
        sendResponse({ success: true });
        break;
        
      case 'showSettings':
        showSettings();
        sendResponse({ success: true });
        break;
    }
    return true;
  });

  // Load settings from storage
  async function loadSettings() {
    console.log('MeTube: Loading settings');
    try {
      const settings = await chrome.storage.local.get(null);
      currentSettings = {
        darkMode: settings.darkMode ?? false,
        fontSize: settings.fontSize ?? 14,
        sidebarWidth: settings.sidebarWidth ?? 350,
        sidebarHeight: settings.sidebarHeight ?? 70,
        autoFetch: settings.autoFetch ?? true
      };
      console.log('MeTube: Settings loaded:', currentSettings);
      if (sidebarInitialized) {
        applySettings();
      }
    } catch (error) {
      console.error('MeTube: Error loading settings:', error);
    }
  }

  function toggleSidebar() {
    console.log('MeTube: Toggling sidebar');
    const sidebar = document.getElementById('metube-sidebar-wrapper');
    if (sidebar) {
      const isHidden = sidebar.style.right === '-350px';
      sidebar.style.right = isHidden ? '0' : '-350px';
      console.log('MeTube: Sidebar visibility:', isHidden ? 'shown' : 'hidden');
    } else {
      console.log('MeTube: Sidebar element not found');
    }
  }

  // Basic initialization
  function initializeSidebar() {
    if (sidebarInitialized || !window.location.href.includes('youtube.com/watch')) {
      return;
    }
    
    createSidebar();
    sidebarInitialized = true;
  }

  // Watch for URL changes
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    if (lastUrl !== window.location.href) {
      lastUrl = window.location.href;
      sidebarInitialized = false;
      setTimeout(initializeSidebar, 1000);
    }
  }).observe(document.querySelector("title"), { 
    subtree: true, 
    characterData: true, 
    childList: true 
  });

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSidebar);
  } else {
    initializeSidebar();
  }

  function createChatInterface() {
    const chatContainer = document.createElement('div');
    chatContainer.className = 'metube-chat-container';

    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'metube-messages';
    messagesContainer.id = 'metube-messages';

    // Add welcome message
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'metube-message metube-system-message';
    welcomeMessage.innerHTML = `
      <div style="margin-bottom: 16px;">
        <strong>👋 Welcome to MeTube AI Chat!</strong>
      </div>
      <div style="margin-bottom: 12px;">
        I can help you with:
        <ul style="margin-top: 8px; margin-bottom: 8px; padding-left: 20px;">
          <li>Understanding complex topics from the video</li>
          <li>Finding specific information in the transcript</li>
          <li>Explaining technical concepts mentioned</li>
          <li>Summarizing key points</li>
        </ul>
      </div>
      <div style="margin-bottom: 16px;">
        <button id="fetch-transcript-btn" class="transcript-button primary" style="width: auto; margin: 0;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 5h12M9 3v4m1.5-2H21v18H3V3h7.5M9 19h6m-6-4h8" />
          </svg>
          Get Video Context
        </button>
      </div>
      <div style="color: #666; font-size: 13px;">
        To get started, make sure you've added your OpenAI API key in Settings.
      </div>
    `;
    messagesContainer.appendChild(welcomeMessage);

    // Add click handler for the fetch transcript button
    setTimeout(() => {
      const fetchBtn = document.getElementById('fetch-transcript-btn');
      if (fetchBtn) {
        fetchBtn.onclick = async () => {
          fetchBtn.disabled = true;
          fetchBtn.textContent = 'Loading...';
          
          try {
            // Create a temporary container for the transcript
            const tempContainer = document.createElement('div');
            tempContainer.id = 'metube-transcript-content';
            document.body.appendChild(tempContainer);
            
            // Fetch the transcript
            await fetchTranscript();
            
            // Get the transcript text
            const transcriptLines = tempContainer.querySelectorAll('.transcript-line');
            if (transcriptLines.length > 0) {
              const transcriptText = Array.from(transcriptLines)
                .map(line => {
                  const timestamp = line.querySelector('.transcript-timestamp').textContent;
                  const text = line.querySelector('.transcript-text').textContent;
                  return `[${timestamp}] ${text}`;
                })
                .join('\n');
              
              // Store the transcript in memory
              window.videoTranscript = transcriptText;
              
              // Add success message
              addMessageToChat('✅ Video transcript loaded! You can now ask questions about the video content.', 'system');
            } else {
              throw new Error('No transcript content found');
            }
            
            // Clean up
            document.body.removeChild(tempContainer);
          } catch (error) {
            addMessageToChat('❌ Failed to load transcript. Please try again or check if captions are available.', 'system');
          } finally {
            fetchBtn.disabled = false;
            fetchBtn.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 5h12M9 3v4m1.5-2H21v18H3V3h7.5M9 19h6m-6-4h8" />
              </svg>
              Get Video Context
            `;
          }
        };
      }
    }, 0);

    const inputContainer = document.createElement('div');
    inputContainer.className = 'metube-input-container';

    const textarea = document.createElement('textarea');
    textarea.className = 'metube-chat-input';
    textarea.placeholder = 'Ask about the video...';
    textarea.id = 'metube-chat-input';

    // Add enter key handling
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    const sendButton = document.createElement('button');
    sendButton.className = 'metube-send-button';
    sendButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
      </svg>
    `;
    sendButton.onclick = handleSendMessage;

    inputContainer.appendChild(textarea);
    inputContainer.appendChild(sendButton);
    chatContainer.appendChild(messagesContainer);
    chatContainer.appendChild(inputContainer);

    return chatContainer;
  }

  function createSidebar() {
    const sidebarWrapper = document.createElement('div');
    sidebarWrapper.id = 'metube-sidebar-wrapper';
    sidebarWrapper.style.position = 'fixed';
    sidebarWrapper.style.top = '60px';
    sidebarWrapper.style.right = '0';
    sidebarWrapper.style.zIndex = '9999';
    sidebarWrapper.style.borderRadius = '8px 0 0 8px';
    sidebarWrapper.style.transition = 'right 0.3s ease';
    sidebarWrapper.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
    sidebarWrapper.style.maxHeight = 'calc(100vh - 70px)';
    sidebarWrapper.style.background = '#ffffff';
    
    // Create sidebar container first
    const sidebarContainer = document.createElement('div');
    sidebarContainer.id = 'metube-sidebar-container';
    sidebarContainer.style.width = `${currentSettings.sidebarWidth}px`;
    sidebarContainer.style.height = `${currentSettings.sidebarHeight}vh`;
    sidebarContainer.style.display = 'flex';
    sidebarContainer.style.flexDirection = 'column';
    sidebarContainer.style.background = '#ffffff';
    
    // Create header with improved styling
    const header = document.createElement('div');
    header.className = 'metube-header';
    
    const title = document.createElement('div');
    title.className = 'metube-title';
    title.innerHTML = '<span class="metube-title-me">Me</span><span class="metube-title-tube">Tube</span>';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'metube-close-button';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = toggleSidebar;
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Create tabs with improved styling
    const tabs = document.createElement('div');
    tabs.className = 'metube-tabs';
    
    const transcriptTab = document.createElement('button');
    transcriptTab.className = 'metube-tab active';
    transcriptTab.textContent = 'Transcript';
    
    const aiChatTab = document.createElement('button');
    aiChatTab.className = 'metube-tab';
    aiChatTab.textContent = 'AI Chat';
    
    const settingsTab = document.createElement('button');
    settingsTab.className = 'metube-tab metube-tab-settings';
    settingsTab.textContent = 'Settings';
    
    transcriptTab.onclick = () => {
      updateActiveTab(transcriptTab);
      showTranscript();
    };
    
    aiChatTab.onclick = () => {
      updateActiveTab(aiChatTab);
      showAIChat();
    };
    
    settingsTab.onclick = () => {
      updateActiveTab(settingsTab);
      showSettings();
    };
    
    function updateActiveTab(activeTab) {
      tabs.querySelectorAll('.metube-tab').forEach(tab => {
        tab.classList.remove('active');
      });
      activeTab.classList.add('active');
    }
    
    tabs.appendChild(transcriptTab);
    tabs.appendChild(aiChatTab);
    tabs.appendChild(settingsTab);
    
    const mainContainer = document.createElement('div');
    mainContainer.id = 'metube-main-container';
    mainContainer.style.flex = '1';
    mainContainer.style.overflow = 'auto';
    mainContainer.style.background = '#ffffff';
    
    sidebarContainer.appendChild(header);
    sidebarContainer.appendChild(tabs);
    sidebarContainer.appendChild(mainContainer);
    sidebarWrapper.appendChild(sidebarContainer);
    
    document.body.appendChild(sidebarWrapper);
    
    // Initialize with transcript view
    showTranscript();
  }

  function applySettings() {
    const sidebar = document.getElementById('metube-sidebar-wrapper');
    const container = document.getElementById('metube-sidebar-container');
    const mainContainer = document.getElementById('metube-main-container');
    
    if (!sidebar || !container || !mainContainer) return;

    // Apply dark mode
    const bgColor = currentSettings.darkMode ? '#242424' : '#ffffff';
    const textColor = currentSettings.darkMode ? '#ffffff' : '#333333';
    const borderColor = currentSettings.darkMode ? '#444444' : '#dddddd';
    
    sidebar.style.background = bgColor;
    container.style.background = bgColor;
    mainContainer.style.background = bgColor;
    mainContainer.style.color = textColor;
    
    // Apply dimensions
    container.style.width = `${currentSettings.sidebarWidth}px`;
    container.style.height = `${currentSettings.sidebarHeight}vh`;
    
    // Apply font size
    mainContainer.style.fontSize = `${currentSettings.fontSize}px`;
    
    // Apply styles to transcript lines
    document.querySelectorAll('.transcript-line').forEach(line => {
      line.style.color = textColor;
      line.style.borderBottom = `1px solid ${borderColor}`;
    });
    
    // Apply styles to chat messages
    document.querySelectorAll('.metube-message').forEach(msg => {
      msg.style.color = textColor;
    });
  }

  function showTranscript() {
    const mainContainer = document.getElementById('metube-main-container');
    if (mainContainer) {
        mainContainer.innerHTML = '';
        mainContainer.appendChild(createTranscriptDisplay());
        // Auto-fetch transcript
        fetchTranscript();
    }
  }

  function showAIChat() {
    const mainContainer = document.getElementById('metube-main-container');
    if (mainContainer) {
      mainContainer.innerHTML = '';
      mainContainer.appendChild(createChatInterface());
    }
  }

  function showSettings() {
    const mainContainer = document.getElementById('metube-main-container');
    if (!mainContainer) return;
    
    mainContainer.innerHTML = '';
    
    const settingsContainer = document.createElement('div');
    settingsContainer.className = 'metube-settings-container';
    
    // AI Chat Settings Section
    const aiSection = document.createElement('div');
    aiSection.className = 'settings-section';
    
    const aiTitle = document.createElement('h3');
    aiTitle.textContent = 'AI Chat Settings';
    
    // API Key input with enhanced description
    const apiDescription = document.createElement('p');
    apiDescription.innerHTML = `
      <div style="margin-bottom: 20px; line-height: 1.5;">
        <div style="font-weight: 600; margin-bottom: 12px; font-size: 14px;">OpenAI API Key</div>
        <div style="color: #666; font-size: 14px;">
          To use the AI chat feature:
          <ol style="margin-top: 12px; margin-left: 20px;">
            <li>Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #ff0000;">OpenAI's website</a></li>
            <li>Enter your key below (starts with 'sk-')</li>
            <li>Click Save to securely store your key</li>
          </ol>
        </div>
      </div>
    `;
    
    const apiInput = document.createElement('input');
    apiInput.type = 'text';
    apiInput.placeholder = 'sk-...';
    apiInput.className = 'settings-input';
    
    // Load existing API key
    chrome.storage.local.get('openaiApiKey', (data) => {
      if (data.openaiApiKey) {
        apiInput.value = data.openaiApiKey;
      }
    });
    
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save API Key';
    saveButton.className = 'settings-save-button';
    
    saveButton.addEventListener('click', () => {
      const apiKey = apiInput.value.trim();
      if (!apiKey.startsWith('sk-')) {
        showNotification('Invalid API key format', 'error');
        return;
      }
      chrome.storage.local.set({ openaiApiKey: apiKey }, () => {
        showNotification('API key saved successfully');
      });
    });

    aiSection.appendChild(aiTitle);
    aiSection.appendChild(apiDescription);
    aiSection.appendChild(apiInput);
    aiSection.appendChild(saveButton);
    
    settingsContainer.appendChild(aiSection);
    mainContainer.appendChild(settingsContainer);
  }

  function handleSendMessage() {
    const textarea = document.getElementById('metube-chat-input');
    const message = textarea.value.trim();
    if (!message) return;

    // Add user message to chat
    addMessageToChat(message, 'user');
    textarea.value = '';

    // Send to OpenAI
    sendToOpenAI(message);
  }

  function addMessageToChat(message, type) {
    const messagesContainer = document.getElementById('metube-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `metube-message metube-${type}-message`;
    messageDiv.textContent = message;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  async function sendToOpenAI(message) {
    try {
        const { openaiApiKey } = await chrome.storage.local.get('openaiApiKey');
        if (!openaiApiKey) {
            addMessageToChat('⚠️ Please add your OpenAI API key in the Settings tab first.', 'system');
            return;
        }

        // Remove previous loading message if exists
        const messagesContainer = document.getElementById('metube-messages');
        const loadingMessage = messagesContainer.querySelector('.metube-message:last-child');
        if (loadingMessage?.textContent === 'Loading...') {
            messagesContainer.removeChild(loadingMessage);
        }
        
        addMessageToChat('Loading...', 'system');

        // Prepare the messages array with better context
        const messages = [
            {
                role: "system",
                content: "You are a helpful AI assistant analyzing a YouTube video. Keep your responses clear and concise."
            }
        ];
        
        // Add transcript context if available
        if (window.videoTranscript) {
            // Estimate token count (rough estimate: 1 token ≈ 4 chars)
            const transcriptTokens = Math.ceil(window.videoTranscript.length / 4);
            const messageTokens = Math.ceil(message.length / 4);
            const systemTokens = 100; // Approximate tokens for system messages
            const totalTokens = transcriptTokens + messageTokens + systemTokens;
            
            // Define model limits
            const MODEL_LIMITS = {
                'gpt-4-turbo-preview': 128000,
                'gpt-3.5-turbo-16k': 16000,
                'gpt-3.5-turbo': 4000
            };
            
            // Check if transcript exceeds all model limits
            if (totalTokens > MODEL_LIMITS['gpt-4-turbo-preview']) {
                addMessageToChat(`⚠️ This transcript is too large (approximately ${totalTokens.toLocaleString()} tokens) to process in a single request, even with GPT-4 Turbo (${MODEL_LIMITS['gpt-4-turbo-preview'].toLocaleString()} token limit). Please ask about specific parts of the video instead.`, 'system');
                return;
            }
            
            // Add full transcript as context
            messages.push({
                role: "system",
                content: `Here is the complete video transcript:\n\n${window.videoTranscript}\n\nPlease use this context to answer questions about the video content.`
            });
            
            // Add token usage warning if needed
            if (totalTokens > MODEL_LIMITS['gpt-3.5-turbo']) {
                messages.push({
                    role: "system",
                    content: `Note: This transcript is ${totalTokens.toLocaleString()} tokens. Will attempt GPT-4 Turbo first, then fall back to GPT-3.5-16k if unavailable.`
                });
            }
        } else {
            messages.push({
                role: "system",
                content: "No video transcript is loaded yet. You can only answer general questions."
            });
        }
        
        // Add the user's message
        messages.push({
            role: "user",
            content: message
        });

        // Try models in order of capability
        const models = [
            "gpt-4-turbo-preview",
            "gpt-3.5-turbo-16k",
            "gpt-3.5-turbo"
        ];

        let response;
        let modelIndex = 0;
        let success = false;

        while (!success && modelIndex < models.length) {
            const currentModel = models[modelIndex];
            try {
                response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openaiApiKey}`
                    },
                    body: JSON.stringify({
                        model: currentModel,
                        messages: messages,
                        temperature: 0.7,
                        max_tokens: 1000
                    })
                });

                if (response.ok) {
                    success = true;
                } else {
                    const errorData = await response.json();
                    if (errorData.error?.code === 'context_length_exceeded') {
                        // Try next model if context length exceeded
                        modelIndex++;
                        continue;
                    } else if (errorData.error?.code === 'model_not_available') {
                        modelIndex++;
                        continue;
                    }
                    throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
                }
            } catch (error) {
                if (error.message.includes('context_length_exceeded') || 
                    error.message.includes('model_not_available')) {
                    modelIndex++;
                    continue;
                }
                throw error;
            }
        }

        // Remove loading message
        const lastMessage = messagesContainer.querySelector('.metube-message:last-child');
        if (lastMessage?.textContent === 'Loading...') {
            messagesContainer.removeChild(lastMessage);
        }

        if (!success) {
            throw new Error('All available models failed to process the request. The transcript may be too long for your available models.');
        }

        const data = await response.json();
        if (!data.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from API');
        }
        
        // Add AI response
        addMessageToChat(data.choices[0].message.content, 'ai');
        
    } catch (error) {
        console.error('Chat error:', error);
        addMessageToChat(`❌ Error: ${error.message}. Please try again.`, 'system');
    }
  }

  function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'metube-notification';
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.padding = '10px 20px';
    notification.style.borderRadius = '4px';
    notification.style.zIndex = '10000';
    notification.style.color = '#ffffff';
    notification.style.background = type === 'success' ? 'rgba(0, 128, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  // Add the transcript-related functions
  async function fetchTranscript() {
    const transcriptContent = document.getElementById('metube-transcript-content');
    if (!transcriptContent) return;

    // Show loading state
    transcriptContent.innerHTML = '<div style="padding: 20px; text-align: center;">Loading transcript...</div>';

    try {
      // Get video ID from URL
      const urlParams = new URLSearchParams(window.location.search);
      const videoId = urlParams.get('v');
      if (!videoId) throw new Error('Could not find video ID');

      // Try to get the ytInitialData from the page
      const ytInitialData = window.ytInitialData || {};
      const playerResponse = window.ytInitialPlayerResponse || {};
      
      // Log data for debugging
      console.log('Attempting to fetch transcript for video:', videoId);
      
      // Try to get captions from player response
      const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!captions || captions.length === 0) {
        // Try alternative method using page source
        const pageSource = document.documentElement.innerHTML;
        const captionsMatch = pageSource.match(/"captionTracks":\[(.*?)\]/);
        
        if (!captionsMatch) {
          throw new Error('No captions data found in page source');
        }
        
        try {
          const captionsData = JSON.parse(`[${captionsMatch[1]}]`);
          if (captionsData.length > 0) {
            // Get the first available transcript URL
            const transcriptUrl = captionsData[0].baseUrl;
            await fetchAndDisplayTranscript(transcriptUrl, transcriptContent);
            return;
          }
        } catch (parseError) {
          console.error('Error parsing captions data:', parseError);
        }
      } else {
        // Use captions from player response
        const transcriptUrl = captions[0].baseUrl;
        await fetchAndDisplayTranscript(transcriptUrl, transcriptContent);
        return;
      }

      throw new Error('Could not find caption data');

    } catch (error) {
      console.error('Transcript error:', error);
      transcriptContent.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #666;">
          ${error.message}
          <br><br>
          <small>Debug info: Check console for details</small>
        </div>
      `;
    }
  }

  function createTranscriptDisplay() {
    const container = document.createElement('div');
    container.className = 'metube-transcript-container';
    
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'transcript-controls-container';
    
    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'search-wrapper';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'search-input';
    searchInput.placeholder = 'Search transcript...';
    searchInput.oninput = (e) => searchTranscript(e.target.value);
    
    const searchNav = document.createElement('div');
    searchNav.className = 'search-nav';
    
    const prevButton = document.createElement('button');
    prevButton.className = 'search-nav-button';
    prevButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7" /></svg>`;
    prevButton.onclick = () => navigateSearch('prev');
    
    const nextButton = document.createElement('button');
    nextButton.className = 'search-nav-button';
    nextButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" /></svg>`;
    nextButton.onclick = () => navigateSearch('next');
    
    const searchCounter = document.createElement('div');
    searchCounter.id = 'search-counter';
    searchCounter.className = 'search-counter';
    
    searchNav.appendChild(prevButton);
    searchNav.appendChild(searchCounter);
    searchNav.appendChild(nextButton);
    
    searchWrapper.appendChild(searchInput);
    searchWrapper.appendChild(searchNav);
    
    controlsContainer.appendChild(searchWrapper);
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'transcript-content-wrapper';
    
    // Add floating controls
    const floatingControls = document.createElement('div');
    floatingControls.className = 'transcript-floating-controls';
    
    const copyButton = document.createElement('button');
    copyButton.className = 'transcript-action-button';
    copyButton.title = 'Copy transcript';
    copyButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
      </svg>
    `;
    copyButton.onclick = () => {
      const transcriptText = Array.from(document.querySelectorAll('.transcript-line'))
        .map(line => {
          const timestamp = line.querySelector('.transcript-timestamp').textContent;
          const text = line.querySelector('.transcript-text').textContent;
          return `[${timestamp}] ${text}`;
        })
        .join('\n');
      
      navigator.clipboard.writeText(transcriptText).then(() => {
        copyButton.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        `;
        setTimeout(() => {
          copyButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
          `;
        }, 2000);
      });
    };
    
    const downloadButton = document.createElement('button');
    downloadButton.className = 'transcript-action-button';
    downloadButton.title = 'Download transcript';
    downloadButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `;
    downloadButton.onclick = () => {
      const transcriptText = Array.from(document.querySelectorAll('.transcript-line'))
        .map(line => {
          const timestamp = line.querySelector('.transcript-timestamp').textContent;
          const text = line.querySelector('.transcript-text').textContent;
          return `[${timestamp}] ${text}`;
        })
        .join('\n');
      
      const blob = new Blob([transcriptText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transcript.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      downloadButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      `;
      setTimeout(() => {
        downloadButton.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        `;
      }, 2000);
    };
    
    floatingControls.appendChild(copyButton);
    floatingControls.appendChild(downloadButton);
    contentWrapper.appendChild(floatingControls);
    
    const transcriptContent = document.createElement('div');
    transcriptContent.id = 'metube-transcript-content';
    
    contentWrapper.appendChild(transcriptContent);
    
    container.appendChild(controlsContainer);
    container.appendChild(contentWrapper);
    
    return container;
  }

  function searchTranscript(query) {
    const content = document.getElementById('metube-transcript-content');
    const searchCounter = document.getElementById('search-counter');
    if (!content) return;
    
    if (!query) {
      // Reset search
      content.querySelectorAll('.transcript-line').forEach(line => {
        const text = line.querySelector('.transcript-text');
        if (text) text.innerHTML = text.textContent;
        line.classList.remove('search-match');
      });
      if (searchCounter) searchCounter.textContent = '';
      return;
    }
    
    let matchCount = 0;
    let currentMatch = 0;
    const matches = [];
    
    content.querySelectorAll('.transcript-line').forEach(line => {
      const text = line.querySelector('.transcript-text');
      if (!text) return;
      
      const originalText = text.textContent;
      const regex = new RegExp(query, 'gi');
      const matches = originalText.match(regex);
      
      if (matches) {
        matchCount += matches.length;
        line.classList.add('search-match');
        text.innerHTML = originalText.replace(regex, match => 
          `<span class="search-highlight">${match}</span>`
        );
      } else {
        line.classList.remove('search-match');
        text.innerHTML = originalText;
      }
    });
    
    // Update counter
    if (searchCounter) {
      searchCounter.textContent = matchCount > 0 ? `${currentMatch + 1} of ${matchCount} matches` : 'No matches found';
    }
    
    // Scroll to first match
    if (matchCount > 0) {
      const firstMatch = content.querySelector('.search-match');
      if (firstMatch) {
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  // Add navigation functions
  function navigateSearch(direction) {
    const content = document.getElementById('metube-transcript-content');
    const searchCounter = document.getElementById('search-counter');
    if (!content || !searchCounter) return;
    
    const matches = Array.from(content.querySelectorAll('.search-match'));
    if (matches.length === 0) return;
    
    const currentText = document.querySelector('.search-input').value;
    if (!currentText) return;
    
    const currentMatchIndex = matches.findIndex(match => 
      match.getBoundingClientRect().top >= 0
    );
    
    let nextIndex;
    if (direction === 'next') {
      nextIndex = (currentMatchIndex + 1) % matches.length;
    } else {
      nextIndex = currentMatchIndex > 0 ? currentMatchIndex - 1 : matches.length - 1;
    }
    
    matches[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchCounter.textContent = `${nextIndex + 1} of ${matches.length} matches`;
  }

  async function fetchAndDisplayTranscript(transcriptUrl, container) {
    try {
      const urlWithParams = `${transcriptUrl}&fmt=json3`;
      const response = await fetch(urlWithParams);
      const data = await response.json();
      
      container.innerHTML = '';
      
      let currentText = '';
      let lastTimestamp = 0;
      let lastTime = 0;
      let isFirstLine = true;
      
      data.events.forEach((event, index) => {
        if (!event.segs) return;
        
        const time = event.tStartMs / 1000;
        const text = event.segs.map(seg => seg.utf8).join('').trim();
        
        if (!text) return; // Skip empty text
        
        // Special handling for the first line
        if (isFirstLine) {
          // Only show 0:00 if there's content after 0.5 seconds
          // This helps avoid showing 0:00 for pre-roll silence
          if (time < 0.5) {
            currentText = text;
            lastTimestamp = 0;
            lastTime = time;
            isFirstLine = false;
            return;
          }
          isFirstLine = false;
        }
        
        // Add to current text if less than 10 seconds have passed
        if (time - lastTime < 10 && index !== data.events.length - 1) {
          currentText += ' ' + text;
          return;
        }
        
        // Create line if we have accumulated text or it's been 10+ seconds
        if (currentText || time - lastTime >= 10 || index === data.events.length - 1) {
          // Add current event's text if this is the last one
          if (index === data.events.length - 1) {
            currentText += ' ' + text;
          }
          
          const lineDiv = document.createElement('div');
          lineDiv.className = 'transcript-line';
          
          const timestamp = document.createElement('span');
          timestamp.className = 'transcript-timestamp';
          timestamp.textContent = formatTime(lastTimestamp);
          timestamp.setAttribute('data-time', lastTimestamp.toFixed(3));
          
          // Enhanced click handler with proper time seeking
          timestamp.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const video = document.querySelector('video');
            if (video) {
              const timeInSeconds = parseFloat(timestamp.getAttribute('data-time'));
              if (!isNaN(timeInSeconds)) {
                video.currentTime = timeInSeconds;
                // Visual feedback
                timestamp.style.backgroundColor = '#ff0000';
                timestamp.style.color = '#ffffff';
                setTimeout(() => {
                  timestamp.style.backgroundColor = '';
                  timestamp.style.color = '';
                }, 300);
              }
            }
          };
          
          const textSpan = document.createElement('span');
          textSpan.className = 'transcript-text';
          textSpan.textContent = currentText.trim();
          
          lineDiv.appendChild(timestamp);
          lineDiv.appendChild(textSpan);
          container.appendChild(lineDiv);
          
          // Reset for next line
          currentText = text;
          lastTimestamp = time;
        }
        
        lastTime = time;
      });
    } catch (error) {
      throw new Error(`Failed to fetch transcript: ${error.message}`);
    }
  }

  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

})();