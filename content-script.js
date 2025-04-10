(function() {
  'use strict';
  
  console.log('ReadTube: Script loaded');
  
  let sidebarInitialized = false;
  let currentSettings = {
    darkMode: false,
    fontSize: 14,
    sidebarWidth: 385,
    sidebarHeight: 70,
    autoFetch: true
  };

  // Add this near the top of the file with other global variables
  let openaiApiKey = null;

  // Add this after loadSettings()
  async function loadApiKey() {
      try {
          const data = await chrome.storage.local.get('openaiApiKey');
          openaiApiKey = data.openaiApiKey;
          console.log('ReadTube: API key loaded:', openaiApiKey ? 'Present' : 'Not set');
          updateAiStatus();
      } catch (error) {
          console.error('ReadTube: Error loading API key:', error);
      }
  }

  // Message listener for popup and extension communication
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'isSidebarOpen':
            const sidebar = document.getElementById('readtube-sidebar');
            sendResponse({ isOpen: sidebar && sidebar.style.right === '0px' });
            break;

        case 'toggleSidebar':
            toggleSidebar(request.openFromPopup);
            if (request.openFromPopup) {
                showTranscript(); // Ensure transcript tab is shown when opened from popup
            }
            sendResponse({ success: true });
            break;

        case 'getVideoInfo':
            const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer');
            sendResponse({ 
                title: titleElement ? titleElement.textContent.trim() : '',
                videoId: new URLSearchParams(window.location.search).get('v')
            });
            break;

        case 'getStatus':
            sendResponse({
                transcriptAvailable: window.hasTranscript || false,
                aiEnabled: !!window.openaiApiKey
            });
            break;

        case 'copyTranscriptToClipboard':
            if (!window.videoTranscript) {
                sendResponse({ success: false });
                return;
            }
            
            // Format transcript with timestamps
            const formattedTranscript = window.videoTranscript.split('\n').map(line => {
                const match = line.match(/\[(\d+:\d+)\] (.*)/);
                if (match) {
                    return `${match[1]} ${match[2]}`;
                }
                return line;
            }).join('\n');

            // Copy to clipboard
            navigator.clipboard.writeText(formattedTranscript)
                .then(() => sendResponse({ success: true }))
                .catch(err => {
                    console.error('Failed to copy:', err);
                    sendResponse({ success: false });
                });
            return true; // Keep connection open for async response

        case 'downloadTranscript':
            if (!window.videoTranscript) {
                sendResponse({ success: false });
                return;
            }

            try {
                // Format transcript with timestamps
                const formattedTranscript = window.videoTranscript.split('\n').map(line => {
                    const match = line.match(/\[(\d+:\d+)\] (.*)/);
                    if (match) {
                        return `${match[1]} ${match[2]}`;
                    }
                    return line;
                }).join('\n');

                // Create and trigger download
                const blob = new Blob([formattedTranscript], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const videoId = new URLSearchParams(window.location.search).get('v');
                const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent.trim() || 'video';
                const safeTitle = videoTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                
                a.href = url;
                a.download = `transcript_${safeTitle}_${videoId}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                sendResponse({ success: true });
            } catch (err) {
                console.error('Failed to download:', err);
                sendResponse({ success: false });
            }
            break;

        case 'refreshTranscript':
            fetchTranscript().then(success => {
                sendResponse({ success });
            });
            return true; // Keep connection open for async response

        case 'showSettings':
            showSettings();
            if (request.openFromPopup) {
                toggleSidebar(true); // Ensure sidebar is open when coming from popup
            }
            sendResponse({ success: true });
            break;

        case 'apiKeyUpdated':
            loadApiKey().then(() => {
                sendResponse({ success: true });
            });
            return true; // Keep connection open for async response
    }
  });

  // Load settings from storage
  async function loadSettings() {
    console.log('ReadTube: Loading settings');
    try {
      const settings = await chrome.storage.local.get(null);
      currentSettings = {
        darkMode: settings.darkMode ?? false,
        fontSize: settings.fontSize ?? 14,
        sidebarWidth: settings.sidebarWidth ?? 385,
        sidebarHeight: settings.sidebarHeight ?? 70,
        autoFetch: settings.autoFetch ?? true
      };
      console.log('ReadTube: Settings loaded:', currentSettings);
      if (sidebarInitialized) {
        applySettings();
      }
    } catch (error) {
      console.error('ReadTube: Error loading settings:', error);
    }
  }
  
  function toggleSidebar(forceOpen) {
    console.log('ReadTube: Toggling sidebar');
    const sidebar = document.getElementById('readtube-sidebar-wrapper');
    let reopenTab = document.querySelector('.readtube-reopen-tab');
    
    if (!reopenTab) {
        reopenTab = document.createElement('div');
        reopenTab.className = 'readtube-reopen-tab';
        reopenTab.innerHTML = `
            <div class="readtube-reopen-tab-content">
                <img src="${chrome.runtime.getURL('icon-32.png')}" alt="ReadTube" style="width: 20px; height: 20px;">
                <div class="readtube-reopen-tab-text">ReadTube</div>
            </div>
        `;
        reopenTab.addEventListener('click', () => toggleSidebar(true));
        document.body.appendChild(reopenTab);
    }

    if (sidebar) {
        const isHidden = sidebar.style.right === '-420px' || sidebar.style.display === 'none';
        
        if (forceOpen === true) {
            sidebar.style.display = 'block';
            sidebar.style.right = '0';
            reopenTab.style.display = 'none';
        } else if (forceOpen === false) {
            sidebar.style.right = '-420px';
            reopenTab.style.display = 'flex';
            // Add transition end listener to hide the sidebar after animation
            const hideAfterTransition = () => {
                sidebar.style.display = 'none';
                sidebar.removeEventListener('transitionend', hideAfterTransition);
            };
            sidebar.addEventListener('transitionend', hideAfterTransition);
        } else {
            if (isHidden) {
                sidebar.style.display = 'block';
                // Small delay to ensure display: block takes effect before transition
                setTimeout(() => {
                    sidebar.style.right = '0';
                }, 10);
                reopenTab.style.display = 'none';
            } else {
                sidebar.style.right = '-420px';
                reopenTab.style.display = 'flex';
                // Add transition end listener to hide the sidebar after animation
                const hideAfterTransition = () => {
                    sidebar.style.display = 'none';
                    sidebar.removeEventListener('transitionend', hideAfterTransition);
                };
                sidebar.addEventListener('transitionend', hideAfterTransition);
            }
        }
        console.log('ReadTube: Sidebar visibility:', sidebar.style.right === '0' ? 'shown' : 'hidden');
    } else {
        console.log('ReadTube: Sidebar element not found');
    }
  }
  
  // Basic initialization
  function initializeSidebar() {
    console.log('Initializing sidebar...');
    
    // Only initialize on YouTube watch pages
    if (!window.location.href.includes('youtube.com/watch')) {
        console.log('Not a YouTube watch page, skipping initialization');
        return;
    }
    
    // Check if already initialized
    if (sidebarInitialized) {
        console.log('Sidebar already initialized');
        return;
    }
    
    // Wait for YouTube's content to be ready
    const waitForYouTube = setInterval(() => {
        const ytdApp = document.querySelector('ytd-app');
        if (ytdApp) {
            clearInterval(waitForYouTube);
            console.log('YouTube content ready, creating sidebar');
            
            // Load settings and API key first
            Promise.all([loadSettings(), loadApiKey()]).then(() => {
                createSidebar();
                sidebarInitialized = true;
                console.log('Sidebar initialized successfully');
            }).catch(error => {
                console.error('Error initializing sidebar:', error);
            });
        }
    }, 1000);

    // Clear interval after 10 seconds to prevent infinite checking
    setTimeout(() => {
        clearInterval(waitForYouTube);
        if (!sidebarInitialized) {
            console.log('Sidebar initialization timed out');
        }
    }, 10000);
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSidebar);
  } else {
    initializeSidebar();
  }

  // Watch for URL changes
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (lastUrl !== currentUrl) {
        console.log('URL changed, reinitializing sidebar');
        lastUrl = currentUrl;
        sidebarInitialized = false;
        
        // Remove existing sidebar if present
        const existingSidebar = document.getElementById('readtube-sidebar-wrapper');
        if (existingSidebar) {
            existingSidebar.remove();
        }
        
        // Initialize new sidebar after a short delay
        setTimeout(initializeSidebar, 1000);
    }
  });

  // Start URL observation
  urlObserver.observe(document.querySelector("title"), { 
    subtree: true, 
    characterData: true, 
    childList: true 
  });

  function createChatInterface() {
    const chatContainer = document.createElement('div');
    chatContainer.className = 'readtube-chat-container';
    chatContainer.style.display = 'flex';
    chatContainer.style.flexDirection = 'column';
    chatContainer.style.height = '100%';
    chatContainer.style.overflow = 'hidden';

    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'readtube-messages';
    messagesContainer.id = 'readtube-messages';
    messagesContainer.style.flex = '1';
    messagesContainer.style.overflow = 'auto';
    messagesContainer.style.padding = '16px';
    messagesContainer.style.display = 'flex';
    messagesContainer.style.flexDirection = 'column';
    messagesContainer.style.gap = '12px';

    // Add message styles
    const messageStyles = document.createElement('style');
    messageStyles.textContent = `
        .readtube-message {
            padding: 12px 16px;
            border-radius: 8px;
            max-width: 85%;
            word-wrap: break-word;
        }
        .readtube-user-message {
            background: #f0f2f5;
            color: #1a1a1a;
            align-self: flex-end;
        }
        .readtube-assistant-message {
            background: #ffffff;
            color: #1a1a1a;
            border: 1px solid rgba(0, 0, 0, 0.1);
            align-self: flex-start;
        }
        .readtube-system-message {
            width: 100%;
            max-width: 100%;
            background: transparent;
            padding: 0;
        }
        .readtube-input-container {
            display: flex;
            gap: 8px;
            padding: 16px;
            background: #ffffff;
            border-top: 1px solid rgba(0, 0, 0, 0.1);
        }
        .readtube-chat-input {
            flex: 1;
            padding: 12px;
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 8px;
            font-size: 14px;
            resize: none;
            height: 44px;
            min-height: 44px;
            max-height: 120px;
            line-height: 1.4;
        }
        .readtube-chat-input:focus {
            outline: none;
            border-color: rgba(0, 0, 0, 0.2);
        }
        .readtube-send-button {
            padding: 8px;
            background: none;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.6;
            transition: opacity 0.2s;
        }
        .readtube-send-button:hover {
            opacity: 1;
        }
    `;
    document.head.appendChild(messageStyles);

    // Add welcome message
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'readtube-message readtube-system-message';
    welcomeMessage.innerHTML = `
        <div style="padding: 16px 20px; background: #f8f9fa; border-radius: 12px; border: 1px solid rgba(0, 0, 0, 0.08);">
            <div style="font-size: 15px; font-weight: 500; color: #1a1a1a; margin-bottom: 8px;">Welcome! Ask me anything about this video.</div>
            <div style="font-size: 13px; color: #666;">I can help you understand the content, find specific information, or analyze key points.</div>
        </div>
    `;
    messagesContainer.appendChild(welcomeMessage);

    const inputContainer = document.createElement('div');
    inputContainer.className = 'readtube-input-container';

    const textarea = document.createElement('textarea');
    textarea.className = 'readtube-chat-input';
    textarea.placeholder = 'Ask about the video...';
    textarea.id = 'readtube-chat-input';

    // Add auto-resize for textarea
    textarea.addEventListener('input', function() {
        this.style.height = '44px';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // Add enter key handling
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    const sendButton = document.createElement('button');
    sendButton.className = 'readtube-send-button';
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
    sidebarWrapper.id = 'readtube-sidebar-wrapper';
    sidebarWrapper.style.position = 'fixed';
    sidebarWrapper.style.top = '60px';
    sidebarWrapper.style.right = '0'; // Start visible
    sidebarWrapper.style.height = 'calc(100vh - 84px)';
    sidebarWrapper.style.width = '420px';
    sidebarWrapper.style.transition = 'right 0.3s ease';
    sidebarWrapper.style.zIndex = '9999';
    sidebarWrapper.style.marginBottom = '24px';

    // Create sidebar container first
    const sidebarContainer = document.createElement('div');
    sidebarContainer.id = 'readtube-sidebar-container';
    sidebarContainer.style.width = '420px';
    sidebarContainer.style.height = '100%';
    sidebarContainer.style.backgroundColor = '#ffffff';
    sidebarContainer.style.display = 'flex';
    sidebarContainer.style.flexDirection = 'column';
    sidebarContainer.style.boxShadow = '-4px 0 16px rgba(0, 0, 0, 0.1)';

    // Create header with improved styling
    const header = document.createElement('div');
    header.className = 'readtube-header';
    
    const title = document.createElement('div');
    title.className = 'readtube-title';
    title.innerHTML = `
        <img src="${chrome.runtime.getURL('icon-32.png')}" alt="ReadTube" style="width: 20px; height: 20px; margin-right: 8px;">
        <span class="readtube-title-me">Read</span><span class="readtube-title-tube">Tube</span>
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'readtube-close-button';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = toggleSidebar;
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Create tabs with improved styling
    const tabs = document.createElement('div');
    tabs.className = 'readtube-tabs';
    
    const transcriptTab = document.createElement('button');
    transcriptTab.className = 'readtube-tab active';
    transcriptTab.textContent = 'Transcript';
    
    const askTab = document.createElement('button');
    askTab.className = 'readtube-tab';
    askTab.textContent = 'Ask';
    
    transcriptTab.onclick = () => {
        updateActiveTab(transcriptTab);
        showTranscript();
    };

    askTab.onclick = () => {
        updateActiveTab(askTab);
        showAskInterface();
    };
    
    function updateActiveTab(activeTab) {
        tabs.querySelectorAll('.readtube-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        activeTab.classList.add('active');
    }
    
    tabs.appendChild(transcriptTab);
    tabs.appendChild(askTab);
    
    // Create content area
    const contentArea = document.createElement('div');
    contentArea.id = 'readtube-main-container';
    contentArea.style.flex = '1';
    contentArea.style.overflow = 'hidden';
    contentArea.style.display = 'flex';
    contentArea.style.flexDirection = 'column';
    
    // Create footer
    const footer = document.createElement('div');
    footer.className = 'readtube-footer';
    footer.style.padding = '10px 16px';
    footer.style.borderTop = '1px solid rgba(0, 0, 0, 0.1)';
    footer.style.backgroundColor = '#f8f8f8';
    footer.style.fontSize = '12px';
    footer.style.color = '#666';
    footer.style.display = 'flex';
    footer.style.alignItems = 'center';
    footer.style.justifyContent = 'space-between';
    
    // Add footer content
    footer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span id="readtube-ai-status" style="color: #999;">AI: Not configured</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
            <button id="readtube-settings-btn" style="background: none; border: none; padding: 4px; cursor: pointer; opacity: 0.6; display: flex; align-items: center;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            </button>
        </div>
    `;

    // Add hover effect for settings button
    const settingsBtn = footer.querySelector('#readtube-settings-btn');
    if (settingsBtn) {
        settingsBtn.onmouseover = () => {
            settingsBtn.style.opacity = '1';
        };
        settingsBtn.onmouseout = () => {
            settingsBtn.style.opacity = '0.6';
        };
        settingsBtn.onclick = () => {
            // Open settings in a new window
            const width = 400;
            const height = 500;
            const left = (window.screen.width - width) / 2;
            const top = (window.screen.height - height) / 2;
            
            const settingsWindow = window.open('', 'ReadTube Settings', 
                `width=${width},height=${height},left=${left},top=${top},` +
                'resizable=yes,scrollbars=yes,status=no,location=no,menubar=no,toolbar=no');
            
            if (settingsWindow) {
                settingsWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>ReadTube Settings</title>
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                                margin: 0;
                                padding: 24px;
                                background: #f8f9fa;
                                color: #1a1a1a;
                            }
                            .settings-container {
                                max-width: 100%;
                                margin: 0 auto;
                                background: white;
                                padding: 24px;
                                border-radius: 12px;
                                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
                            }
                            h1 {
                                margin: 0 0 24px 0;
                                font-size: 20px;
                                font-weight: 500;
                            }
                            .settings-section {
                                margin-bottom: 24px;
                            }
                            .settings-section h2 {
                                font-size: 16px;
                                margin: 0 0 16px 0;
                                color: #1a1a1a;
                            }
                            .settings-input {
                                width: 100%;
                                padding: 8px 12px;
                                border: 1px solid #ddd;
                                border-radius: 6px;
                                font-size: 14px;
                                margin-bottom: 16px;
                            }
                            .settings-save-button {
                                background: #ff0000;
                                color: white;
                                border: none;
                                padding: 10px 16px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                                transition: all 0.2s;
                            }
                            .settings-save-button:hover {
                                background: #cc0000;
                            }
                            .settings-description {
                                font-size: 14px;
                                color: #666;
                                margin-bottom: 16px;
                                line-height: 1.5;
                            }
                            .settings-status {
                                display: none;
                                padding: 12px;
                                border-radius: 6px;
                                margin-top: 16px;
                                font-size: 14px;
                            }
                            .settings-status.success {
                                display: block;
                                background: #e6f4ea;
                                color: #1e7e34;
                                border: 1px solid #c3e6cb;
                            }
                            .settings-status.error {
                                display: block;
                                background: #f8d7da;
                                color: #721c24;
                                border: 1px solid #f5c6cb;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="settings-container">
                            <h1>ReadTube Settings</h1>
                            <div class="settings-section">
                                <h2>AI Configuration</h2>
                                <div class="settings-description">
                                    To use the AI features, you'll need an OpenAI API key. 
                                    Get your key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #ff0000;">OpenAI's website</a>.
                                </div>
                                <input type="text" id="api-key" class="settings-input" placeholder="Enter your OpenAI API key (sk-...)">
                                <button id="save-key" class="settings-save-button">Save API Key</button>
                                <div id="settings-status" class="settings-status"></div>
                            </div>
                        </div>
                        <script>
                            // Load existing API key
                            chrome.storage.local.get('openaiApiKey', (data) => {
                                if (data.openaiApiKey) {
                                    document.getElementById('api-key').value = data.openaiApiKey;
                                }
                            });
                            
                            // Save API key
                            document.getElementById('save-key').onclick = () => {
                                const apiKey = document.getElementById('api-key').value.trim();
                                const statusDiv = document.getElementById('settings-status');
                                
                                if (!apiKey.startsWith('sk-')) {
                                    statusDiv.textContent = 'Invalid API key format. The key should start with "sk-"';
                                    statusDiv.className = 'settings-status error';
                                    return;
                                }
                                
                                chrome.storage.local.set({ openaiApiKey: apiKey }, () => {
                                    // Show success message
                                    statusDiv.textContent = 'API key saved successfully!';
                                    statusDiv.className = 'settings-status success';
                                    
                                    // Notify the content script
                                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                                        chrome.tabs.sendMessage(tabs[0].id, { action: 'apiKeyUpdated' });
                                    });
                                    
                                    // Close window after delay
                                    setTimeout(() => {
                                        window.close();
                                    }, 1500);
                                });
                            };

                            // Add enter key support
                            document.getElementById('api-key').addEventListener('keypress', (e) => {
                                if (e.key === 'Enter') {
                                    document.getElementById('save-key').click();
                                }
                            });
                        </script>
                    </body>
                    </html>
                `);
            }
        };
    }

    // Update AI status
    const updateStatus = () => {
        const aiStatus = footer.querySelector('#readtube-ai-status');
        if (aiStatus) {
            chrome.storage.local.get('openaiApiKey', (data) => {
                aiStatus.textContent = `AI: ${data.openaiApiKey ? 'Ready' : 'Not configured'}`;
                aiStatus.style.color = data.openaiApiKey ? '#00a67e' : '#999';
            });
        }
    };

    // Initial status update
    updateStatus();

    // Assemble the sidebar
    sidebarContainer.appendChild(header);
    sidebarContainer.appendChild(tabs);
    sidebarContainer.appendChild(contentArea);
    sidebarContainer.appendChild(footer);
    sidebarWrapper.appendChild(sidebarContainer);
    document.body.appendChild(sidebarWrapper);

    // Show initial transcript view
    showTranscript();
  }

  function applySettings() {
    const sidebar = document.getElementById('readtube-sidebar-wrapper');
    const container = document.getElementById('readtube-sidebar-container');
    const mainContainer = document.getElementById('readtube-main-container');
    
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
    document.querySelectorAll('.readtube-message').forEach(msg => {
      msg.style.color = textColor;
    });
  }
  
  function showTranscript() {
    const mainContainer = document.getElementById('readtube-main-container');
    if (mainContainer) {
        mainContainer.innerHTML = '';
        const transcriptContainer = createTranscriptDisplay();
        mainContainer.appendChild(transcriptContainer);
        
        // Create transcript content div if it doesn't exist
        let transcriptContent = document.getElementById('readtube-transcript-content');
        if (!transcriptContent) {
            transcriptContent = document.createElement('div');
            transcriptContent.id = 'readtube-transcript-content';
            transcriptContent.style.height = '100%';
            transcriptContent.style.overflow = 'auto';
            transcriptContent.style.padding = '16px 20px 32px';
            mainContainer.appendChild(transcriptContent);
        }
        
        // Auto-fetch transcript
        fetchTranscript().then(success => {
            if (!success) {
                transcriptContent.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: #666;">
                        <p>No transcript available for this video.</p>
                        <p style="font-size: 12px;">Try enabling captions in the video player first.</p>
                    </div>
                `;
            }
        });
    }
  }
  
  function showAIChat() {
    const mainContainer = document.getElementById('readtube-main-container');
    if (mainContainer) {
        mainContainer.innerHTML = '';
        mainContainer.appendChild(createChatInterface());
    }
  }
  
  function showInsights() {
    const mainContainer = document.getElementById('readtube-main-container');
    if (!mainContainer) return;
    
    mainContainer.innerHTML = '';
    
    const insightsContainer = document.createElement('div');
    insightsContainer.className = 'readtube-insights-container';
    
    // Auto-generated summary section
    const summarySection = document.createElement('div');
    summarySection.className = 'insights-summary-section';
    summarySection.style.padding = '20px';
    summarySection.style.borderBottom = '1px solid #eee';
    summarySection.style.fontWeight = '500';
    summarySection.style.fontSize = '15px';
    summarySection.style.color = '#1a1a1a';
    const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer');
    titleElement.textContent = videoTitle ? videoTitle.textContent.trim() : 'Video Transcript';
    container.appendChild(titleElement);
    
    // Enhanced search container
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.style.padding = '12px 16px';
    searchContainer.style.borderBottom = '1px solid rgba(0, 0, 0, 0.08)';
    searchContainer.style.background = '#ffffff';
    
    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'search-wrapper';
    searchWrapper.style.display = 'flex';
    searchWrapper.style.alignItems = 'center';
    searchWrapper.style.gap = '12px';
    
    // Add search icon
    const searchIcon = document.createElement('div');
    searchIcon.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #666;">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
    `;
    searchIcon.style.display = 'flex';
    searchIcon.style.alignItems = 'center';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'search-input';
    searchInput.placeholder = 'Search...';
    searchInput.style.border = 'none';
    searchInput.style.outline = 'none';
    searchInput.style.width = '100%';
    searchInput.style.fontSize = '14px';
    searchInput.style.color = '#333';
    searchInput.oninput = (e) => searchTranscript(e.target.value);
    searchInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            navigateSearch('next');
        }
    };
    
    const searchNav = document.createElement('div');
    searchNav.className = 'search-nav';
    searchNav.style.display = 'flex';
    searchNav.style.alignItems = 'center';
    searchNav.style.gap = '8px';
    
    const navButtons = document.createElement('div');
    navButtons.className = 'search-nav-buttons';
    navButtons.style.display = 'flex';
    navButtons.style.gap = '4px';
    
    const prevButton = document.createElement('button');
    prevButton.className = 'search-nav-button';
    prevButton.style.padding = '4px';
    prevButton.style.border = '1px solid rgba(0, 0, 0, 0.1)';
    prevButton.style.borderRadius = '4px';
    prevButton.style.background = '#ffffff';
    prevButton.style.cursor = 'pointer';
    prevButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7" /></svg>`;
    prevButton.onclick = () => navigateSearch('prev');
    
    const nextButton = document.createElement('button');
    nextButton.className = 'search-nav-button';
    nextButton.style.padding = '4px';
    nextButton.style.border = '1px solid rgba(0, 0, 0, 0.1)';
    nextButton.style.borderRadius = '4px';
    nextButton.style.background = '#ffffff';
    nextButton.style.cursor = 'pointer';
    nextButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" /></svg>`;
    nextButton.onclick = () => navigateSearch('next');
    
    const searchCounter = document.createElement('div');
    searchCounter.id = 'search-counter';
    searchCounter.className = 'search-counter';
    searchCounter.style.fontSize = '12px';
    searchCounter.style.color = '#666';
    searchCounter.style.minWidth = '80px';
    
    navButtons.appendChild(prevButton);
    navButtons.appendChild(nextButton);
    
    searchNav.appendChild(navButtons);
    searchNav.appendChild(searchCounter);
    
    searchWrapper.appendChild(searchIcon);
    searchWrapper.appendChild(searchInput);
    searchWrapper.appendChild(searchNav);
    
    searchContainer.appendChild(searchWrapper);
    container.appendChild(searchContainer);
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'transcript-content-wrapper';
    contentWrapper.style.flex = '1';
    contentWrapper.style.position = 'relative';
    contentWrapper.style.overflow = 'hidden';
    
    // Enhanced floating controls
    const floatingControls = document.createElement('div');
    floatingControls.className = 'transcript-floating-controls';
    floatingControls.style.position = 'absolute';
    floatingControls.style.top = '16px';
    floatingControls.style.right = '16px';
    floatingControls.style.display = 'flex';
    floatingControls.style.gap = '8px';
    floatingControls.style.zIndex = '1';
    
    const copyButton = document.createElement('button');
    copyButton.className = 'transcript-action-button';
    copyButton.title = 'Copy transcript';
    copyButton.style.padding = '8px';
    copyButton.style.border = '1px solid rgba(0, 0, 0, 0.1)';
    copyButton.style.borderRadius = '6px';
    copyButton.style.background = '#ffffff';
    copyButton.style.cursor = 'pointer';
    copyButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
    copyButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
      </svg>
    `;
    
    const downloadButton = document.createElement('button');
    downloadButton.className = 'transcript-action-button';
    downloadButton.title = 'Download transcript';
    downloadButton.style.padding = '8px';
    downloadButton.style.border = '1px solid rgba(0, 0, 0, 0.1)';
    downloadButton.style.borderRadius = '6px';
    downloadButton.style.background = '#ffffff';
    downloadButton.style.cursor = 'pointer';
    downloadButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
    downloadButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `;
    
    floatingControls.appendChild(copyButton);
    floatingControls.appendChild(downloadButton);
    
    const transcriptContent = document.createElement('div');
    transcriptContent.id = 'readtube-transcript-content';
    transcriptContent.style.height = '100%';
    transcriptContent.style.overflow = 'auto';
    transcriptContent.style.padding = '16px 20px 32px';
    
    contentWrapper.appendChild(floatingControls);
    contentWrapper.appendChild(transcriptContent);
    container.appendChild(contentWrapper);
    
    // Add hover effects for buttons
    [copyButton, downloadButton, prevButton, nextButton].forEach(button => {
        button.onmouseover = () => {
            button.style.background = '#f8f9fa';
            button.style.borderColor = 'rgba(0, 0, 0, 0.15)';
        };
        button.onmouseout = () => {
            button.style.background = '#ffffff';
            button.style.borderColor = 'rgba(0, 0, 0, 0.1)';
        };
    });
    
    // Add click handlers
    copyButton.onclick = () => {
      const transcriptText = Array.from(transcriptContent.querySelectorAll('.transcript-line'))
        .map(line => {
          const timestamp = line.querySelector('.transcript-timestamp').textContent;
          const text = line.querySelector('.transcript-text').textContent;
          return `[${timestamp}] ${text}`;
        })
        .join('\n');
      
      navigator.clipboard.writeText(transcriptText).then(() => {
        copyButton.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00a67e" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        `;
        showNotification('Transcript copied to clipboard');
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
    
    downloadButton.onclick = () => {
      const transcriptText = Array.from(transcriptContent.querySelectorAll('.transcript-line'))
        .map(line => {
          const timestamp = line.querySelector('.transcript-timestamp').textContent;
          const text = line.querySelector('.transcript-text').textContent;
          return `[${timestamp}] ${text}`;
        })
        .join('\n');
      
      const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent.trim() || 'video';
      const videoId = new URLSearchParams(window.location.search).get('v') || 'unknown';
      const safeTitle = videoTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      
      const blob = new Blob([transcriptText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}_transcript.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      downloadButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00a67e" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      `;
      showNotification('Transcript downloaded');
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
    
    return container;
}

function searchTranscript(query) {
    const content = document.getElementById('readtube-transcript-content');
    const searchCounter = document.getElementById('search-counter');
    if (!content) return;
    
    // Clear previous highlights if query is empty
    if (!query) {
        content.querySelectorAll('.transcript-line').forEach(line => {
            const text = line.querySelector('.transcript-text');
            if (text) {
                text.innerHTML = text.textContent;
                line.classList.remove('search-match', 'current-match');
            }
        });
        if (searchCounter) searchCounter.textContent = '';
        return;
    }

    query = query.toLowerCase();
    let totalMatches = 0;
    let firstMatch = null;

    content.querySelectorAll('.transcript-line').forEach(line => {
        const text = line.querySelector('.transcript-text');
        if (!text) return;

        const content = text.textContent;
        const lowerContent = content.toLowerCase();
        
        // Reset line state
        line.classList.remove('search-match', 'current-match');
        
        if (lowerContent.includes(query)) {
            line.classList.add('search-match');
            totalMatches++;
            
            if (!firstMatch) {
                firstMatch = line;
                line.classList.add('current-match');
            }
            
            // Simple text highlight
            const parts = content.split(new RegExp(`(${query})`, 'gi'));
            text.innerHTML = parts.map(part => 
                part.toLowerCase() === query.toLowerCase() 
                    ? `<span class="search-highlight">${part}</span>` 
                    : part
            ).join('');
        } else {
            text.innerHTML = content;
        }
    });
    
    // Update counter
    if (searchCounter) {
        searchCounter.innerHTML = totalMatches > 0 
            ? `1 of ${totalMatches} matches` 
            : 'No matches found';
    }
    
    // Scroll to first match
    if (firstMatch) {
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Update the styles for better visibility
const searchStyles = document.createElement('style');
searchStyles.textContent = `
    .search-highlight {
        background-color: rgba(255, 235, 59, 0.3);
        border-radius: 2px;
    }
    
    .search-match {
        background: transparent;
    }
    
    .current-match {
        display: inline-block;
        background: rgba(255, 235, 59, 0.1);
        border-radius: 4px;
        padding: 2px 4px;
    }
    
    .current-match .search-highlight {
        background-color: rgba(255, 235, 59, 0.4);
    }

    .transcript-line {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        padding: 8px 0;
    }

    .transcript-text {
        flex: 1;
    }
`;
document.head.appendChild(searchStyles);

function showAskInterface() {
    const mainContainer = document.getElementById('readtube-main-container');
    if (!mainContainer) return;
    
    mainContainer.innerHTML = '';

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.height = '100%';
    container.style.gap = '16px';
    container.style.padding = '16px';

    // Create chat interface
    const chatContainer = document.createElement('div');
    chatContainer.className = 'readtube-chat-container';
    chatContainer.style.flex = '1';
    chatContainer.style.minHeight = '0';

    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'readtube-messages';
    messagesContainer.id = 'readtube-messages';

    // Add welcome message
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'readtube-message readtube-system-message';
    welcomeMessage.innerHTML = `
        <div style="padding: 16px 20px; background: #f8f9fa; border-radius: 12px; border: 1px solid rgba(0, 0, 0, 0.08);">
            <div style="font-size: 15px; font-weight: 500; color: #1a1a1a; margin-bottom: 8px;">Welcome! Ask me anything about this video.</div>
            <div style="font-size: 13px; color: #666;">I can help you understand the content, find specific information, or analyze key points.</div>
        </div>
    `;
    messagesContainer.appendChild(welcomeMessage);

    // Create quick questions section
    const quickQuestions = [
        { icon: "📝", text: "Summarize" },
        { icon: "🎭", text: "Sentiment" },
        { icon: "📑", text: "Chapters" },
        { icon: "⭐", text: "Key Moments" }
    ];

    const questionsContainer = document.createElement('div');
    questionsContainer.style.display = 'flex';
    questionsContainer.style.flexWrap = 'wrap';
    questionsContainer.style.gap = '8px';
    questionsContainer.style.margin = '16px 0';

    quickQuestions.forEach(({ icon, text }) => {
        const questionButton = document.createElement('button');
        questionButton.className = 'quick-question-button';
        questionButton.style.fontSize = '13px';
        questionButton.style.padding = '8px 16px';
        questionButton.style.borderRadius = '8px';
        questionButton.style.border = '1px solid rgba(0, 0, 0, 0.1)';
        questionButton.style.background = '#ffffff';
        questionButton.style.cursor = 'pointer';
        questionButton.style.transition = 'all 0.2s ease';
        questionButton.style.color = '#2c2c2c';
        questionButton.style.display = 'flex';
        questionButton.style.alignItems = 'center';
        questionButton.style.gap = '6px';
        questionButton.style.fontWeight = '450';
        questionButton.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.04)';

        const iconSpan = document.createElement('span');
        iconSpan.textContent = icon;
        iconSpan.style.fontSize = '14px';

        const textSpan = document.createElement('span');
        textSpan.textContent = text;

        questionButton.appendChild(iconSpan);
        questionButton.appendChild(textSpan);

        questionButton.onmouseover = () => {
            questionButton.style.background = '#f8f9fa';
            questionButton.style.transform = 'translateY(-1px)';
            questionButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.06)';
        };
        questionButton.onmouseout = () => {
            questionButton.style.background = '#ffffff';
            questionButton.style.transform = 'translateY(0)';
            questionButton.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.04)';
        };
        questionButton.onclick = () => {
            const textarea = document.getElementById('readtube-chat-input');
            if (textarea) {
                textarea.value = text;
                handleSendMessage();
            }
        };
        questionsContainer.appendChild(questionButton);
    });

    messagesContainer.appendChild(questionsContainer);

    const inputContainer = document.createElement('div');
    inputContainer.className = 'readtube-input-container';

    const textarea = document.createElement('textarea');
    textarea.className = 'readtube-chat-input';
    textarea.placeholder = 'Ask anything about the video...';
    textarea.id = 'readtube-chat-input';

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    const sendButton = document.createElement('button');
    sendButton.className = 'readtube-send-button';
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

    container.appendChild(chatContainer);
    mainContainer.appendChild(container);
}

function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

function navigateSearch(direction) {
    const content = document.getElementById('readtube-transcript-content');
    const searchCounter = document.getElementById('search-counter');
    if (!content || !searchCounter) return;

    const matches = Array.from(content.querySelectorAll('.search-match'));
    if (matches.length === 0) return;

    // Find current match
    const currentMatch = content.querySelector('.current-match');
    const currentIndex = currentMatch ? matches.indexOf(currentMatch) : -1;

    // Remove current match highlight
    if (currentMatch) {
        currentMatch.classList.remove('current-match');
    }

    // Calculate next index with wraparound
    let nextIndex;
    if (direction === 'next') {
        nextIndex = currentIndex < matches.length - 1 ? currentIndex + 1 : 0;
    } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : matches.length - 1;
    }

    // Apply new current match
    const nextMatch = matches[nextIndex];
    nextMatch.classList.add('current-match');
    
    // Smooth scroll with offset for better visibility
    nextMatch.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });

    // Update counter with current position
    searchCounter.innerHTML = `${nextIndex + 1} of ${matches.length} matches`;

    // Add a brief highlight animation
    const highlight = nextMatch.querySelector('.search-highlight');
    if (highlight) {
        highlight.style.animation = 'none';
        highlight.offsetHeight; // Trigger reflow
        highlight.style.animation = 'highlightFade 0.3s ease-out';
    }
}

// Add these styles for improved search navigation
const navStyles = document.createElement('style');
navStyles.textContent = `
    .search-nav-button {
        opacity: 0.8;
        transition: all 0.2s ease;
    }

    .search-nav-button:hover {
        opacity: 1;
        background: #f0f0f0 !important;
    }

    .search-nav-button:active {
        transform: scale(0.95);
    }

    .current-match {
        background: rgba(255, 235, 59, 0.2) !important;
    }

    .current-match .search-highlight {
        background: rgba(255, 235, 59, 0.4) !important;
    }

    @keyframes highlightFade {
        0% { background: rgba(255, 235, 59, 0.6); }
        100% { background: rgba(255, 235, 59, 0.4); }
    }
`;
document.head.appendChild(navStyles);

function createPopupContent() {
    const container = document.createElement('div');
    container.className = 'readtube-popup-container';
    
    // Add logo section
    const logoSection = document.createElement('div');
    logoSection.className = 'readtube-logo-section';
    logoSection.innerHTML = `
        <img src="${chrome.runtime.getURL('icon-32.png')}" alt="ReadTube" style="width: 24px; height: 24px;">
        <span style="font-size: 20px; margin-left: 8px;">ReadTube</span>
    `;
    container.appendChild(logoSection);

    // Check current state
    const currentUrl = window.location.href;
    const isYouTube = currentUrl.includes('youtube.com');
    const isVideoPage = currentUrl.includes('youtube.com/watch');
    const hasTranscript = document.querySelector('.ytp-captions-button[aria-pressed="true"]');

    let content = '';
    
    if (!isYouTube) {
        // Not on YouTube
        content = `
            <div class="readtube-state-message">
                <p>📺 Open any YouTube video to get started</p>
            </div>
        `;
    } else if (!isVideoPage) {
        // On YouTube but not on a video
        content = `
            <div class="readtube-state-message">
                <p>🎥 Open a specific video to use ReadTube</p>
            </div>
        `;
    } else {
        // On a video page - show the three options
        content = `
            <div class="readtube-options">
                <div class="readtube-option" data-option="ask">
                    <h3>💬 Ask AI</h3>
                    <p>Have a natural conversation about the video content</p>
                </div>
                <div class="readtube-option" data-option="insights">
                    <h3>✨ Insights</h3>
                    <p>Get quick analysis and key moments</p>
                </div>
                <div class="readtube-option" data-option="transcript">
                    <h3>📝 Transcript</h3>
                    <p>Search and navigate through the video</p>
                </div>
            </div>
        `;
    }

    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = content;
    container.appendChild(contentDiv);

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        .readtube-popup-container {
            padding: 16px;
            min-width: 300px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .readtube-logo-section {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
        }

        .readtube-state-message {
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            margin: 10px 0;
        }

        .readtube-state-message p {
            margin: 0;
            color: #1a1a1a;
            font-size: 15px;
        }

        .readtube-options {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .readtube-option {
            padding: 12px;
            border-radius: 8px;
            background: #f8f9fa;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .readtube-option:hover {
            background: #f0f0f0;
            transform: translateY(-1px);
        }

        .readtube-option h3 {
            margin: 0;
            font-size: 15px;
            font-weight: 500;
            color: #1a1a1a;
        }

        .readtube-option p {
            margin: 4px 0 0 0;
            font-size: 13px;
            color: #666;
        }
    `;
    document.head.appendChild(style);

    return container;
}

function createTranscriptDisplay() {
    const container = document.createElement('div');
    container.className = 'readtube-transcript-container';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    
    // Add title section with improved styling
    const titleElement = document.createElement('div');
    titleElement.className = 'transcript-title';
    titleElement.style.padding = '16px 20px';
    titleElement.style.borderBottom = '1px solid rgba(0, 0, 0, 0.08)';
    titleElement.style.fontWeight = '500';
    titleElement.style.fontSize = '15px';
    titleElement.style.color = '#1a1a1a';
    const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer');
    titleElement.textContent = videoTitle ? videoTitle.textContent.trim() : 'Video Transcript';
    container.appendChild(titleElement);
    
    // Enhanced search container
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.style.padding = '12px 16px';
    searchContainer.style.borderBottom = '1px solid rgba(0, 0, 0, 0.08)';
    searchContainer.style.background = '#ffffff';
    
    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'search-wrapper';
    searchWrapper.style.display = 'flex';
    searchWrapper.style.alignItems = 'center';
    searchWrapper.style.gap = '12px';
    
    // Add search icon
    const searchIcon = document.createElement('div');
    searchIcon.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #666;">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
    `;
    searchIcon.style.display = 'flex';
    searchIcon.style.alignItems = 'center';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'search-input';
    searchInput.placeholder = 'Search transcript...';
    searchInput.style.border = 'none';
    searchInput.style.outline = 'none';
    searchInput.style.width = '100%';
    searchInput.style.fontSize = '14px';
    searchInput.style.color = '#333';
    searchInput.oninput = (e) => searchTranscript(e.target.value);
    searchInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            navigateSearch('next');
        }
    };
    
    const searchNav = document.createElement('div');
    searchNav.className = 'search-nav';
    searchNav.style.display = 'flex';
    searchNav.style.alignItems = 'center';
    searchNav.style.gap = '8px';
    
    const navButtons = document.createElement('div');
    navButtons.className = 'search-nav-buttons';
    navButtons.style.display = 'flex';
    navButtons.style.gap = '4px';
    
    const prevButton = document.createElement('button');
    prevButton.className = 'search-nav-button';
    prevButton.style.padding = '4px';
    prevButton.style.border = '1px solid rgba(0, 0, 0, 0.1)';
    prevButton.style.borderRadius = '4px';
    prevButton.style.background = '#ffffff';
    prevButton.style.cursor = 'pointer';
    prevButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7" /></svg>`;
    prevButton.onclick = () => navigateSearch('prev');
    
    const nextButton = document.createElement('button');
    nextButton.className = 'search-nav-button';
    nextButton.style.padding = '4px';
    nextButton.style.border = '1px solid rgba(0, 0, 0, 0.1)';
    nextButton.style.borderRadius = '4px';
    nextButton.style.background = '#ffffff';
    nextButton.style.cursor = 'pointer';
    nextButton.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" /></svg>`;
    nextButton.onclick = () => navigateSearch('next');
    
    const searchCounter = document.createElement('div');
    searchCounter.id = 'search-counter';
    searchCounter.className = 'search-counter';
    searchCounter.style.fontSize = '12px';
    searchCounter.style.color = '#666';
    searchCounter.style.minWidth = '80px';
    
    navButtons.appendChild(prevButton);
    navButtons.appendChild(nextButton);
    
    searchNav.appendChild(navButtons);
    searchNav.appendChild(searchCounter);
    
    searchWrapper.appendChild(searchIcon);
    searchWrapper.appendChild(searchInput);
    searchWrapper.appendChild(searchNav);
    
    searchContainer.appendChild(searchWrapper);
    container.appendChild(searchContainer);
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'transcript-content-wrapper';
    contentWrapper.style.flex = '1';
    contentWrapper.style.position = 'relative';
    contentWrapper.style.overflow = 'hidden';
    
    // Enhanced floating controls
    const floatingControls = document.createElement('div');
    floatingControls.className = 'transcript-floating-controls';
    floatingControls.style.position = 'absolute';
    floatingControls.style.top = '16px';
    floatingControls.style.right = '16px';
    floatingControls.style.display = 'flex';
    floatingControls.style.gap = '8px';
    floatingControls.style.zIndex = '1';
    
    const copyButton = document.createElement('button');
    copyButton.className = 'transcript-action-button';
    copyButton.title = 'Copy transcript';
    copyButton.style.padding = '8px';
    copyButton.style.border = '1px solid rgba(0, 0, 0, 0.1)';
    copyButton.style.borderRadius = '6px';
    copyButton.style.background = '#ffffff';
    copyButton.style.cursor = 'pointer';
    copyButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
    copyButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
      </svg>
    `;
    
    const downloadButton = document.createElement('button');
    downloadButton.className = 'transcript-action-button';
    downloadButton.title = 'Download transcript';
    downloadButton.style.padding = '8px';
    downloadButton.style.border = '1px solid rgba(0, 0, 0, 0.1)';
    downloadButton.style.borderRadius = '6px';
    downloadButton.style.background = '#ffffff';
    downloadButton.style.cursor = 'pointer';
    downloadButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
    downloadButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `;
    
    floatingControls.appendChild(copyButton);
    floatingControls.appendChild(downloadButton);
    
    const transcriptContent = document.createElement('div');
    transcriptContent.id = 'readtube-transcript-content';
    transcriptContent.style.height = '100%';
    transcriptContent.style.overflow = 'auto';
    transcriptContent.style.padding = '16px 20px 32px';
    
    contentWrapper.appendChild(floatingControls);
    contentWrapper.appendChild(transcriptContent);
    container.appendChild(contentWrapper);
    
    // Add hover effects for buttons
    [copyButton, downloadButton, prevButton, nextButton].forEach(button => {
        button.onmouseover = () => {
            button.style.background = '#f8f9fa';
            button.style.borderColor = 'rgba(0, 0, 0, 0.15)';
        };
        button.onmouseout = () => {
            button.style.background = '#ffffff';
            button.style.borderColor = 'rgba(0, 0, 0, 0.1)';
        };
    });
    
    // Add click handlers
    copyButton.onclick = () => {
        const transcriptText = Array.from(transcriptContent.querySelectorAll('.transcript-line'))
            .map(line => {
                const timestamp = line.querySelector('.transcript-timestamp').textContent;
                const text = line.querySelector('.transcript-text').textContent;
                return `[${timestamp}] ${text}`;
            })
            .join('\n');
        
        navigator.clipboard.writeText(transcriptText).then(() => {
            copyButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00a67e" stroke-width="2">
                    <path d="M20 6L9 17l-5-5"/>
                </svg>
            `;
            showNotification('Transcript copied to clipboard');
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
    
    downloadButton.onclick = () => {
        const transcriptText = Array.from(transcriptContent.querySelectorAll('.transcript-line'))
            .map(line => {
                const timestamp = line.querySelector('.transcript-timestamp').textContent;
                const text = line.querySelector('.transcript-text').textContent;
                return `[${timestamp}] ${text}`;
            })
            .join('\n');
        
        const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent.trim() || 'video';
        const videoId = new URLSearchParams(window.location.search).get('v') || 'unknown';
        const safeTitle = videoTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        const blob = new Blob([transcriptText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeTitle}_transcript.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        downloadButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00a67e" stroke-width="2">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
        `;
        showNotification('Transcript downloaded');
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
    
    return container;
}

function handleSendMessage() {
    const textarea = document.getElementById('readtube-chat-input');
    const message = textarea.value.trim();
    if (!message) return;

    // Add user message to chat
    addMessageToChat(message, 'user');
    textarea.value = '';

    // Send to OpenAI
    sendToOpenAI(message);
}

function addMessageToChat(message, type) {
    const messagesContainer = document.getElementById('readtube-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `readtube-message readtube-${type}-message`;
    messageDiv.textContent = message;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'readtube-notification';
    notification.style.position = 'fixed';
    notification.style.bottom = '24px';
    notification.style.right = '24px';
    notification.style.background = '#1a1a1a';
    notification.style.color = '#ffffff';
    notification.style.padding = '12px 16px';
    notification.style.borderRadius = '8px';
    notification.style.fontSize = '14px';
    notification.style.zIndex = '10000';
    notification.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 2000);
}

async function fetchTranscript() {
    console.log('Fetching transcript...');
    
    const transcriptContent = document.getElementById('readtube-transcript-content');
    if (!transcriptContent) {
        console.error('Transcript container not found');
        return false;
    }
    
    try {
        // Show loading state
        transcriptContent.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: #666;">
                <div style="text-align: center;">
                    <div style="margin-bottom: 12px;">Loading transcript...</div>
                    <div style="font-size: 12px;">This may take a few seconds</div>
                </div>
            </div>
        `;
        
        // Get video ID from URL
        const videoId = new URLSearchParams(window.location.search).get('v');
        if (!videoId) {
            throw new Error('Video ID not found');
        }
        
        // Get transcript data
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
        const html = await response.text();
        
        // Extract captions data using a more robust regex
        const ytInitialData = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/)?.[1];
        if (!ytInitialData) {
            throw new Error('Could not find initial player data');
        }

        let playerData;
        try {
            playerData = JSON.parse(ytInitialData);
        } catch (e) {
            console.error('Failed to parse player data:', e);
            throw new Error('Invalid player data format');
        }

        const captions = playerData.captions?.playerCaptionsTracklistRenderer;
        if (!captions?.captionTracks?.length) {
            throw new Error('No captions available for this video');
        }

        // Prefer English captions if available, otherwise take the first track
        const captionTrack = captions.captionTracks.find(track => 
            track.languageCode === 'en' || track.vssId?.includes('.en')
        ) || captions.captionTracks[0];

        if (!captionTrack?.baseUrl) {
            throw new Error('No valid caption track found');
        }
        
        // Fetch transcript XML with proper headers
        const transcriptResponse = await fetch(captionTrack.baseUrl, {
            headers: {
                'Accept': 'text/xml',
                'Origin': 'https://www.youtube.com'
            }
        });

        if (!transcriptResponse.ok) {
            throw new Error(`Failed to fetch transcript: ${transcriptResponse.status}`);
        }

        const transcriptXml = await transcriptResponse.text();
        
        // Parse XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(transcriptXml, 'text/xml');
        
        if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
            throw new Error('Failed to parse transcript XML');
        }

        const textNodes = xmlDoc.getElementsByTagName('text');
        if (textNodes.length === 0) {
            throw new Error('No transcript text found');
        }
        
        // Clear loading state
        transcriptContent.innerHTML = '';
        
        // Process each line
        for (let i = 0; i < textNodes.length; i++) {
            const node = textNodes[i];
            const start = parseFloat(node.getAttribute('start') || '0');
            const duration = parseFloat(node.getAttribute('dur') || '0');
            
            const minutes = Math.floor(start / 60);
            const seconds = Math.floor(start % 60);
            const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            const line = document.createElement('div');
            line.className = 'transcript-line';
            line.style.display = 'flex';
            line.style.gap = '16px';
            line.style.padding = '8px 0';
            line.style.cursor = 'pointer';
            line.style.borderBottom = '1px solid rgba(0, 0, 0, 0.08)';
            line.style.transition = 'background-color 0.2s ease';
            
            const timestampSpan = document.createElement('span');
            timestampSpan.className = 'transcript-timestamp';
            timestampSpan.textContent = timestamp;
            timestampSpan.style.color = '#666';
            timestampSpan.style.fontSize = '14px';
            timestampSpan.style.minWidth = '40px';
            
            const textSpan = document.createElement('span');
            textSpan.className = 'transcript-text';
            textSpan.textContent = node.textContent || '';
            textSpan.style.fontSize = '14px';
            textSpan.style.lineHeight = '1.5';
            textSpan.style.color = '#1a1a1a';
            
            line.appendChild(timestampSpan);
            line.appendChild(textSpan);
            
            // Add hover effect
            line.onmouseover = () => {
                line.style.backgroundColor = 'rgba(0, 0, 0, 0.02)';
            };
            line.onmouseout = () => {
                line.style.backgroundColor = 'transparent';
            };
            
            // Add click handler to seek video
            line.onclick = () => {
                const video = document.querySelector('video');
                if (video) {
                    video.currentTime = start;
                    video.play();
                }
            };
            
            transcriptContent.appendChild(line);
        }
        
        // Store transcript text for later use
        window.videoTranscript = Array.from(textNodes)
            .map(node => {
                const start = parseFloat(node.getAttribute('start') || '0');
                const minutes = Math.floor(start / 60);
                const seconds = Math.floor(start % 60);
                const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                return `[${timestamp}] ${node.textContent || ''}`;
            })
            .join('\n');
        
        // Set flag indicating transcript is available
        window.hasTranscript = true;
        
        return true;
    } catch (error) {
        console.error('Error fetching transcript:', error);
        
        // Show error state with more specific error message
        transcriptContent.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
                <p>Failed to load transcript: ${error.message}</p>
                <p style="font-size: 12px;">Make sure captions are available for this video and try again.</p>
                <button id="fetch-transcript-btn" style="
                    margin-top: 16px;
                    padding: 8px 16px;
                    border: 1px solid rgba(0, 0, 0, 0.1);
                    border-radius: 6px;
                    background: #ffffff;
                    cursor: pointer;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 16px auto 0;
                ">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 5h12M9 3v4m1.5-2H21v18H3V3h7.5M9 19h6m-6-4h8" />
                    </svg>
                    Try Again
                </button>
            </div>
        `;
        
        return false;
    }
}

// Add this function to update the AI status indicator
function updateAiStatus() {
    const aiStatus = document.getElementById('readtube-ai-status');
    if (aiStatus) {
        const hasKey = !!openaiApiKey;
        aiStatus.textContent = `AI: ${hasKey ? 'Ready' : 'Not configured'}`;
        aiStatus.style.color = hasKey ? '#00a67e' : '#999';
    }
}

// Implement the sendToOpenAI function
async function sendToOpenAI(message) {
    if (!openaiApiKey) {
        addMessageToChat('⚠️ Please configure your OpenAI API key in the settings first.', 'system');
        return;
    }

    if (!window.videoTranscript) {
        addMessageToChat('⚠️ Please wait for the transcript to load first.', 'system');
        return;
    }

    const messagesContainer = document.getElementById('readtube-messages');
    const loadingMessage = document.createElement('div');
    loadingMessage.className = 'readtube-message readtube-assistant-message';
    loadingMessage.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <div class="loading-dots">
                <span style="animation-delay: 0s">.</span>
                <span style="animation-delay: 0.2s">.</span>
                <span style="animation-delay: 0.4s">.</span>
            </div>
        </div>
    `;
    messagesContainer.appendChild(loadingMessage);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `You are an AI assistant helping with a YouTube video. Here is the video transcript:\n\n${window.videoTranscript}\n\nPlease answer questions about this content.`
                    },
                    {
                        role: 'user',
                        content: message
                    }
                ],
                temperature: 0.7,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        const aiResponse = data.choices[0]?.message?.content;

        // Remove loading message
        messagesContainer.removeChild(loadingMessage);

        if (aiResponse) {
            addMessageToChat(aiResponse, 'assistant');
        } else {
            throw new Error('No response from AI');
        }
    } catch (error) {
        console.error('Error calling OpenAI:', error);
        // Remove loading message
        messagesContainer.removeChild(loadingMessage);
        addMessageToChat('❌ Sorry, there was an error processing your request. Please try again.', 'system');
    }
}

// Add loading dots animation style
const loadingStyle = document.createElement('style');
loadingStyle.textContent = `
    .loading-dots {
        display: flex;
        gap: 2px;
    }
    .loading-dots span {
        animation: loading-dots 1.4s infinite;
        font-size: 20px;
        line-height: 20px;
    }
    @keyframes loading-dots {
        0%, 80%, 100% { opacity: 0; }
        40% { opacity: 1; }
    }
`;
document.head.appendChild(loadingStyle);

})();