// MeTube 1.0.00 - popup.js

document.addEventListener('DOMContentLoaded', () => {
    // Button click handlers
    document.getElementById('toggleSidebar').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleSidebar' });
        });
    });

    document.getElementById('refreshTranscript').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'refreshTranscript' });
        });
    });

    document.getElementById('openSettings').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'showSettings' });
        });
    });

    // New transcript action handlers
    document.getElementById('copyTranscript').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getTranscript' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    return;
                }
                
                if (response && response.transcript) {
                    navigator.clipboard.writeText(response.transcript).then(() => {
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
                        }, 2000);
                    });
                }
            });
        });
    });

    document.getElementById('downloadTranscript').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getTranscript' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    return;
                }
                
                if (response && response.transcript) {
                    const blob = new Blob([response.transcript], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'transcript.txt';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

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
                    }, 2000);
                }
            });
        });
    });

    // Open YouTube button
    document.getElementById('openYouTube').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].url.includes('youtube.com/watch')) {
                // If already on YouTube, just focus the tab
                chrome.tabs.update(tabs[0].id, { active: true });
            } else {
                // Open YouTube homepage in a new tab
                chrome.tabs.create({ url: 'https://www.youtube.com' });
            }
        });
    });

    // Documentation and Report Issue links
    document.getElementById('documentation').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://github.com/yourusername/metube/wiki' });
    });

    document.getElementById('reportIssue').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://github.com/yourusername/metube/issues/new' });
    });

    // Check current tab status
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        const contentWrapper = document.querySelector('.content-wrapper');
        
        if (!currentTab.url.includes('youtube.com/watch')) {
            // Add inactive class to wrapper
            contentWrapper.classList.add('inactive');
            
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
        } else {
            // Remove inactive class if on YouTube video
            contentWrapper.classList.remove('inactive');
            
            // Request status from content script
            chrome.tabs.sendMessage(currentTab.id, { action: 'getStatus' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    return;
                }
                
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
}); 