const state = {
	questions: [],
	answers: {},     // { questionIndex: chosenKey }
	mode: 'single',  // 'single' | 'list'
	currentIndex: 0,
};

async function init() {
	try {
		const res = await fetch('pcep-questions.json');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		state.questions = data.questions;
		document.getElementById('loadingState').style.display = 'none';
		render();
	} catch (err) {
		const loadingContainer = document.getElementById('loadingState');
		const errorMessage = document.createElement("p");
		errorMessage.style.color = "#B91C1C";
		errorMessage.textContent = `⚠️ Could not load questions: ${err.message}`;
		loadingContainer.replaceChildren(errorMessage);
	}
}

function render() {
	const app = document.getElementById('app');
	if (state.mode === 'single') {
		app.innerHTML = buildSingleView();
	} else {
		app.innerHTML = buildListView();
	}
	updateScore();
}

function buildSingleView() {
	const { questions, currentIndex, answers } = state;
	const q = questions[currentIndex];
	const answered = answers[currentIndex];
	const total = questions.length;
	const pct = (currentIndex / (total - 1)) * 100;
	const isFirst = currentIndex === 0;
	const isLast = currentIndex === total - 1;

	return `
    <div class="single-view">
      <div class="progress-track">
        <div class="progress-fill" style="width: ${pct}%"></div>
      </div>

      <div class="q-meta">
        <span class="subsection-tag">${q.subsection}</span>
        <span class="q-counter">${currentIndex + 1} <em>of</em> ${total}</span>
      </div>

      ${buildCard(q, currentIndex, answered)}

      <div class="single-nav">
        <button class="btn-nav btn-prev" onclick="navigate(-1)" ${isFirst ? 'disabled' : ''}>
          ← Previous
        </button>
        <button class="btn-nav btn-next" onclick="navigate(1)" ${isLast ? 'disabled' : ''}>
          Next →
        </button>
      </div>
    </div>
  `;
}

function buildListView() {
	const { questions, answers } = state;

	// Group questions by section, preserving insertion order
	const sections = new Map();
	questions.forEach((q, i) => {
		if (!sections.has(q.section)) sections.set(q.section, []);
		sections.get(q.section).push({ q, i });
	});

	let html = '<div class="list-view">';
	for (const [section, items] of sections) {
		html += `
      <div class="section-group">
        <h2 class="section-heading">${section}</h2>
        <div class="question-grid">
          ${items.map(({ q, i }) => buildCard(q, i, answers[i])).join('')}
        </div>
      </div>`;
	}
	html += '</div>';
	return html;
}

function buildCard(q, index, answered) {
	const statusClass = answered
		? (answered === q.correctAnswer ? 'card-correct' : 'card-wrong')
		: '';

	const choicesHtml = Object.entries(q.choices).map(([key, val]) => {
		let cls = 'choice';
		if (answered) {
			if (key === q.correctAnswer) cls += ' choice-correct';
			else if (key === answered) cls += ' choice-wrong';
			else cls += ' choice-dim';
		}
		return `
      <button class="${cls}" ${answered ? 'disabled' : ''}
        data-index="${index}" data-key="${key}">
        <span class="choice-key">${key}</span>
        <span class="choice-text">${escapeHtml(val)}</span>
      </button>`;
	}).join('');

	let feedbackHtml = '';
	if (answered) {
		const correct = answered === q.correctAnswer;
		feedbackHtml = `
      <div class="answer-feedback ${correct ? 'feedback-correct' : 'feedback-wrong'}">
        ${correct
				? '✓ Correct!'
				: `✗ Correct answer: <strong>${q.correctAnswer} — ${escapeHtml(q.choices[q.correctAnswer])}</strong>`
			}
      </div>`;
	}

	return `
    <div class="question-card ${statusClass}" id="card-${index}">
      <div class="question-text">${escapeHtml(q.query)}</div>
      <div class="choices">${choicesHtml}</div>
      ${feedbackHtml}
    </div>`;
}

// Delegate clicks on .choice buttons
document.addEventListener('click', (e) => {
	const btn = e.target.closest('.choice');
	if (!btn || btn.disabled) return;

	const index = parseInt(btn.dataset.index, 10);
	const key = btn.dataset.key;

	if (state.answers[index] !== undefined) return; // already answered

	state.answers[index] = key;
	const q = state.questions[index];
	const correct = key === q.correctAnswer;

	// Re-render the card in-place (avoids full re-render flicker)
	const oldCard = document.getElementById(`card-${index}`);
	if (!oldCard) return;

	const wrapper = document.createElement('div');
	wrapper.innerHTML = buildCard(q, index, key);
	const newCard = wrapper.firstElementChild;

	oldCard.replaceWith(newCard);

	if (correct) {
		spawnEmojis(newCard);
	} else {
		newCard.classList.add('shake');
		newCard.addEventListener('animationend', () => newCard.classList.remove('shake'), { once: true });
	}

	updateScore();

	// In single mode, auto-advance after correct
	if (correct && state.mode === 'single') {
		setTimeout(() => navigate(1), 1300);
	}
});

function spawnEmojis(card) {
	const pool = ['🎉', '✨', '⭐', '🐍', '💡', '🏆'];
	const count = 6;
	for (let i = 0; i < count; i++) {
		const el = document.createElement('span');
		el.className = 'emoji-burst';
		el.textContent = pool[Math.floor(Math.random() * pool.length)];
		el.style.left = `${15 + Math.random() * 70}%`;
		el.style.animationDelay = `${(i * 0.07).toFixed(2)}s`;
		card.appendChild(el);
		el.addEventListener('animationend', () => el.remove(), { once: true });
	}
}

function navigate(dir) {
	const next = state.currentIndex + dir;
	if (next < 0 || next >= state.questions.length) return;
	state.currentIndex = next;
	render();
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateScore() {
	let correct = 0;
	const answered = Object.entries(state.answers);
	for (const [idx, key] of answered) {
		if (state.questions[idx]?.correctAnswer === key) correct++;
	}
	document.getElementById('scoreCorrect').textContent = correct;
	document.getElementById('scoreAnswered').textContent = answered.length;
}

document.querySelectorAll('.mode-btn').forEach(btn => {
	btn.addEventListener('click', () => {
		if (btn.dataset.mode === state.mode) return;
		state.mode = btn.dataset.mode;
		document.querySelectorAll('.mode-btn').forEach(b =>
			b.classList.toggle('active', b === btn)
		);
		render();
		window.scrollTo({ top: 0, behavior: 'smooth' });
	});
});

function escapeHtml(str) {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

init();
