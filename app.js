// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE CONFIG
// Replace the object below with YOUR project's config from the Firebase console:
//   Project settings → General → Your apps → SDK setup and configuration
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCXiQMbbavocKxAk2QjMPxyoNkD4bewgQs",
  authDomain: "homegroup-game.firebaseapp.com",
  projectId: "homegroup-game",
  storageBucket: "homegroup-game.firebasestorage.app",
  messagingSenderId: "703057999097",
  appId: "1:703057999097:web:df4fe49be49e86b3c7de28"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ─────────────────────────────────────────────────────────────────────────────
// QUESTIONS  (hardcoded — add more here as needed)
// ─────────────────────────────────────────────────────────────────────────────
const QUESTIONS = [
  { text: 'Who was the letter written to?', answers: ['The church in Rome', 'The twelve tribes scattered among the nations'] },
  { text: 'What does James say happens to the person who looks in a mirror and walks away?', answers: ['They forget what they look like', 'They become proud of their appearance'] },
  { text: 'What does James say tames the tongue?', answers: ['Wisdom', 'Nothing — no human can tame it'] },
  { text: 'What kind of wisdom comes from heaven?', answers: ['Pure, peace-loving, and considerate', 'Bold, direct, and powerful'] },
  { text: 'According to James 1, what is the "soil" for the word that is "planted in you" which can save you?', answers: ['The humility with which you accept it', 'The sincerity of faith you feel when you hear it'] },
];

const GAME_DOC = doc(db, 'games', 'game1');

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER IDENTITY  (random UUID per browser tab, persisted in sessionStorage)
// ─────────────────────────────────────────────────────────────────────────────
function getPlayerId() {
  let id = sessionStorage.getItem('playerId');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('playerId', id);
  }
  return id;
}
const playerId = getPlayerId();
let isAdmin = false;

