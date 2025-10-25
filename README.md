# Gemini Live - Voice & Screen Share Assistant

This project demonstrates how to use the Google Gemini Live API with native audio capabilities for voice interaction and screen sharing analysis.

## Features

- **Web Interface**: Beautiful, modern web UI for easy interaction
- **Real-time Audio**: Streaming audio responses with Gemini 2.5 Flash Native Audio
- **Screen Sharing**: Capture and share your screen for AI analysis
- **Live Sessions**: Real-time WebSocket-based communication
- **Audio Playback**: Listen to and download AI responses
- **WAV Conversion**: Automatic audio format conversion
- **Medium Resolution Media**: High-quality screen capture support
- **Context Window Compression**: Efficient processing for long conversations

## Prerequisites

- Node.js (v16 or higher)
- A Google Gemini API key

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your API key:
   - Copy `.env.example` to `.env` (already done)
   - Add your Gemini API key to `.env`
   - **IMPORTANT**: Revoke the current API key and generate a new one for security

3. Update the input message:
   - Open `src/index.ts`
   - Find line with `INSERT_INPUT_HERE`
   - Replace with your desired message/prompt

## Usage

### Web Interface (Recommended)

Start the web server:
```bash
npm run server
```

Then open your browser and navigate to:
```
http://localhost:3000
```

**Using the Web Interface:**
1. Enter your message or question in the text area
2. Click "Start Session" to begin conversation
3. Click "Share Screen" to enable screen sharing
4. Click "Capture & Ask" to send a screenshot with your question to Gemini
5. Listen to audio responses and view text responses
6. Download audio responses if needed
7. Click "Stop" to end the session

### CLI Mode

Run in development mode (CLI only):
```bash
npm run dev
```

Or build and run:
```bash
npm run build
npm start
```

**Note**: For CLI mode, update the input message in `src/index.ts` before running.

## How it Works

### Web Interface Flow:
1. Browser connects to server via WebSocket
2. User enters message and/or shares screen
3. Server establishes live session with Gemini API
4. Screen captures are sent as base64-encoded images
5. Gemini analyzes and responds with both text and audio
6. Audio is streamed back in chunks and converted to WAV
7. User can play or download the audio response

### CLI Flow:
1. Establishes a live session with Gemini using the configured API key
2. Sends your input message to the model
3. Receives audio responses in real-time
4. Converts the raw audio data to WAV format
5. Saves the audio output as `audio.wav`

## Configuration

The session is configured with:
- Voice: Algenib
- Response modality: Audio
- Media resolution: Medium
- Context window compression enabled

You can modify these settings in `src/index.ts` in the `config` object.

## Security Note

Never commit your `.env` file to version control. The `.gitignore` is configured to exclude it.

## Output

- **Web Interface**: Audio plays directly in browser and can be downloaded
- **CLI Mode**: Generated audio files saved as `audio.wav` in the project root

## Project Structure

```
gemini-live/
├── src/
│   ├── index.ts           # CLI application
│   └── server.ts          # Web server with WebSocket support
├── public/
│   ├── index.html         # Web interface
│   ├── style.css          # Styling
│   └── app.js             # Client-side JavaScript
├── .env                   # Environment variables (API key)
├── .env.example           # Template for environment variables
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md              # This file
```

## Technologies Used

- **Backend**: Node.js, Express, WebSocket (ws)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **AI**: Google Gemini 2.5 Flash with Native Audio
- **TypeScript**: For type safety and better development experience

## Browser Compatibility

The web interface requires:
- Modern browser with WebSocket support
- Screen sharing support (Chrome, Edge, Firefox recommended)
- Audio playback capabilities

## Troubleshooting

**Screen sharing not working?**
- Make sure you're using HTTPS or localhost
- Grant permission when browser prompts
- Try Chrome or Edge for best compatibility

**No audio response?**
- Check browser console for errors
- Ensure API key is correctly configured
- Verify audio player is not muted

**Connection errors?**
- Verify the server is running (`npm run server`)
- Check if port 3000 is available
- Look for firewall/antivirus blocking

## Security Recommendations

1. **Never** commit `.env` file to version control
2. **Always** revoke and regenerate API keys if exposed
3. Use environment variables for sensitive data
4. Consider adding authentication for production use
5. Use HTTPS in production environments
