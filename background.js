// JTube4 - background.js

chrome.runtime.onInstalled.addListener(() => {
  console.log('JTube4 extension installed');
  
  // Set default settings if not already set
  chrome.storage.sync.get(['theme', 'fontSize', 'apiKey', 'aiModel'], function(result) {
    const defaults = {
      theme: result.theme || 'dark',
      fontSize: result.fontSize || 'medium',
      aiModel: result.aiModel || 'gpt-3.5-turbo'
    };
    
    chrome.storage.sync.set(defaults);
  });
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle messages here if needed
  if (message.action === 'getTranscript') {
    console.log('Background script received request to get transcript');
  }
  
  return true; // Required for async response
});