// MeTube 1.0.00 - popup.js

document.addEventListener('DOMContentLoaded', () => {
    // Get UI elements
    const notYoutubeMessage = document.getElementById('not-youtube-message');
    const notVideoMessage = document.getElementById('not-video-message');
    const mainContent = document.getElementById('main-content');

    // Navigation buttons
    document.getElementById('goto-youtube').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://www.youtube.com' });
    });

    document.getElementById('goto-home').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentUrl = new URL(tabs[0].url);
            chrome.tabs.update(tabs[0].id, { url: `${currentUrl.origin}/feed/subscriptions` });
        });
    });

    // Check current state and initialize if needed
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const currentTab = tabs[0];
        const url = currentTab?.url || '';

        if (!url.includes('youtube.com')) {
            notYoutubeMessage.style.display = 'block';
            notVideoMessage.style.display = 'none';
            mainContent.style.display = 'none';
        } else if (!url.includes('youtube.com/watch')) {
            notYoutubeMessage.style.display = 'none';
            notVideoMessage.style.display = 'block';
            mainContent.style.display = 'none';
        } else {
            // Ensure content script is initialized
            try {
                await chrome.tabs.sendMessage(currentTab.id, { action: 'isInitialized' });
            } catch (e) {
                // If content script isn't ready, wait a bit and try again
                await new Promise(resolve => setTimeout(resolve, 500));
                await chrome.tabs.sendMessage(currentTab.id, { action: 'initialize' });
            }
            
            notYoutubeMessage.style.display = 'none';
            notVideoMessage.style.display = 'none';
            mainContent.style.display = 'block';
        }
    });

    // Add click handlers for features
    document.getElementById('transcript').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            try {
                await chrome.tabs.sendMessage(tabs[0].id, { 
                    action: 'toggleSidebar',
                    feature: 'transcript',
                    openFromPopup: true,
                    tab: 'transcript'
                });
                window.close();
            } catch (e) {
                console.error('Failed to open transcript:', e);
            }
        });
    });

    document.getElementById('ask').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            try {
                await chrome.tabs.sendMessage(tabs[0].id, { 
                    action: 'toggleSidebar',
                    feature: 'ask',
                    openFromPopup: true,
                    tab: 'ask'
                });
                window.close();
            } catch (e) {
                console.error('Failed to open ask:', e);
            }
        });
    });
});

function initializePopup() {
    // Show content
    document.querySelector('.content-wrapper').style.display = 'block';
    document.querySelector('.inactive-notice').style.display = 'none';

    // Get status indicators
    const transcriptIndicator = document.querySelector('.status-list .status-indicator:first-child');
    const aiIndicator = document.querySelector('.status-list .status-indicator:last-child');
    
    // Set initial indicator states
    transcriptIndicator.style.backgroundColor = '#666';
    aiIndicator.style.backgroundColor = '#666';

    // Get video info and update title
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getVideoInfo' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                return;
            }
            
            if (response?.title) {
                document.querySelector('.video-title-text').textContent = response.title;
            }
        });

        // Check status
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                return;
            }
            
            if (response) {
                transcriptIndicator.style.backgroundColor = response.transcriptAvailable ? '#4CAF50' : '#666';
                aiIndicator.style.backgroundColor = response.aiEnabled ? '#4CAF50' : '#666';
            }
        });
    });

    // Button click handlers
    document.getElementById('toggleSidebar').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleSidebar', openFromPopup: true });
            window.close();
        });
    });

    document.getElementById('refreshTranscript').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'refreshTranscript' });
            // Show loading state
            const button = document.getElementById('refreshTranscript');
            const originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                Refreshing...
            `;
            
            setTimeout(() => {
                button.disabled = false;
                button.innerHTML = originalText;
                checkStatus();
            }, 2000);
        });
    });

    document.getElementById('openSettings').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'showSettings', openFromPopup: true });
            window.close();
        });
    });

    // Transcript action handlers
    document.getElementById('copyTranscript').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'copyTranscriptToClipboard' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    return;
                }
                
                if (response && response.success) {
                    const button = document.getElementById('copyTranscript');
                    const originalText = button.innerHTML;
                    button.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                        Copied!
                    `;
                    setTimeout(() => {
                        button.innerHTML = originalText;
                        window.close();
                    }, 1000);
                }
            });
        });
    });

    document.getElementById('downloadTranscript').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'downloadTranscript' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    return;
                }
                
                if (response && response.success) {
                    const button = document.getElementById('downloadTranscript');
                    const originalText = button.innerHTML;
                    button.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                        Downloaded!
                    `;
                    setTimeout(() => {
                        button.innerHTML = originalText;
                        window.close();
                    }, 1000);
                }
            });
        });
    });

    // Open YouTube button
    document.getElementById('openYouTube').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].url.includes('youtube.com/watch')) {
                chrome.tabs.update(tabs[0].id, { active: true });
                window.close();
            } else if (tabs[0].url.includes('youtube.com')) {
                const button = document.getElementById('openYouTube');
                const originalText = button.innerHTML;
                button.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    Select a video
                `;
                setTimeout(() => {
                    button.innerHTML = originalText;
                }, 3000);
            } else {
                chrome.tabs.create({ url: 'https://www.youtube.com' });
                window.close();
            }
        });
    });

    // Documentation and Report Issue links
    document.getElementById('documentation').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://github.com/cienfueg0s/readtube' });
        window.close();
    });

    document.getElementById('reportIssue').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://github.com/cienfueg0s/readtube/issues/new' });
        window.close();
    });

    function checkStatus() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            const contentWrapper = document.querySelector('.content-wrapper');
            const videoTitleContainer = document.querySelector('.video-title');
            const videoTitleText = document.querySelector('.video-title-text');
            
            if (!currentTab.url.includes('youtube.com/watch')) {
                contentWrapper.classList.add('inactive');
                videoTitleContainer.classList.remove('visible');
                
                document.querySelectorAll('.status-indicator').forEach(indicator => {
                    indicator.style.backgroundColor = '#666';
                });
                document.querySelectorAll('.status-item span').forEach(text => {
                    text.style.color = '#666';
                });
                document.querySelectorAll('.button').forEach(button => {
                    if (button.id !== 'openYouTube') {
                        button.disabled = true;
                        button.style.opacity = '0.5';
                        button.style.cursor = 'not-allowed';
                    }
                });

                if (currentTab.url.includes('youtube.com')) {
                    document.getElementById('openYouTube').innerHTML = `
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                        </svg>
                        Select a video
                    `;
                }
            } else {
                contentWrapper.classList.remove('inactive');
                
                chrome.tabs.sendMessage(currentTab.id, { action: 'getVideoInfo' }, (response) => {
                    if (chrome.runtime.lastError) return;
                    
                    if (response && response.title) {
                        videoTitleText.textContent = response.title;
                        videoTitleContainer.classList.add('visible');
                    }
                });
                
                chrome.tabs.sendMessage(currentTab.id, { action: 'getStatus' }, (response) => {
                    if (chrome.runtime.lastError) return;
                    
                    if (response) {
                        const indicators = document.querySelectorAll('.status-indicator');
                        if (response.transcriptAvailable) {
                            indicators[0].style.backgroundColor = '#4CAF50';
                        } else {
                            indicators[0].style.backgroundColor = '#f44336';
                        }
                        if (response.aiEnabled) {
                            indicators[1].style.backgroundColor = '#4CAF50';
                        } else {
                            indicators[1].style.backgroundColor = '#f44336';
                        }
                    }
                });
            }
        });
    }

    // Initial status check
    checkStatus();
} 