'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const OpenAI = require('openai');
const { createAnalyzeHandler } = require('./review-analysis');

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

// Nenhum SDK Admin/Firestore inicializado; só análise, nunca persistência.
exports.analyzeAtlasReviewBatch = onCall({
  region: 'us-central1',
  secrets: [OPENAI_API_KEY],
  timeoutSeconds: 300,
  memory: '512MiB',
  maxInstances: 2,
  concurrency: 4
}, createAnalyzeHandler({
  HttpsError,
  getApiKey: () => OPENAI_API_KEY.value(),
  createClient: (apiKey) => new OpenAI({
    apiKey, timeout: 240000, maxRetries: 0, logLevel: 'off'
  })
}));
