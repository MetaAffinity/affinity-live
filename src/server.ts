import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import {
  GoogleGenAI,
  LiveServerMessage,
  MediaResolution,
  Modality,
  Session,
} from '@google/genai';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

interface ClientConnection {
  ws: WebSocket;
  session?: Session;
  responseQueue: LiveServerMessage[];
  audioParts: string[];
  isProcessing: boolean;
}

const clients = new Map<WebSocket, ClientConnection>();

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');

  const clientConnection: ClientConnection = {
    ws,
    responseQueue: [],
    audioParts: [],
    isProcessing: false
  };

  clients.set(ws, clientConnection);

  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received message:', message.type);

      if (message.type === 'start') {
        // If the client already has an active session (e.g. voice mode started),
        // reuse it and send the prompt into the existing session so the
        // conversation context is preserved. Otherwise, create a new session.
        if (clientConnection.session) {
          console.log('Using existing session to send prompt');
          try {
            // Send prompt as simple string in turns array
            clientConnection.session.sendClientContent({
              turns: [message.prompt]
            });
          } catch (err) {
            console.error('Error sending prompt to existing session:', err);
            // If sending failed, attempt to start a fresh session as a fallback
            startGeminiSession(clientConnection, message.prompt);
          }
        } else {
          startGeminiSession(clientConnection, message.prompt);
        }
      } else if (message.type === 'start_voice') {
        startVoiceSession(clientConnection);
      } else if (message.type === 'audio_chunk') {
        // For now, just log - full duplex audio coming soon
        // The API will support this in future updates
        console.log('Received audio chunk from client');
      } else if (message.type === 'send_image') {
        sendImageToGemini(clientConnection, message.image, message.prompt);
      } else if (message.type === 'stop') {
        if (clientConnection.session) {
          clientConnection.session.close();
          clientConnection.session = undefined;
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (clientConnection.session) {
      clientConnection.session.close();
    }
    clients.delete(ws);
  });
});

async function startVoiceSession(client: ClientConnection) {
  try {
    console.log('Starting voice session');
    console.log('API Key present:', !!process.env.GEMINI_API_KEY);

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
    });

    // Use the exact model from the working src/index.ts example
    const model = 'models/gemini-2.0-flash-exp';
    console.log('Using model:', model);

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }

    // Keep AUDIO only - TEXT modality causes "invalid argument" error
    // The API will still return text content in the message parts
    const config = {
      responseModalities: [Modality.AUDIO]
    };

    client.audioParts = [];
    client.responseQueue = [];

    console.log('Attempting to connect to Gemini Live API...');

    // Add timeout for connection
    const connectionTimeout = setTimeout(() => {
      console.error('⏱️ Connection timeout - Gemini API not responding');
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Connection to Gemini API timed out. Please try again.'
      }));
    }, 30000); // 30 second timeout

    client.session = await ai.live.connect({
      model,
      callbacks: {
        onopen: function () {
          clearTimeout(connectionTimeout);
          console.log('✅ Voice session opened successfully');
          client.ws.send(JSON.stringify({ type: 'connected' }));
        },
        onmessage: function (message: LiveServerMessage) {
          console.log('📨 Received voice message from Gemini');
          client.responseQueue.push(message);
          processMessage(client, message);
        },
        onerror: function (e: ErrorEvent) {
          clearTimeout(connectionTimeout);
          console.error('❌ Gemini error:', e);
          console.error('Error type:', e.type);
          console.error('Error message:', e.message);
          client.ws.send(JSON.stringify({
            type: 'error',
            message: e.message || 'Gemini API error occurred'
          }));
        },
        onclose: function (e: CloseEvent) {
          clearTimeout(connectionTimeout);
          console.log('🔴 Voice session closed');
          console.log('Close code:', e.code);
          console.log('Close reason:', e.reason);
          console.log('Was clean:', e.wasClean);

          let reason = e.reason || 'Session closed';

          // Common error codes
          if (e.code === 1006) {
            reason = 'Connection closed abnormally. This might be due to an API key issue or network problem.';
          } else if (e.code === 1008) {
            reason = 'Policy violation. Check your API key permissions.';
          } else if (e.code === 1011) {
            reason = 'Server error occurred.';
          }

          client.ws.send(JSON.stringify({
            type: 'disconnected',
            reason: reason
          }));
        },
      },
      config
    });

    console.log('✅ Session object created successfully');
    console.log('✅ Voice session ready - waiting for user to speak...');

    // DON'T send initial prompt - wait for user to speak first
    // The session is ready, speech recognition will start on client side

  } catch (error) {
    console.error('❌ Error in startVoiceSession:', error);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    let errorMessage = 'Failed to start voice session';
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('Error stack:', error.stack);
    }

    client.ws.send(JSON.stringify({
      type: 'error',
      message: errorMessage
    }));

    // Also send disconnected to reset UI
    client.ws.send(JSON.stringify({
      type: 'disconnected',
      reason: 'Failed to initialize session'
    }));
  }
}

