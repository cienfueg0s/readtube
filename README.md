# ReadTube iOS

A native iOS app that records audio, transcribes it, and allows users to interact with the transcript using AI. This is the iOS version of ReadTube, focusing on audio recording and transcription capabilities.

## Features

- **Audio Recording**
  - High-quality audio recording
  - Background recording support
  - Recording pause/resume
  - Audio file management

- **Transcription**
  - Real-time transcription using OpenAI's Whisper API
  - Support for multiple languages
  - Timestamp-based transcript navigation

- **AI Chat**
  - Interactive chat interface for asking questions about the transcript
  - Context-aware responses using GPT-4/3.5
  - Support for multiple AI models

## Technical Requirements

- iOS 15.0+
- Xcode 14.0+
- Swift 5.0+
- OpenAI API Key
- Microphone permissions
- Background audio capabilities

## Project Structure

```
ReadTube/
├── ReadTube/
│   ├── App/
│   │   ├── AppDelegate.swift
│   │   └── SceneDelegate.swift
│   ├── Features/
│   │   ├── Recording/
│   │   │   ├── RecordingViewController.swift
│   │   │   ├── RecordingViewModel.swift
│   │   │   └── RecordingView.swift
│   │   ├── Transcription/
│   │   │   ├── TranscriptionViewController.swift
│   │   │   ├── TranscriptionViewModel.swift
│   │   │   └── TranscriptionView.swift
│   │   └── Chat/
│   │       ├── ChatViewController.swift
│   │       ├── ChatViewModel.swift
│   │       └── ChatView.swift
│   ├── Services/
│   │   ├── AudioService.swift
│   │   ├── TranscriptionService.swift
│   │   └── AIService.swift
│   ├── Models/
│   │   ├── Recording.swift
│   │   ├── Transcript.swift
│   │   └── ChatMessage.swift
│   └── Utils/
│       ├── Constants.swift
│       └── Extensions/
└── Resources/
    ├── Assets.xcassets/
    └── Info.plist
```

## Setup Instructions

1. Clone the repository
2. Open `ReadTube.xcodeproj` in Xcode
3. Add your OpenAI API key in the project settings
4. Build and run the project

## Dependencies

- OpenAI API for transcription and chat
- AVFoundation for audio recording
- CoreData for local storage
- Combine framework for reactive programming

## Future Enhancements

- Cloud backup support
- Share recordings and transcripts
- Export options (TXT, SRT)
- Offline mode
- Background transcription
- Multiple language support
- Audio editing features
