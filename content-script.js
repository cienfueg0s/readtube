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
        const isHidden = sidebar.style.right === '-385px';
        if (forceOpen === true) {
            sidebar.style.right = '0';
            reopenTab.style.display = 'none';
        } else if (forceOpen === false) {
            sidebar.style.right = '-385px';
            reopenTab.style.display = 'flex';
        } else {
            sidebar.style.right = isHidden ? '0' : '-385px';
            reopenTab.style.display = isHidden ? 'none' : 'flex';
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
            createSidebar();
            sidebarInitialized = true;
        }
    }, 1000);

    // Clear interval after 10 seconds to prevent infinite checking
    setTimeout(() => clearInterval(waitForYouTube), 10000);
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

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSidebar);
  } else {
    initializeSidebar();
  }

  function createChatInterface() {
    const chatContainer = document.createElement('div');
    chatContainer.className = 'readtube-chat-container';

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
            tempContainer.id = 'readtube-transcript-content';
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
    inputContainer.className = 'readtube-input-container';

    const textarea = document.createElement('textarea');
    textarea.className = 'readtube-chat-input';
    textarea.placeholder = 'Ask about the video...';
    textarea.id = 'readtube-chat-input';

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
    sidebarWrapper.style.height = 'calc(100vh - 60px)';
    sidebarWrapper.style.width = '385px';
    sidebarWrapper.style.transition = 'right 0.3s ease';
    sidebarWrapper.style.zIndex = '9999';

    // Create sidebar container first
    const sidebarContainer = document.createElement('div');
    sidebarContainer.id = 'readtube-sidebar-container';
    sidebarContainer.style.width = `${currentSettings.sidebarWidth}px`;
    sidebarContainer.style.height = `${currentSettings.sidebarHeight}vh`;
    sidebarContainer.style.backgroundColor = '#ffffff';
    sidebarContainer.style.display = 'flex';
    sidebarContainer.style.flexDirection = 'column';
    sidebarContainer.style.height = '100%';
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
    
    const settingsTab = document.createElement('button');
    settingsTab.className = 'readtube-tab readtube-tab-settings';
    settingsTab.textContent = 'Settings';
    
    transcriptTab.onclick = () => {
        updateActiveTab(transcriptTab);
        showTranscript();
    };

    askTab.onclick = () => {
        updateActiveTab(askTab);
        showAskInterface();
    };
    
    settingsTab.onclick = () => {
        updateActiveTab(settingsTab);
        showSettings();
    };
    
    function updateActiveTab(activeTab) {
        tabs.querySelectorAll('.readtube-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        activeTab.classList.add('active');
    }
    
    tabs.appendChild(transcriptTab);
    tabs.appendChild(askTab);
    tabs.appendChild(settingsTab);
    
    const mainContainer = document.createElement('div');
    mainContainer.id = 'readtube-main-container';
    mainContainer.style.flex = '1';
    mainContainer.style.overflow = 'auto';
    
    sidebarContainer.appendChild(header);
    sidebarContainer.appendChild(tabs);
    sidebarContainer.appendChild(mainContainer);
    sidebarWrapper.appendChild(sidebarContainer);
    document.body.appendChild(sidebarWrapper);

    // Initialize with transcript view and fetch transcript
    fetchTranscript().then(success => {
        if (success) {
            showTranscript();
        }
    });

    sidebarInitialized = true;
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
        mainContainer.appendChild(createTranscriptDisplay());
        // Auto-fetch transcript
        fetchTranscript();
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
    summarySection.innerHTML = `
        <div style="margin-bottom: 16px;">
            <h2 style="font-size: 18px; margin: 0;">✨ What just happened in this video?</h2>
        </div>
        <div id="auto-summary" style="color: #666; font-size: 14px; margin-bottom: 20px;">
            Loading summary...
        </div>
    `;
    insightsContainer.appendChild(summarySection);

    // Create insights buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'insights-buttons-container';
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.flexDirection = 'column';
    buttonsContainer.style.gap = '12px';
    buttonsContainer.style.padding = '16px';
    
    // Define insight buttons with new structure
    const insightButtons = [
        {
            label: '📝 Smart Summary',
            prompt: 'Generate a concise summary of this video that covers the main topics discussed and key conclusions. Format it as: "This video covers X, Y, and ends with Z."'
        },
        {
            label: '⏱️ Key Moments',
            prompt: 'Analyze the transcript and identify the most significant moments or turning points in the video. Look for emotional shifts, controversial statements, important revelations, or "mic drop" moments. Include timestamps.'
        },
        {
            label: '🎭 Sentiment Overview',
            prompt: 'Analyze the overall tone and sentiment of the video. Identify emotional patterns, shifts in tone, and provide a breakdown of positive vs negative sentiment. Include specific examples from the transcript.'
        },
        {
            label: '❓ Questions & Answers',
            prompt: 'Extract and answer the most important questions raised or addressed in this video. Format as Q&A pairs, focusing on key insights and memorable quotes.'
        },
        {
            label: '🔍 Deep Analysis',
            prompt: 'Provide an in-depth analysis of the main arguments, supporting evidence, and potential counterpoints presented in the video. Include notable quotes and their context.'
        }
    ];
    
    // Create and add buttons
    insightButtons.forEach(button => {
        const buttonElement = document.createElement('button');
        buttonElement.className = 'insight-button';
        buttonElement.innerHTML = button.label;
        buttonElement.style.padding = '12px 16px';
        buttonElement.style.border = '1px solid #ddd';
        buttonElement.style.borderRadius = '8px';
        buttonElement.style.background = '#ffffff';
        buttonElement.style.cursor = 'pointer';
        buttonElement.style.transition = 'all 0.2s';
        buttonElement.style.fontSize = '14px';
        buttonElement.style.textAlign = 'left';
        buttonElement.style.width = '100%';
        buttonElement.style.display = 'flex';
        buttonElement.style.alignItems = 'center';
        buttonElement.style.justifyContent = 'space-between';
        
        // Add arrow icon
        buttonElement.innerHTML += `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 8px;">
                <path d="M9 18l-7-7 7-7"/>
            </svg>
        `;
        
        // Hover effects
        buttonElement.onmouseover = () => {
            buttonElement.style.background = '#f5f5f5';
            buttonElement.style.borderColor = '#ccc';
        };
        buttonElement.onmouseout = () => {
            buttonElement.style.background = '#ffffff';
            buttonElement.style.borderColor = '#ddd';
        };
        
        // Click handler
        buttonElement.onclick = async () => {
            try {
                const { openaiApiKey } = await chrome.storage.local.get('openaiApiKey');
                if (!openaiApiKey) {
                    showNotification('⚠️ Please add your OpenAI API key in the Settings tab first.', 'error');
                    return;
                }

                if (!window.videoTranscript) {
                    // If no transcript, try to fetch it first
                    const tempContainer = document.createElement('div');
                    tempContainer.id = 'metube-transcript-content';
                    document.body.appendChild(tempContainer);
                    
                    await fetchTranscript();
                    document.body.removeChild(tempContainer);
                    
                    if (!window.videoTranscript) {
                        showNotification('⚠️ Please load the video transcript first.', 'error');
                        return;
                    }
                }

                // Clear previous content and show loading state
                const responseContainer = document.createElement('div');
                responseContainer.className = 'insight-response';
                responseContainer.style.padding = '20px';
                responseContainer.innerHTML = '<div style="text-align: center;">Analyzing video content...</div>';
                
                insightsContainer.innerHTML = '';
                insightsContainer.appendChild(responseContainer);

                // Send to OpenAI with enhanced prompt
                const response = await sendToOpenAIWithResponse(button.prompt);
                
                // Display the response with better formatting
                responseContainer.innerHTML = `
                    <div style="margin-bottom: 16px;">
                        <button class="back-to-insights" style="background: none; border: none; cursor: pointer; color: #666; display: flex; align-items: center; gap: 8px; padding: 8px 0;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 12H5M12 19l-7-7 7-7"/>
                            </svg>
                            Back to Insights
                        </button>
                    </div>
                    <h3 style="margin-bottom: 16px; font-size: 18px;">${button.label}</h3>
                    <div style="white-space: pre-wrap; line-height: 1.5; color: #333;">${response}</div>
                `;

                // Add click handler for the back button
                const backButton = responseContainer.querySelector('.back-to-insights');
                if (backButton) {
                    backButton.onclick = () => showInsights();
                }
            } catch (error) {
                showNotification(`❌ Error: ${error.message}`, 'error');
            }
        };
        
        buttonsContainer.appendChild(buttonElement);
    });
    
    insightsContainer.appendChild(buttonsContainer);
    mainContainer.appendChild(insightsContainer);

    // Auto-generate initial summary
    generateInitialSummary();
  }

  // New function to handle OpenAI responses for insights
  async function sendToOpenAIWithResponse(prompt) {
    try {
        const { openaiApiKey } = await chrome.storage.local.get('openaiApiKey');
        if (!openaiApiKey) throw new Error('OpenAI API key not found');

        const messages = [
            {
                role: "system",
                content: "You are an AI assistant analyzing YouTube video content. Provide clear, concise, and insightful analysis."
            }
        ];

        if (window.videoTranscript) {
            messages.push({
                role: "system",
                content: `Here is the video transcript:\n\n${window.videoTranscript}`
            });
        }

        messages.push({
            role: "user",
            content: prompt
        });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: messages,
                temperature: 0.7,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Failed to get response from OpenAI');
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        throw new Error(`Failed to analyze video: ${error.message}`);
    }
  }

  // Function to generate initial summary
  async function generateInitialSummary() {
    try {
        const summaryElement = document.getElementById('auto-summary');
        if (!summaryElement) return;

        const { openaiApiKey } = await chrome.storage.local.get('openaiApiKey');
        if (!openaiApiKey) {
            summaryElement.innerHTML = `
                <div style="color: #666; padding: 12px; background: #f5f5f5; border-radius: 6px;">
                    Please add your OpenAI API key in Settings to get video insights.
                </div>`;
            return;
        }

        if (!window.videoTranscript) {
            // Try to fetch transcript
            const tempContainer = document.createElement('div');
            tempContainer.id = 'metube-transcript-content';
            document.body.appendChild(tempContainer);
            
            await fetchTranscript();
            document.body.removeChild(tempContainer);
        }

        if (!window.videoTranscript) {
            summaryElement.innerHTML = `
                <div style="color: #666; padding: 12px; background: #f5f5f5; border-radius: 6px;">
                    Please load the video transcript to get insights.
                </div>`;
            return;
        }

        summaryElement.innerHTML = `
            <div style="color: #666; padding: 12px; background: #f5f5f5; border-radius: 6px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                    </svg>
                    Analyzing video content...
                </div>
            </div>
        `;

        const response = await sendToOpenAIWithResponse(
            "Provide a very concise 2-3 sentence summary of what happened in this video. Focus on the main topic and key takeaway."
        );

        summaryElement.innerHTML = `
            <div style="color: #333; line-height: 1.5;">
                ${response}
            </div>`;
    } catch (error) {
        const summaryElement = document.getElementById('auto-summary');
        if (summaryElement) {
            summaryElement.innerHTML = `
                <div style="color: #ff4444; padding: 12px; background: #fff5f5; border-radius: 6px;">
                    Error generating summary: ${error.message}
                </div>`;
        }
    }
  }

  function showSettings() {
    const mainContainer = document.getElementById('readtube-main-container');
    if (!mainContainer) return;
    
    mainContainer.innerHTML = '';
    
    const settingsContainer = document.createElement('div');
    settingsContainer.className = 'readtube-settings-container';
    
    // AI Settings Section
    const aiSection = document.createElement('div');
    aiSection.className = 'settings-section';
    
    const aiTitle = document.createElement('h3');
    aiTitle.textContent = 'AI Settings';
    
    const apiDescription = document.createElement('div');
    apiDescription.innerHTML = `
        <div style="margin-bottom: 16px;">
            <p>To use the AI chat feature, you need an OpenAI API key:</p>
            <ol style="margin-left: 20px; margin-bottom: 16px;">
                <li>Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #ff0000;">OpenAI's website</a></li>
                <li>Enter your key below (starts with 'sk-')</li>
                <li>Click Save to securely store your key</li>
            </ol>
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

  async function sendToOpenAI(message) {
    try {
        const { openaiApiKey } = await chrome.storage.local.get('openaiApiKey');
        if (!openaiApiKey) {
            addMessageToChat('⚠️ Please add your OpenAI API key in the Settings tab first.', 'system');
            return;
        }

        // Add loading message
        const messagesContainer = document.getElementById('readtube-messages');
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'readtube-message readtube-system-message';
        loadingDiv.style.display = 'flex';
        loadingDiv.style.alignItems = 'center';
        loadingDiv.style.gap = '8px';
        loadingDiv.style.padding = '8px 12px';
        loadingDiv.style.fontSize = '13px';
        loadingDiv.style.color = '#666';
        loadingDiv.innerHTML = `
            <div class="loading-dots">
                <span style="animation: pulse 1s infinite">•</span>
                <span style="animation: pulse 1s infinite .2s">•</span>
                <span style="animation: pulse 1s infinite .4s">•</span>
            </div>
        `;
        messagesContainer.appendChild(loadingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        const messages = [
            {
                role: "system",
                content: "You are a helpful AI assistant analyzing a YouTube video. Keep your responses very concise - aim for 2-4 sentences and under 50 words. Be direct and to the point."
            }
        ];
        
        if (window.videoTranscript) {
            messages.push({
                role: "system",
                content: `Here is the video transcript:\n\n${window.videoTranscript}\n\nProvide brief, focused answers about the video content.`
            });
        }

        messages.push({
            role: "user",
            content: message
        });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: messages,
                temperature: 0.5,
                max_tokens: 100,
                presence_penalty: 0.1,
                frequency_penalty: 0.1
            })
        });

        // Remove loading message
        messagesContainer.removeChild(loadingDiv);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
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

  // Add loading animation styles
  const loadingStyle = document.createElement('style');
  loadingStyle.textContent = `
      @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
      }
      .loading-dots {
          display: flex;
          gap: 2px;
      }
      .loading-dots span {
          font-size: 20px;
          line-height: 0;
      }
  `;
  document.head.appendChild(loadingStyle);

  function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `readtube-notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
  }

  // Add the transcript-related functions
