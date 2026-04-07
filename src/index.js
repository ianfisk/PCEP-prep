const HEADER_INTERSECTION_MARGIN_PX = 100;

const ViewMode = {
	single: 'single',
	list: 'list',
}

const state = {
	questions: [],
	answers: {},     // { questionIndex: chosenKey }
	mode: ViewMode.list,
	currentIndex: 0,
	disconnectScrollWatcher: null,
};

async function init() {
	try {
		await fetchQuestions();
		document.getElementById('loadingState').style.display = 'none';

		const startQuestionIndex = parseQuestionIdString(window.location.hash);
		if (startQuestionIndex >= 0 && startQuestionIndex < state.questions.length) {
			state.currentIndex = startQuestionIndex;
		}
		render();

		document.getElementById(createQuestionIdString(state.currentIndex))?.scrollIntoView();

		state.disconnectScrollWatcher = updateHashOnScroll();
		watchForViewModeSwitch();
	} catch (err) {
		const loadingContainer = document.getElementById('loadingState');
		const errorMessage = document.createElement("p");
		errorMessage.style.color = "#B91C1C";
		errorMessage.textContent = `⚠️ Could not load questions: ${err.message}`;
		loadingContainer.replaceChildren(errorMessage);
	}
}

function createQuestionIdString(questionIndex) {
	return `card-${questionIndex + 1}`;
}

// No index bounds checking.
function parseQuestionIdString(hash) {
	const [, questionIndex] = hash.split('-');
	return questionIndex && parseInt(questionIndex) - 1;
}

function watchForViewModeSwitch() {
	const modeButtons = document.querySelectorAll('.mode-btn');
	for (const btn of modeButtons) {
		btn.addEventListener('click', () => {
			if (btn.dataset.mode === state.mode) return;
			state.mode = btn.dataset.mode;

			for (const b of modeButtons) {
				b.classList.toggle('active', b === btn)
			}

			if (state.mode === ViewMode.list) {
				render();
				state.disconnectScrollWatcher = updateHashOnScroll();
				document.getElementById(createQuestionIdString(state.currentIndex))?.scrollIntoView();
			} else {
				state.disconnectScrollWatcher();
				render();
				window.scrollTo({ top: 0, behavior: 'smooth' });
			}

		});
	}
}

async function fetchQuestions() {
	const res = await fetch('questions.json');
	if (!res.ok) throw new Error(`HTTP ${res.status}`);

	const data = await res.json();
	state.questions = data.questions;
}

function updateHashOnScroll() {
	const questionCards = document.querySelectorAll('.question-card');

	const observer = new IntersectionObserver((entries) => {
		entries.forEach((entry) => {
			// Update the hash when the entry's top leaves the viewport (respecting the header).
			if (entry.isIntersecting && entry.boundingClientRect.top < HEADER_INTERSECTION_MARGIN_PX) {
				const newHash = `#${entry.target.id}`;

				if (window.location.hash !== newHash) {
					const questionIdx = parseQuestionIdString(entry.target.id);
					state.currentIndex = questionIdx >= 0 && questionIdx < state.questions.length ? questionIdx : 0;
					history.replaceState(null, null, newHash);
				}
			}
		});
	}, {
		root: null,
		rootMargin: `-${HEADER_INTERSECTION_MARGIN_PX}px`,
		threshold: [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
	});

	for (const card of questionCards) {
		observer.observe(card);
	}

	return () => {
		observer.disconnect();
	};
}

function render() {
	const app = document.getElementById('app');
	if (state.mode === ViewMode.single) {
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
    <div class="question-card ${statusClass}" id="${createQuestionIdString(index)}">
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
	const oldCard = document.getElementById(createQuestionIdString(index));
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

	const newHash = `#${document.querySelector('.question-card').id}`;
	if (window.location.hash !== newHash) {
		history.replaceState(null, null, newHash);
	}
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

function escapeHtml(str) {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

init();
