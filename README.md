# MeTube 1.0.00

A powerful Chrome extension that enhances YouTube with a transcript viewer and AI assistant. This project is actively being improved with new features and optimizations.

## Features

- **YouTube Sidebar**: Automatically appears on YouTube video pages
- **Transcript Viewer**: Extract and read video transcripts
  - Hover controls for quick copy and download
  - Clickable timestamps to jump to video sections
  - Search with text highlighting
- **AI Chat**: Discuss video content with AI assistance
- **Simple UI**: Clean, modern interface with dark/light themes

## Installation

1. Download the extension ZIP file
2. Extract the contents
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top-right corner
5. Click "Load unpacked" and select the extracted folder

## Usage

1. Navigate to any YouTube video
2. The MeTube sidebar will appear on the right side
3. The transcript will load automatically
4. Hover over the transcript to reveal copy/download buttons
5. Click timestamps to jump to specific parts of the video
6. Use the search bar to find specific content
7. Switch to AI Chat to ask questions about the video
8. Use the toggle button (◀/▶) to hide or show the sidebar

### Transcript Features
- **Copy**: Quickly copy the entire transcript with timestamps
- **Download**: Save the transcript as a text file
- **Search**: Find specific words or phrases with highlighting
- **Timestamps**: Click any timestamp to jump to that point in the video

## AI Chat Requirements

### OpenAI API Key
- Required for AI features
- Enter your API key in the Settings tab
- Must start with 'sk-'
- Get your key from [OpenAI's platform](https://platform.openai.com/api-keys)

### Supported Models
The extension automatically tries different models in this order:
1. GPT-4 Turbo (if your API key has access)
2. GPT-3.5-16k (for longer transcripts)
3. GPT-3.5-turbo (default)

### Token Handling
- Maximum context length varies by model:
  - GPT-4 Turbo: ~128K tokens
  - GPT-3.5-16k: ~16K tokens
  - GPT-3.5-turbo: ~4K tokens
- The extension automatically:
  - Chunks long transcripts
  - Selects relevant portions
  - Uses semantic search to find relevant content
  - Falls back to simpler models if needed

### Best Practices
- For best results, use GPT-4 access
- Keep questions specific to parts of the video
- Use timestamps when referring to specific moments
- Consider upgrading to GPT-4 for longer videos

## Roadmap

We are actively working on the following improvements:

### Phase 1 - Quick Wins
- Dark mode implementation
- Transcript search with highlighting
- Keyboard shortcuts
- Loading indicators
- Error handling improvements

### Phase 2 - Feature Enhancements
- Transcript translation
- AI-powered summarization
- Export options (TXT, SRT, VTT)
- Custom AI prompts
- Timestamp bookmarking
- Better token handling and compression
- Support for more AI models

### Phase 3 - Technical Improvements
- Performance optimizations
- Enhanced security features
- Accessibility improvements
- Extended platform support
- Improved context handling for long videos

## Version History

1.0.00 - Initial release with core functionality
- Transcript viewing
- AI chat integration with model fallbacks
- Basic sidebar interface
- Smart token handling for long transcripts