async function fetchTranscript() {
    // Ensure we have a container
    let transcriptContent = document.getElementById('readtube-transcript-content');
    if (!transcriptContent) {
        console.log('Creating transcript container');
        const mainContainer = document.getElementById('readtube-main-container');
        if (!mainContainer) {
            console.error('Main container not found');
            return false;
        }
        transcriptContent = document.createElement('div');
        transcriptContent.id = 'readtube-transcript-content';
        mainContainer.appendChild(transcriptContent);
    }

    // Clear existing content
    transcriptContent.innerHTML = '';

    try {
        const videoId = getVideoId();
        if (!videoId) {
            throw new Error('Could not find video ID');
        }

        let transcript = [];
        let success = false;
        
        // First try to get transcript from ytInitialPlayerResponse
        try {
            const ytInitialPlayerResponse = window.ytInitialPlayerResponse;
            if (ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length > 0) {
                const captionTrack = ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks[0];
                const response = await fetch(captionTrack.baseUrl);
                if (!response.ok) throw new Error('Failed to fetch transcript');
                const text = await response.text();
                const parser = new DOMParser();
                const xml = parser.parseFromString(text, 'text/xml');
                const textElements = xml.getElementsByTagName('text');
                
                for (const element of textElements) {
                    const start = parseFloat(element.getAttribute('start'));
                    const duration = parseFloat(element.getAttribute('dur') || '0');
                    const text = element.textContent.trim();
                    if (text) {
                        transcript.push({ start, duration, text });
                    }
                }
                if (transcript.length > 0) success = true;
            }
        } catch (e) {
            console.log('Failed to get transcript from ytInitialPlayerResponse:', e);
        }
        
        // If no transcript found in ytInitialPlayerResponse, try parsing page source
        if (!success) {
            try {
                const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
                if (!response.ok) throw new Error('Failed to fetch video page');
                const html = await response.text();
                const match = html.match(/"captionTracks":\[(.*?)\]/);
                if (!match) {
                    throw new Error('No captions available for this video');
                }
                
                const captionTracks = JSON.parse(`[${match[1]}]`);
                if (captionTracks.length === 0) {
                    throw new Error('No caption tracks found');
                }
                
                const firstTrack = captionTracks[0];
                const captionResponse = await fetch(firstTrack.baseUrl);
                if (!captionResponse.ok) throw new Error('Failed to fetch captions');
                const captionText = await captionResponse.text();
                const parser = new DOMParser();
                const xml = parser.parseFromString(captionText, 'text/xml');
                const textElements = xml.getElementsByTagName('text');
                
                transcript = [];
                for (const element of textElements) {
                    const start = parseFloat(element.getAttribute('start'));
                    const duration = parseFloat(element.getAttribute('dur') || '0');
                    const text = element.textContent.trim();
                    if (text) {
                        transcript.push({ start, duration, text });
                    }
                }
                if (transcript.length > 0) success = true;
            } catch (e) {
                console.log('Failed to get transcript from page source:', e);
                throw e;
            }
        }

        if (transcript.length === 0) {
            throw new Error('No transcript content found');
        }

        // Format and display transcript
        let formattedTranscript = '';
        transcript.forEach(({ start, text }) => {
            const minutes = Math.floor(start / 60);
            const seconds = Math.floor(start % 60);
            const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            const line = document.createElement('div');
            line.className = 'transcript-line';
            
            const timestampSpan = document.createElement('span');
            timestampSpan.className = 'transcript-timestamp';
            timestampSpan.textContent = timestamp;
            timestampSpan.onclick = () => {
                const video = document.querySelector('video');
                if (video) {
                    video.currentTime = start;
                    video.play();
                    timestampSpan.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
                    setTimeout(() => {
                        timestampSpan.style.backgroundColor = '';
                    }, 500);
                }
            };
            
            const textSpan = document.createElement('span');
            textSpan.className = 'transcript-text';
            
            // Create a temporary div to decode HTML entities
            const decoder = document.createElement('div');
            decoder.innerHTML = text;
            const decodedText = decoder.textContent;
            
            textSpan.textContent = decodedText;
            
            line.appendChild(timestampSpan);
            line.appendChild(textSpan);
            transcriptContent.appendChild(line);
            
            formattedTranscript += `[${timestamp}] ${decodedText}\n`;
        });

        // Store transcript for AI features
        window.readtubeTranscript = formattedTranscript.trim();
        window.videoTranscript = formattedTranscript.trim();
        return true;
        
    } catch (error) {
        console.error('Error fetching transcript:', error);
        transcriptContent.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
                <p>Could not load transcript.</p>
                <p style="font-size: 12px;">${error.message}</p>
            </div>
        `;
        return false;
    }
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
        showActionNotification('Transcript copied to clipboard');
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
      showActionNotification('Transcript downloaded');
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

})();