// ─────────────────────────────────────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────────────────────────────────────
const screens = {
  join:    document.getElementById('join-screen'),
  waiting: document.getElementById('waiting-screen'),
  game:    document.getElementById('game-screen'),
  results: document.getElementById('results-screen'),
  done:    document.getElementById('done-screen'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ─────────────────────────────────────────────────────────────────────────────
// JOIN
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById('join-btn').addEventListener('click', handleJoin);
document.getElementById('player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleJoin();
});

async function handleJoin() {
  const name    = document.getElementById('player-name').value.trim();
  const wantHost = document.getElementById('is-host').checked;
  const errEl   = document.getElementById('join-error');

  if (!name) { showError(errEl, 'Please enter your name.'); return; }

  if (name.toLowerCase() === 'letmein') {
    document.getElementById('join-form').classList.add('hidden');
    document.getElementById('letmein-panel').classList.remove('hidden');
    return;
  }

  // Ensure the game document exists with default state
  const snap = await getDoc(GAME_DOC);
  if (!snap.exists()) {
    await setDoc(GAME_DOC, {
      phase: 'waiting',
      currentQuestion: 0,
      adminId: null,
      players: {},
      answers: {},
    });
  }

  const data = (await getDoc(GAME_DOC)).data();

  if (wantHost && data.adminId && data.adminId !== playerId) {
    showError(errEl, 'A host has already joined. Uncheck "I am the host".');
    return;
  }

  // Build update
  const update = { [`players.${playerId}`]: { name } };
  if (wantHost) {
    update.adminId = playerId;
    isAdmin = true;
  }

  await updateDoc(GAME_DOC, update);

  // If we're re-joining mid-game, isAdmin may have been set already
  if (!wantHost && data.adminId === playerId) isAdmin = true;

  startListening();
}

function showLetmeinBack() {
  document.getElementById('letmein-panel').classList.add('hidden');
  document.getElementById('join-form').classList.remove('hidden');
  document.getElementById('player-name').value = '';
}

document.getElementById('letmein-back-btn').addEventListener('click', showLetmeinBack);

document.getElementById('reset-game-btn').addEventListener('click', async () => {
  await setDoc(GAME_DOC, {
    phase: 'waiting',
    currentQuestion: 0,
    adminId: null,
    players: {},
    answers: {},
  });
  showLetmeinBack();
});

document.getElementById('takeover-host-btn').addEventListener('click', async () => {
  const snap = await getDoc(GAME_DOC);
  if (!snap.exists()) {
    await setDoc(GAME_DOC, {
      phase: 'waiting',
      currentQuestion: 0,
      adminId: null,
      players: {},
      answers: {},
    });
  }
  await updateDoc(GAME_DOC, { adminId: playerId });
  isAdmin = true;
  showLetmeinBack();
  document.getElementById('is-host').checked = true;
});

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL-TIME LISTENER
// ─────────────────────────────────────────────────────────────────────────────
function startListening() {
  onSnapshot(GAME_DOC, snap => {
    if (!snap.exists()) return;
    const state = snap.data();
    // Update isAdmin in case we refreshed
    if (state.adminId === playerId) isAdmin = true;
    render(state);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────────────
function render(state) {
  // Show/hide admin-only elements
  document.querySelectorAll('.admin-only').forEach(el => {
    if (isAdmin) el.classList.remove('hidden');
    else         el.classList.add('hidden');
  });

  switch (state.phase) {
    case 'waiting':  renderWaiting(state);  break;
    case 'answering': renderGame(state);    break;
    case 'results':  renderResults(state);  break;
    case 'done':     showScreen('done');    break;
  }
}

// ── Waiting ─────────────────────────────────────────────────
function renderWaiting(state) {
  showScreen('waiting');

  const list = document.getElementById('player-list');
  list.innerHTML = '';
  Object.entries(state.players || {}).forEach(([id, p]) => {
    const li = document.createElement('li');
    li.textContent = p.name + (id === state.adminId ? ' (host)' : '');
    if (id === playerId) li.classList.add('is-you');
    list.appendChild(li);
  });
}

document.getElementById('start-btn').addEventListener('click', async () => {
  await updateDoc(GAME_DOC, { phase: 'answering', currentQuestion: 0 });
});

// ── Game ─────────────────────────────────────────────────────
function renderGame(state) {
  showScreen('game');

  const q     = QUESTIONS[state.currentQuestion];
  const numEl = document.getElementById('question-number');
  const hintEl = document.getElementById('drag-hint');

  numEl.textContent = `Question ${state.currentQuestion + 1} of ${QUESTIONS.length}`;
  document.getElementById('question-text').textContent = q.text;

  const myAnswer = (state.answers?.[state.currentQuestion] || {})[playerId];

  const zonesEl = document.getElementById('answer-zones');
  zonesEl.innerHTML = '';
  q.answers.forEach(answer => {
    const zone = document.createElement('div');
    zone.className = 'answer-zone' + (myAnswer === answer ? ' chosen' : '');
    zone.dataset.answer = answer;

    const label = document.createElement('div');
    label.className = 'zone-label';
    label.textContent = answer;
    zone.appendChild(label);

    zone.addEventListener('click', () => submitAnswer(answer, state.currentQuestion));

    zonesEl.appendChild(zone);
  });

  hintEl.classList.remove('hidden');

  const answered = Object.keys(state.answers?.[state.currentQuestion] || {}).length;
  const total    = Object.keys(state.players || {}).length;
  document.getElementById('answer-count').textContent = `${answered} of ${total} answered`;
}

async function submitAnswer(answer, questionIndex) {
  await updateDoc(GAME_DOC, {
    [`answers.${questionIndex}.${playerId}`]: answer,
  });
}

document.getElementById('show-results-btn').addEventListener('click', async () => {
  await updateDoc(GAME_DOC, { phase: 'results' });
});

// ── Results ──────────────────────────────────────────────────
function renderResults(state) {
  showScreen('results');

  const q  = QUESTIONS[state.currentQuestion];
  const qi = state.currentQuestion;

  document.getElementById('results-question-text').textContent = q.text;

  const answerData = state.answers?.[qi] || {};
  const counts = {};
  q.answers.forEach(a => { counts[a] = 0; });
  Object.values(answerData).forEach(a => { if (counts[a] !== undefined) counts[a]++; });

  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  const barsEl = document.getElementById('results-bars');
  barsEl.innerHTML = '';

  q.answers.forEach(answer => {
    const count = counts[answer];
    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;

    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `
      <div class="result-label">
        <span>${answer}</span>
        <span>${count} ${count === 1 ? 'player' : 'players'}</span>
      </div>
      <div class="result-bar-bg">
        <div class="result-bar-fill" style="width:${pct}%"></div>
      </div>`;
    barsEl.appendChild(row);
  });

  // Update next button label
  const nextBtn = document.getElementById('next-question-btn');
  const isLast  = state.currentQuestion >= QUESTIONS.length - 1;
  nextBtn.textContent = isLast ? 'Finish' : 'Next Question';
}

document.getElementById('next-question-btn').addEventListener('click', async () => {
  const snap  = await getDoc(GAME_DOC);
  const state = snap.data();
  const next  = state.currentQuestion + 1;

  if (next >= QUESTIONS.length) {
    await updateDoc(GAME_DOC, { phase: 'done' });
  } else {
    await updateDoc(GAME_DOC, { phase: 'answering', currentQuestion: next });
  }
});