async function startGeminiSession(client: ClientConnection, prompt: string) {
  try {
    console.log('Starting Gemini session with prompt:', prompt.substring(0, 50));

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
    });

    const model = 'models/gemini-2.0-flash-exp';

    const config = {
      responseModalities: [Modality.AUDIO, Modality.TEXT],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Puck',
          }
        }
      }
    };

    client.audioParts = [];
    client.responseQueue = [];

    client.session = await ai.live.connect({
      model,
      callbacks: {
        onopen: function () {
          console.log('Gemini session opened - sending prompt');
          client.ws.send(JSON.stringify({ type: 'connected' }));
        },
        onmessage: function (message: LiveServerMessage) {
          console.log('Received message from Gemini');
          client.responseQueue.push(message);
          processMessage(client, message);
        },
        onerror: function (e: ErrorEvent) {
          console.error('Gemini error:', e.message);
          client.ws.send(JSON.stringify({
            type: 'error',
            message: e.message
          }));
        },
        onclose: function (e: CloseEvent) {
          console.log('Gemini session closed:', e.reason);
          client.ws.send(JSON.stringify({ type: 'disconnected' }));
        },
      },
      config
    });

    // Send the prompt as simple string
    console.log('Sending prompt to Gemini');
    client.session.sendClientContent({
      turns: [prompt]
    });

  } catch (error) {
    console.error('Error in startGeminiSession:', error);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to start session'
    }));
  }
}

// New function: Use standard Gemini REST API for image analysis (faster, more reliable)
async function analyzeImageWithStandardAPI(client: ClientConnection, base64Data: string, prompt: string) {
  try {
    console.log('Analyzing image with Gemini REST API');

    // Send connected status
    client.ws.send(JSON.stringify({ type: 'connected' }));

    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Data
            }
          }
        ]
      }]
    };

    console.log('Sending request to Gemini API...');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response text';

    console.log('Got response from Gemini:', text.substring(0, 100));

    // Send text response to client
    client.ws.send(JSON.stringify({
      type: 'text',
      content: text
    }));

    // Send turn complete
    client.ws.send(JSON.stringify({ type: 'turn_complete' }));

    // Send session complete (not disconnected - normal closure)
    client.ws.send(JSON.stringify({
      type: 'session_complete',
      reason: 'Image analyzed successfully'
    }));

  } catch (error) {
    console.error('Error analyzing image with REST API:', error);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to analyze image'
    }));
  }
}

async function sendImageToGemini(client: ClientConnection, imageData: string, prompt: string) {
  try {
    // Remove data URL prefix
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');

    // If there's an existing session (voice chat active), use it
    if (client.session) {
      console.log('Using existing session to send image');

      // For images, we need structured format with parts
      client.session.sendClientContent({
        turns: [{
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data
              }
            }
          ]
        }]
      });

      return;
    }

    // No active session - use standard Gemini API for faster, more reliable image analysis
    console.log('Using standard Gemini API for image analysis (faster, more reliable)');
    await analyzeImageWithStandardAPI(client, base64Data, prompt);
    return;

  } catch (error) {
    console.error('Error in sendImageToGemini:', error);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to process image'
    }));
  }
}

function processMessage(client: ClientConnection, message: LiveServerMessage) {
  // Handle text
  if (message.serverContent?.modelTurn?.parts) {
    const parts = message.serverContent.modelTurn.parts;

    for (const part of parts) {
      if (part?.text) {
        console.log('Got text:', part.text.substring(0, 50));
        client.ws.send(JSON.stringify({
          type: 'text',
          content: part.text
        }));
      }

      if (part?.inlineData) {
        console.log('Got audio chunk');
        client.audioParts.push(part.inlineData.data ?? '');

        // Send audio chunk to client
        client.ws.send(JSON.stringify({
          type: 'audio',
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType
        }));
      }
    }
  }

  // Handle turn complete
  if (message.serverContent?.turnComplete) {
    console.log('Turn complete');
    client.ws.send(JSON.stringify({ type: 'turn_complete' }));
  }
}

const PORT = process.env.PORT || 3002;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('API Key configured:', process.env.GEMINI_API_KEY ? 'Yes' : 'No');
});
