// ======================
// 🔥 API URL HELPER
// ======================
// Helper function to get the correct API URL for backend calls
// In Capacitor (iOS/Android), we need to use the full backend URL
// In web browser, we can use relative URLs
function getApiUrl(path) {
	// Check if we're in Capacitor (mobile app)
	if (window.Capacitor && window.Capacitor.isNativePlatform()) {
		// For images, use local static files in Capacitor (much faster, no network requests)
		if (path.startsWith('/images/')) {
			return `static${path}`;
		}
		// For API calls, use the backend URL from environment or default to Render URL
		const backendUrl = window.BACKEND_URL || 'https://gymvision-ai.onrender.com';
		return `${backendUrl}${path}`;
	}
	// In web browser, use relative URL
	return path;
}

// ======================
// 🔥 SUPABASE INIT
// ======================
// Supabase config is injected from backend via window.SUPABASE_URL and window.SUPABASE_ANON_KEY
// These are loaded from environment variables on the server side
let supabaseClient = null;

async function initSupabase() {
	if (!supabaseClient) {
		if (typeof window.createClient === 'undefined') {
			// Wait for Supabase library to load
			await new Promise(resolve => setTimeout(resolve, 100));
			if (typeof window.createClient === 'undefined') {
				console.error('Supabase createClient not loaded');
				return null;
			}
		}
		
		// Get config from window (injected by backend from environment variables)
		const SUPABASE_URL = window.SUPABASE_URL;
		const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
		
		if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
			console.error('Supabase configuration not found. Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set in environment variables.');
			return null;
		}
		
		supabaseClient = window.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
			auth: {
				persistSession: true,
				autoRefreshToken: true,
			}
		});
	}
	return supabaseClient;
}

// ========== STATE MANAGEMENT ==========
// Default to workouts as the "home" screen
let currentTab = 'workouts';
let currentExercise = null;
let allExercises = [];
let currentWorkout = null;
let editingWorkoutId = null;
let workoutTimer = null;
let workoutStartTime = null;
const WORKOUT_DRAFT_KEY = 'currentWorkoutDraft';
const DEFAULT_SET_COUNT = 3;

function createDefaultSets(count = DEFAULT_SET_COUNT) {
	return Array.from({ length: count }, () => ({ weight: '', reps: '' }));
}

function getLastExerciseData(exerciseKey) {
	// Find the most recent workout that contains this exercise
	const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
	
	// Sort workouts by date (newest first)
	const sortedWorkouts = [...workouts].sort((a, b) => {
		const dateA = new Date(a.date || 0);
		const dateB = new Date(b.date || 0);
		return dateB - dateA;
	});
	
	// Find the first workout that has this exercise
	for (const workout of sortedWorkouts) {
		if (!workout.exercises || !Array.isArray(workout.exercises)) continue;
		
		const exercise = workout.exercises.find(ex => {
			const exKey = (ex.key || '').toLowerCase();
			const exDisplay = (ex.display || '').toLowerCase();
			const searchKey = (exerciseKey || '').toLowerCase();
			return exKey === searchKey || exDisplay === searchKey;
		});
		
		if (exercise && exercise.sets && Array.isArray(exercise.sets) && exercise.sets.length > 0) {
			// Return the sets from the last workout
			return exercise.sets.map(set => ({
				weight: set.weight || '',
				reps: set.reps || ''
			}));
		}
	}
	
	return null;
}

function isBodyweightExercise(exercise) {
	const key = (exercise.key || '').toLowerCase();
	const display = (exercise.display || '').toLowerCase();
	const bodyweightKeys = [
		'push_up', 'pull_up', 'chin_up', 'dips', 'diamond_push_up',
		'crunch', 'decline_sit_up', 'hanging_leg_raise', 'knee_raise'
	];
	return bodyweightKeys.includes(key) || 
	       display.includes('push-up') || display.includes('pull-up') || 
	       display.includes('chin-up') || display.includes('dip') && !display.includes('machine') ||
	       (display.includes('crunch') && !display.includes('cable')) || display.includes('sit-up') || 
	       display.includes('leg raise') || display.includes('knee raise');
}

// Helper function to fetch user from backend with Authorization header
async function fetchUser() {
	if (!supabaseClient) {
		await initSupabase();
	}
	if (!supabaseClient) return null;
	
	const { data: { session } } = await supabaseClient.auth.getSession();
	if (!session?.access_token) return null;
	
	try {
		const response = await fetch('/user', {
			headers: {
				'Authorization': `Bearer ${session.access_token}`
			}
		});
		
		if (response.ok) {
			const userData = await response.json();
			return userData;
		}
		return null;
	} catch (e) {
		console.error('Fetch user failed:', e);
		return null;
	}
}

// ======================
// 🧠 MAIN APP ENTRY
// ======================
document.addEventListener('DOMContentLoaded', async () => {
	await initSupabase();
	
	// PUBLIC PAGES MUST NOT REQUIRE AUTH
	if (isPublicPage()) {
		initLoginForm();
		initRegisterForm();
		
		// Check if already logged in on public pages - redirect to home
		// Wait a bit for session to be restored
		await new Promise(resolve => setTimeout(resolve, 100));
		if (supabaseClient) {
			const { data: { session } } = await supabaseClient.auth.getSession();
			if (session) {
				// Already logged in, redirect to home
				window.location.href = '/';
				return;
			}
		}
		return;
	}
	
	// PRIVATE PAGES - Wait for auth check to complete
	const ok = await requireLogin();
	if (!ok) return;
	
	// Init app features (SAFE now - user is authenticated)
	initLogout(); // Initialize logout button
	initNavigation();
	initTabs();
	initFileUpload();
	initManualInput();
	initExerciseSelector();
	initWorkoutBuilder();
	initProgress();
	initSettings();
	initVision();
		initExerciseVideoModal();
	initExerciseCard();
	loadStreak();
	loadRecentScans();
	loadExercises();
	loadWorkouts();
	updateWorkoutStartButton();
});

// ======================
// 🔑 LOGIN LOGIC
// ======================
function initLoginForm() {
	const form = document.getElementById('login-form');
	if (!form) return;
	
	const errorEl = document.getElementById('error-message');
	const submitBtn = document.getElementById('submit-btn');
	
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		
		if (submitBtn) {
			submitBtn.disabled = true;
			submitBtn.textContent = 'Signing in...';
		}
		if (errorEl) errorEl.classList.remove('show');
		
		const email = document.getElementById('email')?.value;
		const password = document.getElementById('password')?.value;
		
		if (!email || !password) {
			if (errorEl) {
				errorEl.textContent = 'Please fill in all fields';
				errorEl.classList.add('show');
			} else {
				alert('Please fill in all fields');
			}
			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.textContent = 'Sign In';
			}
			return;
		}
		
		if (!supabaseClient) {
			await initSupabase();
		}
		if (!supabaseClient) {
			if (errorEl) {
				errorEl.textContent = 'Supabase not initialized. Please refresh the page.';
				errorEl.classList.add('show');
			} else {
				alert('Supabase not initialized. Please refresh the page.');
			}
			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.textContent = 'Sign In';
			}
			return;
		}
		
		const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
		
		if (error) {
			let errorMessage = error.message;
			if (error.message.includes('Invalid login credentials')) {
				errorMessage = 'Invalid email or password';
			}
			
			if (errorEl) {
				errorEl.textContent = errorMessage;
				errorEl.classList.add('show');
			} else {
				alert(errorMessage);
			}
			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.textContent = 'Sign In';
			}
			return;
		}
		
		// Login successful - wait a moment for session to be set
		await new Promise(resolve => setTimeout(resolve, 300));
		
		// Reset auth state
		authLoading = false;
		authCheckComplete = true;
		
		// Verify session exists
		const { data: { session } } = await supabaseClient.auth.getSession();
		if (session) {
			// Redirect to next parameter if exists, otherwise go to home
			const nextPage = new URLSearchParams(window.location.search).get('next');
			const redirectTo = nextPage ? decodeURIComponent(nextPage) : '/';
			window.location.href = redirectTo;
		} else {
			// Session not ready yet, but redirect anyway
			const nextPage = new URLSearchParams(window.location.search).get('next');
			const redirectTo = nextPage ? decodeURIComponent(nextPage) : '/';
			window.location.href = redirectTo;
		}
	});
}

// ======================
// 🆕 REGISTER LOGIC
// ======================
function initRegisterForm() {
	const form = document.getElementById('register-form');
	if (!form) return;
	
	const errorEl = document.getElementById('error-message');
	const submitBtn = document.getElementById('submit-btn');
	
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		
		if (submitBtn) {
			submitBtn.disabled = true;
			submitBtn.textContent = 'Creating account...';
		}
		if (errorEl) errorEl.classList.remove('show');
		
		const email = document.getElementById('email')?.value;
		const password = document.getElementById('password')?.value;
		const username = document.getElementById('username')?.value; // Optional
		
		if (!email || !password) {
			if (errorEl) {
				errorEl.textContent = 'Please fill in all required fields';
				errorEl.classList.add('show');
			} else {
				alert('Please fill in all required fields');
			}
			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.textContent = 'Sign Up';
			}
			return;
		}
		
		if (!supabaseClient) {
			await initSupabase();
		}
		if (!supabaseClient) {
			if (errorEl) {
				errorEl.textContent = 'Supabase not initialized. Please refresh the page.';
				errorEl.classList.add('show');
			} else {
				alert('Supabase not initialized. Please refresh the page.');
			}
			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.textContent = 'Sign Up';
			}
			return;
		}
		
		const { error } = await supabaseClient.auth.signUp({
			email,
			password,
			options: {
				data: {
					username: username || email.split('@')[0]
				}
			}
		});
		
		if (error) {
			let errorMessage = error.message;
			if (error.message.includes('already registered') || error.message.includes('already exists')) {
				errorMessage = 'This email is already registered. Please sign in instead.';
			} else if (error.message.includes('Password')) {
				errorMessage = 'Password must be at least 6 characters';
			}
			
			if (errorEl) {
				errorEl.textContent = errorMessage;
				errorEl.classList.add('show');
			} else {
				alert(errorMessage);
			}
			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.textContent = 'Sign Up';
			}
			return;
		}
		
		// Registration successful
		alert('Account created! Please log in.');
		window.location.href = '/login';
	});
}

// ======================
// 🔒 PUBLIC ROUTES
// ======================
function isPublicPage() {
	const path = window.location.pathname;
	return path.includes('login') || path.includes('register') || path.includes('verify');
}

// ======================
// ✔️ SESSION CHECK
// ======================
let authLoading = false;
let authCheckComplete = false;

async function getSession() {
	if (!supabaseClient) {
		await initSupabase();
	}
	if (!supabaseClient) return null;
	
	try {
		const { data: { session }, error } = await supabaseClient.auth.getSession();
		if (error) {
			console.error('Get session error:', error);
			return null;
		}
		return session || null;
	} catch (e) {
		console.error('Get session failed:', e);
		return null;
	}
}

async function requireLogin() {
	// Prevent multiple simultaneous checks
	if (authLoading) {
		// Wait for existing check to complete
		while (authLoading) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		return authCheckComplete;
	}
	
	authLoading = true;
	
	try {
		if (!supabaseClient) {
			await initSupabase();
		}
		if (!supabaseClient) {
			authCheckComplete = false;
			window.location.href = '/login';
			return false;
		}
		
		const { data: { session }, error } = await supabaseClient.auth.getSession();
		
		if (error) {
			console.error('Session check error:', error);
			authCheckComplete = false;
			window.location.href = '/login';
			return false;
		}
		
		if (!session) {
			// Not logged in, redirect to login with next parameter
			const currentPath = window.location.pathname;
			authCheckComplete = false;
			window.location.href = `/login?next=${encodeURIComponent(currentPath)}`;
			return false;
		}
		
		authCheckComplete = true;
		return true;
	} finally {
		authLoading = false;
	}
}

// Helper: Get current user (for backwards compatibility)
async function getUser() {
	const session = await getSession();
	return session?.user || null;
}

// Helper: Logout function
async function logout() {
	if (!supabaseClient) {
		await initSupabase();
	}
	if (!supabaseClient) return;
	
	try {
		await supabaseClient.auth.signOut();
		localStorage.removeItem('workouts'); // Optional: clear workouts on logout
		window.location.href = '/login';
	} catch (e) {
		console.error('Logout failed:', e);
		window.location.href = '/login';
	}
}

// ========== NAVIGATION ==========
function initNavigation() {
	const navButtons = document.querySelectorAll('.nav-btn');
	navButtons.forEach(btn => {
		btn.addEventListener('click', () => {
			const tab = btn.dataset.tab;
				switchTab(tab);
		});
	});
}

function switchTab(tab) {
	// Update nav buttons
	document.querySelectorAll('.nav-btn').forEach(btn => {
		btn.classList.toggle('active', btn.dataset.tab === tab);
	});
	
	// Hide all content
	document.querySelectorAll('.content').forEach(content => {
		content.classList.add('hidden');
	});
	
	// Show selected content
	const contentId = `${tab}-content`;
	const content = document.getElementById(contentId);
	if (content) {
		content.classList.remove('hidden');
		currentTab = tab;
		
		// Load tab-specific data
		if (tab === 'workouts') {
			loadWorkouts();
			updateWorkoutStartButton();
		} else if (tab === 'progress') {
			loadProgress();
		} else if (tab === 'settings') {
			loadSettings();
		}
	}
}

// ========== TABS (Today/Workouts) ==========
function initTabs() {
	const tabs = document.querySelectorAll('.tab');
	tabs.forEach(tab => {
		tab.addEventListener('click', () => {
			const tabName = tab.dataset.tab;
			document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
			tab.classList.add('active');
			
			if (tabName === 'workouts') {
				switchTab('workouts');
			} else {
				switchTab('home');
			}
		});
	});
}

// ========== FILE UPLOAD & CLASSIFICATION ==========
function initFileUpload() {
	const fileInput = document.getElementById('fileInput');
	// AI Detect button removed from home page - now only in exercise selector
	const classifyBtn = null; // document.getElementById('classify');
	const camera = document.getElementById('camera');
	const snapshot = document.getElementById('snapshot');
	const manualPreview = document.getElementById('manual-preview');
	
	if (fileInput) {
		fileInput.addEventListener('change', (e) => {
			const file = e.target.files[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = (event) => {
					const img = new Image();
					img.onload = () => {
						snapshot.width = img.width;
						snapshot.height = img.height;
						const ctx = snapshot.getContext('2d');
						ctx.drawImage(img, 0, 0);
						// Store preview data URL so we can show it in the dotted box
						window.lastUploadPreview = img.src;
						// Show the preview image in the dotted square
						if (manualPreview) {
							manualPreview.src = img.src;
							manualPreview.classList.remove('hidden');
						}
						if (camera) camera.classList.add('hidden');
						if (snapshot) snapshot.classList.add('hidden');
						if (classifyBtn) classifyBtn.disabled = false;
					};
					img.src = event.target.result;
				};
				reader.readAsDataURL(file);
			}
		});
	}
	
	if (classifyBtn) {
		classifyBtn.addEventListener('click', async () => {
			const file = fileInput?.files[0];
			if (!file) return;
			
			classifyBtn.disabled = true;
			classifyBtn.textContent = 'Detecting...';
			
			try {
				const formData = new FormData();
				formData.append('image', file);
				
				const apiUrl = getApiUrl('/api/vision-detect');
				const res = await fetch(apiUrl, {
					method: 'POST',
					body: formData
				});
				
				const data = await res.json();
				
				// Check for NO_PREDICTION error
				if (data.success === false && data.error === "NO_PREDICTION") {
					showAIDetectErrorModal();
				} else if (data.error) {
					showAIDetectErrorModal();
				} else {
					// Attach preview image of the uploaded photo for the dotted box
					if (window.lastUploadPreview) {
						data._previewImage = window.lastUploadPreview;
					}
					displayPrediction(data);
					saveRecentScan(data);
				}
			} catch (e) {
				console.error('Classification failed:', e);
				showAIDetectErrorModal();
			} finally {
				classifyBtn.disabled = false;
				classifyBtn.textContent = 'AI Detect';
			}
		});
	}
}

function displayPrediction(data) {
	const resultTitle = document.getElementById('result-title');
	const confidenceRing = document.getElementById('confidence-ring');
	const ringConfidence = document.getElementById('ring-confidence');
	const qsMuscle1 = document.getElementById('qs-muscle-1');
	const qsMuscle2 = document.getElementById('qs-muscle-2');
	const qsMuscle3 = document.getElementById('qs-muscle-3');
	const machineName = document.getElementById('machine-name');
	const video = document.getElementById('video');
	const predictionToggle = document.getElementById('prediction-toggle');
	const predictionOptions = document.getElementById('prediction-options');
	const cameraEl = document.getElementById('camera');
	const snapshotEl = document.getElementById('snapshot');
	const manualPreview = document.getElementById('manual-preview');
	const refineSection = document.getElementById('prediction-refine');
	
	if (resultTitle) resultTitle.textContent = data.display || 'Unknown';

	// Default confidence to 100% when it's missing or invalid (e.g. manual selection)
	const confidence = Number.isFinite(data.confidence) ? data.confidence : 1;
	if (ringConfidence) ringConfidence.textContent = `${Math.round(confidence * 100)}%`;
	if (confidenceRing) {
		const degrees = confidence * 360;
		confidenceRing.style.background = `conic-gradient(var(--accent) ${degrees}deg, #303039 0)`;
	}
	
	const muscles = data.muscles || [];
	if (qsMuscle1) qsMuscle1.textContent = muscles[0] || '—';
	if (qsMuscle2) qsMuscle2.textContent = muscles[1] || '—';
	if (qsMuscle3) qsMuscle3.textContent = muscles[2] || '—';
	
	if (machineName) machineName.textContent = data.display || 'No machine detected';
	if (video && data.video) {
		video.src = data.video;
	}
	
	// Show image in the square preview area:
	// - for AI detect: always keep the last uploaded photo (window.lastUploadPreview),
	//   even when switching predictions via "Wrong exercise?"
	// - for manual selection: fall back to the exercise image
	const previewImageSrc =
		window.lastUploadPreview ||
		data._previewImage ||
		data.image ||
		getExerciseImageSource(data);
	if (manualPreview && previewImageSrc) {
		manualPreview.src = previewImageSrc;
			manualPreview.classList.remove('hidden');
		}
	// Hide camera/snapshot when showing a static preview
	if (previewImageSrc) {
		if (cameraEl) cameraEl.classList.add('hidden');
		if (snapshotEl) snapshotEl.classList.add('hidden');
	}
	
	// Show prediction options if multiple predictions
	if (data.top_predictions && data.top_predictions.length > 1) {
		if (predictionToggle) {
			predictionToggle.classList.remove('hidden');
			predictionToggle.onclick = () => {
				// When user goes into "Wrong exercise?" flow, hide refinement options
				const refineSectionEl = document.getElementById('prediction-refine');
				if (refineSectionEl) refineSectionEl.classList.add('hidden');
				showPredictionOptions(data.top_predictions);
			};
		}
	}
	
	currentExercise = data;
	// Track which prediction/exercise is currently active for the "Wrong exercise?" list
	window.currentPredictionKey = data.key || data.display || null;

	// Show refinement options for generic detections (e.g. smith machine)
	if (refineSection) {
		maybeShowRefinements(data);
	}
}

// Additional refinement for generic AI detections (smith machine, towers, etc.)
function maybeShowRefinements(data) {
	const refineSection = document.getElementById('prediction-refine');
	const refineList = document.getElementById('prediction-refine-list');
	if (!refineSection || !refineList) return;

	// Use refinements from API response if available, otherwise fall back to hardcoded list
	let options = null;
	if (data.refinements && Array.isArray(data.refinements) && data.refinements.length > 0) {
		// Use refinements from backend API
		options = data.refinements.map(ref => ref.display || ref.label || ref.key);
	} else {
		// Fallback to hardcoded mapping
	const refinements = {
		'smith machine': [
			'Smith Machine Bench Press',
			'Smith Machine Incline Bench Press',
			'Smith Machine Decline Bench Press',
			'Smith Machine Squat',
			'Smith Machine Shoulder Press'
		],
		'leg raise tower': [
			'Hanging Leg Raise',
			'Knee Raise',
			'Dip',
			'Pull-Up',
			'Chin-Up'
		],
		'chinning dipping': [
			'Pull-Up',
			'Chin-Up',
			'Dip',
			'Hanging Leg Raise',
			'Knee Raise'
		],
		'dumbbell': [
			'Dumbbell Bench Press',
			'Incline Dumbbell Press',
			'Decline Dumbbell Press',
			'Dumbbell Fly',
			'Arnold Press',
			'Lateral Raise',
			'Front Raise',
			'One Arm Dumbbell Row',
			'Chest Supported Row',
			'Bulgarian Split Squat',
			'Alternating Dumbbell Curl',
			'Incline Dumbbell Curl',
			'Reverse Curl',
			'Spider Curl',
			'Overhead Tricep Extension',
			'Rear Delt Fly'
		]
	};

	// Only show refinements for *generic* detections, not for the specific
	// variants we select afterwards. So we match on exact label, not "includes".
	const label = (data.display || data.key || '').toString().toLowerCase().trim();
	for (const key in refinements) {
		if (label === key) {
			options = refinements[key];
			break;
			}
		}
	}

	if (!options) {
		// Nothing to refine for this detection
		refineSection.classList.add('hidden');
		refineList.innerHTML = '';
		return;
	}

	// Build refinement buttons
	refineList.innerHTML = '';
	options.forEach(name => {
		const btn = document.createElement('button');
		btn.className = 'prediction-chip';
		btn.textContent = name;
		btn.onclick = () => {
			// Use text-based lookup so we don't depend on exact keys
			selectExerciseByName(name);
			refineSection.classList.add('hidden');
		};
		refineList.appendChild(btn);
	});

	refineSection.classList.remove('hidden');
}

function showPredictionOptions(predictions) {
	const optionsList = document.getElementById('prediction-options-list');
	const optionsSection = document.getElementById('prediction-options');
	const refineSection = document.getElementById('prediction-refine');
	const refineList = document.getElementById('prediction-refine-list');
	
	if (!optionsList || !optionsSection) return;

	// Ensure refinement UI is hidden while choosing a different exercise
	if (refineSection) refineSection.classList.add('hidden');
	if (refineList) refineList.innerHTML = '';
	
	optionsList.innerHTML = '';
	// Determine which prediction matches the currently selected exercise
	let activeIndex = 0;
	if (window.currentPredictionKey) {
		const target = window.currentPredictionKey.toString().toLowerCase();
		const foundIdx = predictions.findIndex(p => {
			const k = (p.key || p.display || '').toString().toLowerCase();
			return k === target;
		});
		if (foundIdx >= 0) activeIndex = foundIdx;
	}
	
	predictions.forEach((pred, idx) => {
		const chip = document.createElement('button');
		chip.className = `prediction-chip ${idx === activeIndex ? 'active' : ''}`;
		chip.textContent = `${pred.display} (${Math.round(pred.confidence * 100)}%)`;
		chip.onclick = () => {
			displayPrediction(pred);
			optionsSection.classList.add('hidden');
		};
		optionsList.appendChild(chip);
	});
	
	optionsSection.classList.remove('hidden');
}

// ========== MANUAL INPUT ==========
function initManualInput() {
	// Home now uses the shared exercise selector instead of its own text box.
	const openBtn = document.getElementById('home-open-exercise-selector');
	if (openBtn) {
		openBtn.addEventListener('click', () => {
			openExerciseSelector();
		});
	}
}

async function selectExerciseByName(name) {
	try {
		const res = await fetch('/exercise-info', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ exercise: name })
		});
		const data = await res.json();
		displayPrediction(data);
	} catch (e) {
		console.error('Failed to get exercise info:', e);
	}
}

async function selectExercise(key) {
	try {
		const res = await fetch('/exercise-info', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ exercise: key })
		});
		const data = await res.json();
		displayPrediction(data);
	} catch (e) {
		console.error('Failed to get exercise info:', e);
	}
}

// ========== EXERCISE SELECTOR ==========
function initExerciseSelector() {
	const selector = document.getElementById('exercise-selector');
	const closeBtn = document.getElementById('exercise-selector-close');
	const searchInput = document.getElementById('exercise-selector-search');
	const musclesContainer = document.getElementById('exercise-selector-muscles');
	const resultsContainer = document.getElementById('exercise-selector-results');
	const aiDetectBtn = document.getElementById('exercise-selector-ai-detect');
	const fileInput = document.getElementById('exercise-selector-file');
	const predictionsContainer = document.getElementById('exercise-selector-predictions');
	
	let selectedMuscle = null;
	
	if (closeBtn) {
		closeBtn.addEventListener('click', () => {
			if (selector) selector.classList.add('hidden');
			document.body.classList.remove('selector-open');
		});
	}
	
	if (selector) {
		selector.addEventListener('click', (e) => {
			if (e.target === selector) {
				selector.classList.add('hidden');
				document.body.classList.remove('selector-open');
			}
		});
	}

	// AI detect inside selector - open chat modal
	if (aiDetectBtn) {
		aiDetectBtn.addEventListener('click', () => {
			openAIDetectChat();
		});
	}
	
	// Muscle filters
	const muscles = ['All', 'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'];
	if (musclesContainer) {
		muscles.forEach(muscle => {
			const btn = document.createElement('button');
			btn.textContent = muscle;
			btn.className = muscle === 'All' ? 'active' : '';
			btn.onclick = () => {
				selectedMuscle = muscle === 'All' ? null : muscle;
				document.querySelectorAll('#exercise-selector-muscles button').forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				filterExercises(searchInput?.value || '', selectedMuscle);
			};
			musclesContainer.appendChild(btn);
		});
	}
	
	if (searchInput) {
		searchInput.addEventListener('input', (e) => {
			filterExercises(e.target.value, selectedMuscle);
		});
	}
	
	function filterExercises(query, muscle) {
		if (!resultsContainer) return;
		
		// Show results container and hide predictions when filtering
		resultsContainer.style.display = '';
		const predictionsContainer = document.getElementById('exercise-selector-predictions');
		if (predictionsContainer) {
			predictionsContainer.style.display = 'none';
		}
		
		let filtered = allExercises;
		
		if (query) {
			const q = query.toLowerCase();
			filtered = filtered.filter(ex => 
				ex.display.toLowerCase().includes(q) || 
				ex.key.toLowerCase().includes(q)
			);
		}
		
		if (muscle) {
			const muscleLower = muscle.toLowerCase();
			filtered = filtered.filter(ex => 
				ex.muscles && ex.muscles.some(m => m.toLowerCase() === muscleLower)
			);
			
			// Sort by muscle position: primary (0), secondary (1), support (2)
			filtered.sort((a, b) => {
				const aIndex = a.muscles ? a.muscles.findIndex(m => m.toLowerCase() === muscleLower) : 999;
				const bIndex = b.muscles ? b.muscles.findIndex(m => m.toLowerCase() === muscleLower) : 999;
				// If not found, put at end (999)
				const aPos = aIndex >= 0 ? aIndex : 999;
				const bPos = bIndex >= 0 ? bIndex : 999;
				return aPos - bPos;
			});
		}
		
		resultsContainer.innerHTML = '';
		if (filtered.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'exercise-selector-empty';
			empty.textContent = 'No exercises found';
			resultsContainer.appendChild(empty);
			return;
		}
		
		filtered.forEach(ex => {
			const item = document.createElement('button');
			item.className = 'exercise-selector-item';
			const imageSrc = getExerciseImageSource(ex);
			const initial = (ex.display || ex.key || '?').charAt(0).toUpperCase();
			item.innerHTML = `
				<div class="exercise-selector-item-main">
					${imageSrc
						? `<img class="exercise-selector-item-image" src="${imageSrc}" alt="${ex.display || ex.key || 'Exercise'}" />`
						: `<div class="exercise-selector-item-image" style="background:rgba(124,92,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;">${initial}</div>`}
				<div class="exercise-selector-item-content">
					<div style="font-weight: 600;">${ex.display}</div>
					${ex.muscles && ex.muscles.length > 0 ? `<span>${ex.muscles.join(', ')}</span>` : ''}
					</div>
				</div>
			`;
			item.onclick = () => {
				const ctx = window.exerciseSelectorContext || null;
				const labelLower = (ex.display || ex.key || '').toLowerCase().trim();
				
				// Check if this is a generic detection that needs refinement
				const refinements = {
					'smith machine': [
						'Smith Machine Bench Press',
						'Smith Machine Incline Bench Press',
						'Smith Machine Decline Bench Press',
						'Smith Machine Squat',
						'Smith Machine Shoulder Press'
					],
					'leg raise tower': [
						'Hanging Leg Raise',
						'Knee Raise',
						'Dips',
						'Pull-Up',
						'Chin-Up'
					],
					'chinning dipping': [
						'Pull-Up',
						'Chin-Up',
						'Dips',
						'Hanging Leg Raise',
						'Knee Raise'
					],
					'dumbbell': [
						'Dumbbell Bench Press',
						'Incline Dumbbell Press',
						'Decline Dumbbell Press',
						'Dumbbell Fly',
						'Arnold Press',
						'Lateral Raise',
						'Front Raise',
						'One Arm Dumbbell Row',
						'Chest Supported Row',
						'Bulgarian Split Squat',
						'Alternating Dumbbell Curl',
						'Incline Dumbbell Curl',
						'Reverse Curl',
						'Spider Curl',
						'Overhead Tricep Extension',
						'Rear Delt Fly'
					]
				};
				
				const refinementOptions = refinements[labelLower];
				
				// If it's a generic detection, show refinements (for both workout builder and insights)
				if (refinementOptions && (currentTab === 'workout-builder' || ctx === 'insights')) {
					showExerciseRefinementsInSelector(refinementOptions, selector);
					return;
				}
				
				// Otherwise, proceed with normal selection
				if (ctx === 'insights') {
					// Use insights view for history
					handleExerciseInsightsForName(ex.display || ex.key);
				} else if (currentTab === 'workout-builder') {
					// Add to workout
					addExerciseToWorkout(ex);
				} else {
					// Display exercise info on home
					selectExercise(ex.key);
				}
				window.exerciseSelectorContext = null;
				selector.classList.add('hidden');
				document.body.classList.remove('selector-open');
			};
			resultsContainer.appendChild(item);
		});
	}

	// Expose filter for external callers (e.g. when opening selector)
	window.filterExercisesForSelector = (query, muscle) => {
		filterExercises(query, muscle);
	};
}

function showExerciseRefinementsInSelector(refinementOptions, selectorEl) {
	const predictionsContainer = document.getElementById('exercise-selector-predictions');
	const resultsContainer = document.getElementById('exercise-selector-results');
	if (!predictionsContainer) return;
	
	// Hide the regular results
	if (resultsContainer) resultsContainer.style.display = 'none';
	
	// Clear and show refinement options in predictions container
	predictionsContainer.innerHTML = '';
	predictionsContainer.style.display = 'flex';
	predictionsContainer.style.flexDirection = 'column';
	predictionsContainer.classList.add('refinements');
	
	// Add a title
	const title = document.createElement('div');
	title.style.cssText = 'padding: 12px 16px 8px; font-size: 13px; font-weight: 700; color: #9a9ab0;';
	title.textContent = 'Select specific exercise:';
	predictionsContainer.appendChild(title);
	
	refinementOptions.forEach(exerciseName => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'exercise-selector-item';
		
		// Find exercise data
		const exercise = allExercises.find(ex => 
			(ex.display || '').toLowerCase() === exerciseName.toLowerCase() ||
			(ex.key || '').toLowerCase() === exerciseName.toLowerCase().replace(/\s+/g, '_')
		);
		
		const muscles = exercise?.muscles || [];
		const imageSrc = exercise ? getExerciseImageSource(exercise) : null;
		const initial = (exerciseName || '?').charAt(0).toUpperCase();
		
		btn.innerHTML = `
			<div class="exercise-selector-item-main">
				${imageSrc
					? `<img class="exercise-selector-item-image" src="${imageSrc}" alt="${exerciseName}" />`
					: `<div class="exercise-selector-item-image" style="background:rgba(124,92,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;">${initial}</div>`}
				<div class="exercise-selector-item-content">
					<div style="font-weight: 600;">${exerciseName}</div>
					${muscles && muscles.length ? `<span>${muscles.join(', ')}</span>` : ''}
				</div>
			</div>
		`;
		
		btn.onclick = async () => {
			const ctx = window.exerciseSelectorContext;
			
			if (ctx === 'insights') {
				// Use insights view for history
				handleExerciseInsightsForName(exerciseName);
			} else if (currentTab === 'workout-builder') {
				// Get full exercise info
				let exerciseData = exercise;
				if (!exerciseData) {
					try {
						const res = await fetch('/exercise-info', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ exercise: exerciseName })
						});
						exerciseData = await res.json();
					} catch (e) {
						console.error('Failed to get exercise info:', e);
						return;
					}
				}
				
				const exerciseToAdd = {
					key: exerciseData.key || exerciseName.toLowerCase().replace(/\s+/g, '_'),
					display: exerciseData.display || exerciseName,
					muscles: exerciseData.muscles || muscles,
					sets: createDefaultSets(3)
				};
				addExerciseToWorkout(exerciseToAdd);
			} else {
				selectExerciseByName(exerciseName);
			}
			
			window.exerciseSelectorContext = null;
			if (selectorEl) selectorEl.classList.add('hidden');
			document.body.classList.remove('selector-open');
		};
		
		predictionsContainer.appendChild(btn);
	});
}

async function classifyForExerciseSelector(file, predictionsContainer, selectorEl) {
	if (!predictionsContainer) return;
	try {
		const formData = new FormData();
		formData.append('image', file);
		const apiUrl = getApiUrl('/api/vision-detect');
		const res = await fetch(apiUrl, {
			method: 'POST',
			body: formData
		});
		const data = await res.json();
		// Check for NO_PREDICTION error
		if (data.success === false && data.error === "NO_PREDICTION") {
			showAIDetectErrorModal();
			return;
		} else if (data.error) {
			showAIDetectErrorModal();
			return;
		}
		const top = (data.top_predictions && data.top_predictions.length)
			? data.top_predictions.slice(0, 3)
			: [data];
		predictionsContainer.innerHTML = '';
		predictionsContainer.classList.remove('refinements');
		
		// Hide results container when showing predictions
		const resultsContainer = document.getElementById('exercise-selector-results');
		if (resultsContainer) {
			resultsContainer.style.display = 'none';
		}
		top.forEach(pred => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'exercise-selector-item';
			const label = pred.display || pred.key || 'Exercise';
			const conf = Math.round((pred.confidence || 0) * 100);
			const muscles = pred.muscles || data.muscles || [];
			const imageSrc = getExerciseImageSource(pred);
			const initial = (label || '?').charAt(0).toUpperCase();
			
			// Check if this is a generic detection that shows refinement options
			const labelLower = label.toLowerCase().trim();
			const isGeneric = labelLower === 'smith machine' || labelLower === 'chinning dipping' || 
			                  labelLower === 'leg raise tower' || labelLower === 'dumbbell';
			const subtitleText = isGeneric ? 'Click to see exercises' : (muscles && muscles.length ? muscles.join(', ') : '');
			
			btn.innerHTML = `
				<div class="exercise-selector-item-main">
					${imageSrc
						? `<img class="exercise-selector-item-image" src="${imageSrc}" alt="${label}" />`
						: `<div class="exercise-selector-item-image" style="background:rgba(124,92,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;">${initial}</div>`}
					<div class="exercise-selector-item-content">
						<div style="font-weight: 600;">${label}</div>
						${subtitleText ? `<span>${subtitleText}</span>` : ''}
					</div>
				</div>
				<div class="exercise-selector-conf">${conf}%</div>
			`;
			btn.onclick = () => {
				const ctx = window.exerciseSelectorContext || null;
				const labelLower = label.toLowerCase().trim();
				
				// Check if this is a generic detection that needs refinement
				const refinements = {
					'smith machine': [
						'Smith Machine Bench Press',
						'Smith Machine Incline Bench Press',
						'Smith Machine Decline Bench Press',
						'Smith Machine Squat',
						'Smith Machine Shoulder Press'
					],
					'leg raise tower': [
						'Hanging Leg Raise',
						'Knee Raise',
						'Dips',
						'Pull-Up',
						'Chin-Up'
					],
					'chinning dipping': [
						'Pull-Up',
						'Chin-Up',
						'Dips',
						'Hanging Leg Raise',
						'Knee Raise'
					],
					'dumbbell': [
						'Dumbbell Bench Press',
						'Incline Dumbbell Press',
						'Decline Dumbbell Press',
						'Dumbbell Fly',
						'Arnold Press',
						'Lateral Raise',
						'Front Raise',
						'One Arm Dumbbell Row',
						'Chest Supported Row',
						'Bulgarian Split Squat',
						'Alternating Dumbbell Curl',
						'Incline Dumbbell Curl',
						'Reverse Curl',
						'Spider Curl',
						'Overhead Tricep Extension',
						'Rear Delt Fly'
					]
				};
				
				const refinementOptions = refinements[labelLower];
				
				// If it's a generic detection, show refinements (for both workout builder and insights)
				if (refinementOptions && (currentTab === 'workout-builder' || ctx === 'insights')) {
					showExerciseRefinementsInSelector(refinementOptions, selectorEl);
					return;
				}
				
				// Otherwise, proceed with normal selection
				if (ctx === 'insights') {
					handleExerciseInsightsForName(label);
				} else if (currentTab === 'workout-builder') {
					const exercise = {
						key: pred.key || label.toLowerCase(),
						display: label,
						muscles: muscles,
						sets: createDefaultSets(3)
					};
					addExerciseToWorkout(exercise);
				} else {
					selectExercise(pred.key || label);
				}
				window.exerciseSelectorContext = null;
				if (selectorEl) selectorEl.classList.add('hidden');
				document.body.classList.remove('selector-open');
			};
			predictionsContainer.appendChild(btn);
		});
		// show container only when we actually have predictions
		predictionsContainer.style.display = top.length ? 'flex' : 'none';
	} catch (e) {
		console.error('Failed to classify image in selector:', e);
		showAIDetectErrorModal();
		if (predictionsContainer) {
			predictionsContainer.innerHTML = '';
			predictionsContainer.style.display = 'none';
		}
	}
}

function openExerciseSelector() {
	console.log('[DEBUG] openExerciseSelector called');
	const selector = document.getElementById('exercise-selector');
	console.log('[DEBUG] selector element:', selector);
	if (selector) {
		selector.classList.remove('hidden');
		document.body.classList.add('selector-open');
		console.log('[DEBUG] Selector opened, hidden class removed');
		
		// Force visibility of "or" and "AI-detect" elements
		const orDiv = selector.querySelector('.exercise-selector-or');
		const aiDetectDiv = selector.querySelector('.exercise-selector-ai-detect');
		console.log('[DEBUG] orDiv:', orDiv);
		console.log('[DEBUG] aiDetectDiv:', aiDetectDiv);
		if (orDiv) {
			orDiv.style.display = 'block';
			orDiv.style.visibility = 'visible';
			orDiv.style.opacity = '1';
			console.log('[DEBUG] orDiv forced visible');
		}
		if (aiDetectDiv) {
			aiDetectDiv.style.display = 'flex';
			aiDetectDiv.style.visibility = 'visible';
			aiDetectDiv.style.opacity = '1';
			console.log('[DEBUG] aiDetectDiv forced visible');
		}
		
		const searchInput = document.getElementById('exercise-selector-search');
		if (searchInput) {
			searchInput.value = '';
			// Don't auto-focus - let user click to type
		}
		// clear any previous AI predictions
		const preds = document.getElementById('exercise-selector-predictions');
		if (preds) {
			preds.innerHTML = '';
			preds.style.display = 'none';
		}
		const filterFn = window.filterExercisesForSelector;
		if (typeof filterFn === 'function') {
			filterFn('', null);
		}
	} else {
		console.error('[ERROR] exercise-selector element not found!');
	}
}

// ========== WORKOUT BUILDER ==========
function initWorkoutBuilder() {
	const continueWorkoutBtn = document.getElementById('continue-workout-btn');
	const aiWorkoutBtn = document.getElementById('ai-workout-btn');
	const manualWorkoutBtn = document.getElementById('manual-workout-btn');
	const saveWorkoutBtn = document.getElementById('save-workout');
	const backWorkoutBtn = document.getElementById('back-to-workouts');
	const workoutNameInput = document.getElementById('workout-name');
	
	if (continueWorkoutBtn) {
		continueWorkoutBtn.addEventListener('click', () => {
			resumeWorkoutDraft();
		});
	}
	
	if (aiWorkoutBtn) {
		aiWorkoutBtn.addEventListener('click', () => {
			startAIWorkout();
		});
	}
	
	if (manualWorkoutBtn) {
		manualWorkoutBtn.addEventListener('click', () => {
			startNewWorkout();
		});
	}
	
	if (saveWorkoutBtn) {
		saveWorkoutBtn.addEventListener('click', () => {
			saveWorkout();
		});
	}

	if (backWorkoutBtn) {
		backWorkoutBtn.addEventListener('click', () => {
			switchTab('workouts');
		});
	}
	
	// Save workout name to draft when user types
	if (workoutNameInput) {
		workoutNameInput.addEventListener('input', () => {
			if (currentWorkout) {
				currentWorkout.name = workoutNameInput.value || 'Workout';
				saveWorkoutDraft();
			}
		});
	}

	updateWorkoutStartButton();
}

function startAIWorkout() {
	isAIWorkoutMode = true;
	// Clear existing messages and show AI workout welcome
	const messagesContainer = document.getElementById('vision-chat-messages');
	if (messagesContainer) {
		messagesContainer.innerHTML = `
			<div class="vision-message vision-message-bot">
				<div class="vision-avatar">
					<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<circle cx="12" cy="12" r="10" stroke="var(--accent)" stroke-width="2" fill="rgba(124,92,255,0.1)"/>
						<circle cx="12" cy="12" r="4" fill="var(--accent)"/>
						<path d="M2 12s3-4 10-4 10 4 10 4" stroke="var(--accent)" stroke-width="2" fill="none" stroke-linecap="round"/>
					</svg>
				</div>
				<div class="vision-message-content">
					Hi! I'm Vision, your personal AI workout builder. Tell me what you want to train and I'll create it instantly.
				</div>
			</div>
		`;
	}
	switchTab('vision');
	// Focus on input
	const input = document.getElementById('vision-input');
	if (input) {
		setTimeout(() => input.focus(), 100);
	}
}

function startNewWorkout(workoutData = null) {
	currentWorkout = {
		name: workoutData?.name || 'Workout',
		exercises: workoutData?.exercises || [],
		startTime: new Date(),
		duration: 0
	};
	editingWorkoutId = null;
	workoutStartTime = Date.now();
	setWorkoutTimerDisplay(0);
	startWorkoutTimer();
	
	const workoutName = document.getElementById('workout-name');
	const workoutList = document.getElementById('workout-list');
	if (workoutName) workoutName.value = currentWorkout.name;
	if (workoutList) workoutList.innerHTML = '';
	renderWorkoutList();
	saveWorkoutDraft();
	updateWorkoutStartButton();
	
	switchTab('workout-builder');
}

// Quick workout generator - instant response based on keywords
function generateQuickWorkout(message) {
	const msg = message.toLowerCase().trim();
	
	// Check for specific exercises first (most specific)
	if (msg.includes('pushup') || msg.includes('push-up') || msg.includes('push up')) {
		return {
			name: 'Push-Up Workout',
			exercises: [
				{ key: 'push_up', display: 'Push-Up' }
			]
		};
	}
	
	// Check for specific exercise combinations
	if (msg.includes('dip')) {
		const exercises = [];
		if (msg.includes('pushup') || msg.includes('push-up') || msg.includes('push up')) {
			exercises.push({ key: 'push_up', display: 'Push-Up' });
		}
		if (msg.includes('dip')) {
			exercises.push({ key: 'dips', display: 'Dips' });
		}
		if (exercises.length > 0) {
			return {
				name: 'Workout',
				exercises: exercises
			};
		}
	}
	
	// Shoulders workout (check for "shoulder" or "shoulders" - with or without "workout")
	if (msg.includes('shoulder')) {
		return {
			name: 'Shoulders Workout',
			exercises: [
				{ key: 'shoulder_press_machine', display: 'Shoulder Press Machine' },
				{ key: 'lateral_raise_machine', display: 'Lateral Raise Machine' },
				{ key: 'front_raise', display: 'Front Raise' },
				{ key: 'rear_delt_fly', display: 'Rear Delt Fly' },
				{ key: 'cable_face_pull', display: 'Cable Face Pull' }
			]
		};
	}
	
	// Chest workout (check for "chest" - handles "only chest", "chest workout", etc.)
	if (msg.includes('chest') || msg.includes('borst')) {
		return {
			name: 'Chest Workout',
			exercises: [
				{ key: 'bench_press', display: 'Bench Press' },
				{ key: 'incline_bench_press', display: 'Incline Bench Press' },
				{ key: 'dumbbell_fly', display: 'Dumbbell Fly' },
				{ key: 'cable_crossover', display: 'Cable Crossover' },
				{ key: 'pec_deck_machine', display: 'Pec Deck Machine' }
			]
		};
	}
	
	// Back workout
	if (msg.includes('back')) {
		return {
			name: 'Back Workout',
			exercises: [
				{ key: 'lat_pulldown', display: 'Lat Pulldown' },
				{ key: 'seated_row', display: 'Seated Row' },
				{ key: 'one_arm_dumbbell_row', display: 'One Arm Dumbbell Row' },
				{ key: 'bent_over_row', display: 'Bent Over Row' },
				{ key: 'deadlift', display: 'Deadlift' }
			]
		};
	}
	
	// Biceps workout
	if (msg.includes('bicep')) {
		return {
			name: 'Biceps Workout',
			exercises: [
				{ key: 'barbell_curl', display: 'Barbell Curl' },
				{ key: 'dumbbell_curl', display: 'Dumbbell Curl' },
				{ key: 'hammer_curl', display: 'Hammer Curl' },
				{ key: 'preacher_curl', display: 'Preacher Curl' },
				{ key: 'cable_curl', display: 'Cable Curl' }
			]
		};
	}
	
	// Triceps workout
	if (msg.includes('tricep')) {
		return {
			name: 'Triceps Workout',
			exercises: [
				{ key: 'tricep_pushdown', display: 'Tricep Pushdown' },
				{ key: 'overhead_tricep_extension', display: 'Overhead Tricep Extension' },
				{ key: 'dips', display: 'Dips' }
			]
		};
	}
	
	// Legs workout (check for leg, quad, hamstring, glute, calf)
	if (msg.includes('leg') || msg.includes('quad') || msg.includes('hamstring') || msg.includes('glute') || msg.includes('calf')) {
		return {
			name: 'Legs Workout',
			exercises: [
				{ key: 'leg_press', display: 'Leg Press' },
				{ key: 'leg_extension', display: 'Leg Extension' },
				{ key: 'lying_leg_curl', display: 'Lying Leg Curl' },
				{ key: 'hip_thrust', display: 'Hip Thrust' },
				{ key: 'standing_calf_raise', display: 'Standing Calf Raise' }
			]
		};
	}
	
	// Full body (check before generic push/pull/legs)
	if (msg.includes('full body') || msg.includes('fullbody') || msg.includes('full-body')) {
		return {
			name: 'Full Body Workout',
			exercises: [
				{ key: 'bench_press', display: 'Bench Press' },
				{ key: 'lat_pulldown', display: 'Lat Pulldown' },
				{ key: 'leg_press', display: 'Leg Press' },
				{ key: 'shoulder_press_machine', display: 'Shoulder Press Machine' },
				{ key: 'barbell_curl', display: 'Barbell Curl' },
				{ key: 'tricep_pushdown', display: 'Tricep Pushdown' }
			]
		};
	}
	
	// Push workout - only if it's explicitly "push workout" or "push day", not just "push" in other words
	if ((msg.match(/\bpush\b/) && (msg.includes('workout') || msg.includes('day') || msg.includes('train')))) {
		return {
			name: 'Push Workout',
			exercises: [
				{ key: 'bench_press', display: 'Bench Press' },
				{ key: 'incline_bench_press', display: 'Incline Bench Press' },
				{ key: 'shoulder_press_machine', display: 'Shoulder Press Machine' },
				{ key: 'lateral_raise_machine', display: 'Lateral Raise Machine' },
				{ key: 'tricep_pushdown', display: 'Tricep Pushdown' }
			]
		};
	}
	
	// Pull workout
	if ((msg.match(/\bpull\b/) && (msg.includes('workout') || msg.includes('day') || msg.includes('train')))) {
		return {
			name: 'Pull Workout',
			exercises: [
				{ key: 'lat_pulldown', display: 'Lat Pulldown' },
				{ key: 'seated_row', display: 'Seated Row' },
				{ key: 'one_arm_dumbbell_row', display: 'One Arm Dumbbell Row' },
				{ key: 'barbell_curl', display: 'Barbell Curl' },
				{ key: 'dumbbell_curl', display: 'Dumbbell Curl' }
			]
		};
	}
	
	return null; // No quick match, use AI
}

function applyWorkoutFromVision(workoutData) {
	// Convert workout data to proper format
	const exercises = workoutData.exercises.map(hydrateExerciseFromMetadata);
	
	startNewWorkout({
		name: workoutData.name || 'AI Workout',
		exercises: exercises
	});
}

function hydrateExerciseFromMetadata(exercise) {
	const meta = findExerciseMetadata(exercise);
	const sets = Array.isArray(exercise?.sets) && exercise.sets.length
		? exercise.sets
		: createDefaultSets();
	return {
		key: meta?.key || exercise?.key,
		display: exercise?.display || meta?.display || exercise?.key || 'Exercise',
		image: meta?.image || exercise?.image,
		muscles: (exercise?.muscles && exercise.muscles.length) ? exercise.muscles : (meta?.muscles || []),
		video: meta?.video || exercise?.video,
		sets
	};
}

function renderExerciseInfoButton(exercise) {
	if (!exercise) return '';
	let videoUrl = exercise.video;
	if (!videoUrl) {
		const meta = findExerciseMetadata(exercise);
		videoUrl = meta?.video || '';
		if (videoUrl) {
			// Persist video on the exercise object so subsequent renders reuse it.
			exercise.video = videoUrl;
		}
	}
	const videoAttr = escapeHtmlAttr(videoUrl);
	const hasVideoAttr = videoUrl ? 'data-has-video="true"' : 'data-has-video="false"';
	const exerciseIdAttr = escapeHtmlAttr(exercise.key || exercise.display || '');
	return `<button type="button" class="exercise-info-btn" data-video="${videoAttr}" data-exercise="${exerciseIdAttr}" ${hasVideoAttr} title="Watch exercise video" aria-label="Watch exercise video">
		<img src="static/question.png" alt="" draggable="false">
	</button>`;
}

function escapeHtmlAttr(value) {
	return (value ?? '').toString().replace(/"/g, '&quot;');
}

function findExerciseMetadata(exercise) {
	if (!exercise) return null;
	const key = normalizeExerciseKey(exercise.key);
	const display = (exercise.display || '').toLowerCase().trim();
	return allExercises.find(meta => {
		const metaKey = normalizeExerciseKey(meta.key);
		if (key && metaKey === key) return true;
		if (display && meta.display && meta.display.toLowerCase().trim() === display) return true;
		return false;
	}) || null;
}

function normalizeExerciseKey(value) {
	return (value || '').toString().trim().toLowerCase().replace(/\s+/g, '_');
}

function startWorkoutTimer() {
	if (workoutTimer) clearInterval(workoutTimer);
	
	workoutTimer = setInterval(() => {
		if (!workoutStartTime) return;
		const elapsed = Date.now() - workoutStartTime;
		setWorkoutTimerDisplay(elapsed);
	}, 1000);
}

function setWorkoutTimerDisplay(durationMs = 0) {
		const timerEl = document.getElementById('workout-timer');
		if (timerEl) {
		timerEl.textContent = formatDurationDisplay(durationMs);
		}
}

async function addExerciseToWorkout(exercise) {
	if (!currentWorkout) {
		startNewWorkout();
	}
	
	// Get full exercise info if we only have a key
	let exerciseData = exercise;
	if (typeof exercise === 'string' || (exercise && !exercise.display)) {
		try {
			const res = await fetch('/exercise-info', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ exercise: exercise.key || exercise })
			});
			exerciseData = await res.json();
		} catch (e) {
			console.error('Failed to get exercise info:', e);
			return;
		}
	}
	
	// Use sets if already provided, otherwise try to get last workout data for placeholders
	let existingSets;
	let previousSetsForPlaceholder = null;
	
	if (Array.isArray(exerciseData.sets) && exerciseData.sets.length > 0) {
		// Sets already provided (e.g., from reuse)
		existingSets = exerciseData.sets;
	} else if (exerciseData.previousSets && Array.isArray(exerciseData.previousSets)) {
		// Reuse case - use previousSets as placeholders, sets start empty
		previousSetsForPlaceholder = exerciseData.previousSets.map(s => ({ weight: s.weight || '', reps: s.reps || '' }));
		existingSets = createDefaultSets(previousSetsForPlaceholder.length || DEFAULT_SET_COUNT);
	} else {
		// New exercise - try to get last workout data for placeholders
		const lastSets = getLastExerciseData(exerciseData.key || exerciseData.display);
		if (lastSets && lastSets.length > 0) {
			previousSetsForPlaceholder = lastSets;
			existingSets = createDefaultSets(lastSets.length);
		} else {
			existingSets = createDefaultSets();
		}
	}
	
	currentWorkout.exercises.push({
		...exerciseData,
		sets: existingSets,
		previousSets: previousSetsForPlaceholder || exerciseData.previousSets
	});
	
	renderWorkoutList();
	saveWorkoutDraft();
}

function renderWorkoutList() {
	const workoutList = document.getElementById('workout-list');
	if (!workoutList || !currentWorkout) return;
	
	workoutList.innerHTML = '';
	
	currentWorkout.exercises.forEach((ex, idx) => {
		const li = document.createElement('li');
		li.className = 'workout-edit-exercise';
		const infoButtonHtml = renderExerciseInfoButton(ex);
		li.innerHTML = `
			<div class="workout-edit-exercise-header">
				<div class="workout-edit-exercise-title">
					${buildExerciseThumb(ex, 'small')}
					<div class="workout-exercise-name">${ex.display || ex.key}</div>
				</div>
				<div class="workout-exercise-actions">
					${infoButtonHtml}
					<button class="workout-edit-exercise-delete" aria-label="Remove exercise">
						<img src="static/close.png" alt="" />
					</button>
				</div>
			</div>
		`;
		
		const setsContainer = document.createElement('div');
		setsContainer.className = 'workout-edit-sets';
		ex.sets = Array.isArray(ex.sets) ? ex.sets : [];
		if (ex.sets.length === 0) {
			ex.sets = createDefaultSets();
		}
		
		const isBodyweight = isBodyweightExercise(ex);
		if (isBodyweight) {
			setsContainer.classList.add('bodyweight');
		}
		
		const headerRow = document.createElement('div');
		headerRow.className = 'workout-edit-set-row workout-edit-set-header';
		headerRow.innerHTML = `
			<div class="set-col">Set</div>
			${isBodyweight ? '' : '<div class="weight-col">Kg</div>'}
			<div class="reps-col">Reps</div>
			<div class="action-col"></div>
		`;
		setsContainer.appendChild(headerRow);
		
		ex.sets.forEach((set, setIdx) => {
			// Get placeholder values from previousSets or from the set itself if it has values
			const prevSet = Array.isArray(ex.previousSets) ? ex.previousSets[setIdx] : null;
			
			// For weight placeholder: use set value if it exists, otherwise use previousSet, otherwise 0
			const weightPlaceholder = (set.weight != null && set.weight !== '') 
				? set.weight 
				: (prevSet && prevSet.weight != null && prevSet.weight !== '' ? prevSet.weight : 0);
			
			// For reps placeholder: use set value if it exists, otherwise use previousSet, otherwise 0
			const repsPlaceholder = (set.reps != null && set.reps !== '') 
				? set.reps 
				: (prevSet && prevSet.reps != null && prevSet.reps !== '' ? prevSet.reps : 0);
			
			const setRow = document.createElement('div');
			setRow.className = 'workout-edit-set-row data';
			if ((setIdx % 2) === 1) {
				setRow.classList.add('even');
			}
			setRow.innerHTML = `
				<div class="set-col">
				<div class="workout-edit-set-number">${setIdx + 1}</div>
				</div>
				${isBodyweight ? '' : `<div class="weight-col">
					<input type="number" class="workout-edit-set-input weight" placeholder="${weightPlaceholder}" inputmode="decimal" value="${set.weight ?? ''}" aria-label="Set weight (kg)">
				</div>`}
				<div class="reps-col">
					<input type="number" class="workout-edit-set-input reps" placeholder="${repsPlaceholder}" inputmode="numeric" value="${set.reps ?? ''}" aria-label="Set reps">
				</div>
				<div class="action-col">
					<button type="button" class="workout-edit-set-delete" aria-label="Delete set">
						<img src="static/close.png" alt="">
					</button>
				</div>
			`;
			
			const weightInput = setRow.querySelector('.weight');
			const repsInput = setRow.querySelector('.reps');
			const deleteBtn = setRow.querySelector('.workout-edit-set-delete');
			
			if (weightInput) {
				weightInput.addEventListener('input', (e) => {
					ex.sets[setIdx].weight = e.target.value ? Number(e.target.value) : '';
					saveWorkoutDraft();
				});
			}
			
				repsInput.addEventListener('input', (e) => {
				ex.sets[setIdx].reps = e.target.value ? Number(e.target.value) : '';
				saveWorkoutDraft();
				});
			
			deleteBtn.addEventListener('click', () => {
					ex.sets.splice(setIdx, 1);
					renderWorkoutList();
				saveWorkoutDraft();
				});
			
			setsContainer.appendChild(setRow);
		});
		
		const addSetBtn = document.createElement('button');
		addSetBtn.className = 'workout-edit-add-set';
		addSetBtn.type = 'button';
		addSetBtn.textContent = '+ Add Set';
		addSetBtn.addEventListener('click', () => {
			if (!ex.sets) {
				ex.sets = [];
			}
			ex.sets.push({ weight: '', reps: '' });
			renderWorkoutList();
		});
		
		li.appendChild(setsContainer);
		li.appendChild(addSetBtn);
		
		const deleteExerciseBtn = li.querySelector('.workout-edit-exercise-delete');
		deleteExerciseBtn.addEventListener('click', () => {
				currentWorkout.exercises.splice(idx, 1);
				renderWorkoutList();
			saveWorkoutDraft();
			});
		
		workoutList.appendChild(li);
	});
	
	saveWorkoutDraft();
	
	// Add exercise button and cancel button (outside the ul, in the parent section)
	const workoutSection = document.getElementById('workout');
	if (workoutSection && workoutList) {
		// Remove existing buttons if they exist (to avoid duplicates)
		const existingAddBtn = workoutSection.querySelector('.workout-add-exercise-btn');
		const existingCancelBtn = workoutSection.querySelector('.workout-cancel-btn');
		if (existingAddBtn) existingAddBtn.remove();
		if (existingCancelBtn) existingCancelBtn.remove();
		
		// Add exercise button (insert after the ul)
		const addBtn = document.createElement('button');
		addBtn.className = 'btn workout-add-exercise-btn';
		addBtn.textContent = '+ Add Exercise';
		addBtn.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			console.log('[DEBUG] Add Exercise button clicked');
			openExerciseSelector();
		};
		addBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			console.log('[DEBUG] Add Exercise button clicked (addEventListener)');
			openExerciseSelector();
		});
		workoutList.insertAdjacentElement('afterend', addBtn);

		// Cancel workout button (insert after the add exercise button)
		const cancelBtn = document.createElement('button');
		cancelBtn.className = 'btn workout-cancel-btn';
		cancelBtn.textContent = 'Cancel workout';
		cancelBtn.onclick = () => {
			cancelWorkout();
		};
		addBtn.insertAdjacentElement('afterend', cancelBtn);
	}
}

function capitalizeFirstLetter(str) {
	if (!str || str.length === 0) return str;
	const firstChar = str.charAt(0);
	if (firstChar === firstChar.toUpperCase()) {
		return str; // Already starts with uppercase, return as is
	}
	return firstChar.toUpperCase() + str.slice(1);
}

function saveWorkout() {
	if (!currentWorkout) return;
	
	const workoutName = document.getElementById('workout-name');
	if (workoutName) {
		const nameValue = workoutName.value || 'Workout';
		const capitalizedName = capitalizeFirstLetter(nameValue);
		currentWorkout.name = capitalizedName;
		workoutName.value = capitalizedName; // Update the input field to show capitalized version
	}
	
	currentWorkout.exercises = (currentWorkout.exercises || []).map(ex => ({
		...ex,
		sets: (ex.sets || []).filter(set => set.weight !== '' || set.reps !== '')
	}));
	
	let duration = currentWorkout.duration || 0;
	if (!editingWorkoutId && workoutStartTime) {
		duration = Date.now() - workoutStartTime;
	}
	currentWorkout.duration = duration;
	
	// Save to localStorage for now
	const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
	const payload = {
				...currentWorkout,
		id: editingWorkoutId || currentWorkout.id || Date.now(),
		date: editingWorkoutId ? (currentWorkout.date || new Date().toISOString()) : new Date().toISOString()
	};
	
	if (editingWorkoutId) {
		const idx = workouts.findIndex(w => w.id === editingWorkoutId);
		if (idx >= 0) {
			workouts[idx] = payload;
		} else {
			workouts.push(payload);
		}
	} else {
		workouts.push(payload);
	}
	localStorage.setItem('workouts', JSON.stringify(workouts));
	
	// Update streak only for new workouts (not edits)
	if (!editingWorkoutId) {
		updateStreak();
	}
	
	editingWorkoutId = null;
	clearWorkoutDraft();
	
	const saveSuccess = document.getElementById('save-success');
	if (saveSuccess) {
		saveSuccess.classList.remove('hidden');
		setTimeout(() => {
			saveSuccess.classList.add('hidden');
		}, 2000);
	}
	
	loadWorkouts(workouts);
	switchTab('workouts');
}

function loadWorkouts(prefetchedWorkouts = null) {
	const workouts = prefetchedWorkouts ?? JSON.parse(localStorage.getItem('workouts') || '[]');
	const workoutsList = document.getElementById('workouts-list');
	const workoutsCount = document.getElementById('workouts-count');
	
	if (workoutsCount) workoutsCount.textContent = `(${workouts.length})`;
	
	if (workoutsList) {
		workoutsList.innerHTML = '';
		
		if (workouts.length === 0) {
			const empty = document.createElement('li');
			empty.className = 'workout-empty';
			empty.textContent = 'No workouts yet. Start your first workout!';
			workoutsList.appendChild(empty);
			return;
		}
		
		const sorted = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date));
		
		sorted.forEach(workout => {
			const li = document.createElement('li');
			const date = new Date(workout.date);
			const dateLabel = formatWorkoutDate(date);
			const durationLabel = formatDurationForCard(workout.duration);
			const volume = calculateWorkoutVolume(workout);
			const volumeLabel = formatVolume(volume);
			const exercisesMarkup = buildWorkoutExercisesMarkup(workout);
			
			const monthName = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase().slice(0, 3);
			const dayNumber = date.getDate();
			
			li.innerHTML = `
				<div class="workout-top-row">
					<div class="workout-name-row">
						<div class="workout-calendar">
							<div class="workout-calendar-header">${monthName}</div>
							<div class="workout-calendar-day">${dayNumber}</div>
						</div>
						<div class="workout-summary">${workout.name || 'Workout'}</div>
						<div class="workout-actions">
							<button class="workout-reuse-btn" title="Reuse workout">
								<img src="static/refresh-button.png" alt="Reuse" />
						</button>
							<button class="workout-edit-btn" title="Inline edit">
								<img src="static/pencil.png" alt="Details" />
						</button>
							<button class="workout-delete-btn" title="Delete workout">
								<img src="static/close.png" alt="Delete" />
						</button>
					</div>
				</div>
				<div class="workout-details readonly">
					<div class="workout-stats">
						<div class="workout-stat">
							<div class="workout-stat-label">Time</div>
							<div class="workout-stat-value">${durationLabel}</div>
						</div>
						<div class="workout-stat">
							<div class="workout-stat-label">Volume</div>
							<div class="workout-stat-value">${volumeLabel}</div>
						</div>
					</div>
					${exercisesMarkup}
				</div>
			`;
			
			const details = li.querySelector('.workout-details');
			const reuseBtn = li.querySelector('.workout-reuse-btn');
			const editBtn = li.querySelector('.workout-edit-btn');
			const deleteBtn = li.querySelector('.workout-delete-btn');
			
			// Clicking the card just expands/collapses a read-only view
			li.addEventListener('click', (e) => {
				if (e.target.closest('.workout-actions')) return;
				if (e.target.closest('.exercise-info-btn')) return;
				if (e.target.closest('.exercise-video-inline')) return;
				if (!details) return;
				details.classList.toggle('expanded');
				details.classList.add('readonly');
				details.classList.remove('inline-edit');
			});
			
			if (editBtn) {
				// Pencil opens the full workout builder to edit sets/exercises
				editBtn.addEventListener('click', (e) => {
				e.stopPropagation();
					editWorkout(workout);
			});
			}
			
			if (reuseBtn) {
				reuseBtn.addEventListener('click', (e) => {
				e.stopPropagation();
					reuseWorkout(workout);
			});
			}
			
			if (deleteBtn) {
				deleteBtn.addEventListener('click', (e) => {
				e.stopPropagation();
					deleteWorkout(workout.id);
			});
			}
			
			workoutsList.appendChild(li);
		});
	}
}

function buildWorkoutExercisesMarkup(workout) {
	const exercises = workout.exercises || [];
	if (!exercises.length) {
		return `<div class="workout-exercise-empty">No exercises logged</div>`;
	}
	
	return exercises.map(exercise => {
		const sets = exercise.sets || [];
		const isBodyweight = isBodyweightExercise(exercise);
		
		const setsMarkup = sets.length
			? sets.map((set, idx) => `
				<div class="workout-edit-set-row view${(idx % 2) === 1 ? ' even' : ''}">
					<div class="set-col">
						<div class="workout-edit-set-number">${idx + 1}</div>
				</div>
					${isBodyweight ? '' : `<div class="weight-col">
						<div class="workout-view-value">${set.weight ?? 0}</div>
				</div>`}
					<div class="reps-col">
						<div class="workout-view-value">${set.reps ?? 0}</div>
			</div>
					<div class="action-col">
						<button type="button" class="workout-edit-set-delete" aria-label="Set actions" disabled>
							<img src="static/close.png" alt="">
						</button>
					</div>
				</div>
			`).join('')
			: `<div class="workout-set-line empty">No sets recorded</div>`;
		
		const infoButtonHtml = renderExerciseInfoButton(exercise);
		return `
			<div class="workout-exercise workout-view-exercise">
				<div class="workout-view-header">
					<div class="workout-exercise-main">
						${buildExerciseThumb(exercise)}
						<div class="workout-exercise-name">${exercise.display || exercise.key || 'Exercise'}</div>
					</div>
					<div class="workout-view-actions">
						${infoButtonHtml}
					</div>
				</div>
				<div class="workout-edit-sets view-mode ${isBodyweight ? 'bodyweight' : ''}">
					<div class="workout-edit-set-row workout-edit-set-header">
						<div class="set-col">Set</div>
						${isBodyweight ? '' : '<div class="weight-col">Kg</div>'}
						<div class="reps-col">Reps</div>
						<div class="action-col"></div>
					</div>
					${setsMarkup}
				</div>
			</div>
		`;
	}).join('');
}

function getWorkoutAvatar(workout) {
	const firstExercise = workout.exercises && workout.exercises[0];
	return getExerciseAvatar(firstExercise, workout.name);
}

function getExerciseAvatar(exercise, fallbackText = 'W') {
	if (exercise && exercise.image) {
		return `
			<div class="workout-avatar">
				<img src="${exercise.image}" alt="${exercise.display || 'exercise'}" />
			</div>
		`;
	}
	
	const label = (exercise?.display || exercise?.key || fallbackText || 'W').charAt(0).toUpperCase();
	return `<div class="workout-avatar placeholder">${label}</div>`;
}

function buildExerciseThumb(exercise, size = 'large') {
	const label = (exercise?.display || exercise?.key || 'E').charAt(0).toUpperCase();
	const candidates = getExerciseImageCandidates(exercise);
	const imageSrc = candidates.shift();
	const shouldShowInitial = !imageSrc;
	const fallbackAttr = candidates.length ? ` data-fallbacks="${candidates.join('|')}"` : '';
	const hasImage = Boolean(imageSrc);
	return `
		<div class="workout-exercise-thumb ${hasImage ? '' : 'placeholder'} ${size}">
			${hasImage ? `<img src="${imageSrc}" alt="${exercise.display || exercise.key || 'Exercise'}" onerror="handleExerciseImageError(this)" draggable="false"${fallbackAttr} />` : ''}
			${shouldShowInitial ? `<span class="workout-exercise-initial">${label}</span>` : ''}
		</div>
	`;
}

function getExerciseImageSource(exercise) {
	const candidates = getExerciseImageCandidates(exercise);
	return candidates.length ? candidates[0] : null;
}

function getExerciseImageCandidates(exercise) {
	if (!exercise) return [];
	if (exercise.image) {
		// If it's an external URL (http/https), use it directly
		if (exercise.image.startsWith('http://') || exercise.image.startsWith('https://')) {
			return [exercise.image];
		}
		// If it's a local path, use getApiUrl to resolve it correctly
		return [getApiUrl(exercise.image)];
	}
	const candidates = [];
	const seen = new Set();
	const addPath = (path) => {
		if (path && !seen.has(path)) {
			seen.add(path);
			// Use getApiUrl for local paths
			const resolvedPath = path.startsWith('http://') || path.startsWith('https://') 
				? path 
				: getApiUrl(path);
			candidates.push(resolvedPath);
		}
	};
	const addBase = (base) => {
		if (!base) return;
		addPath(`/images/${base}.jpg`);
		addPath(`/images/${base}.png`);
		addPath(`/images/${base}.jpeg`);
	};
	
	// Special case: use specific images for generic predictions
	const label = (exercise.display || exercise.key || '').toString().toLowerCase().trim();
	if (label === 'smith machine') {
		addPath('/images/smithmachine.jpg');
	}
	if (label === 'dumbbell') {
		addPath('/images/dumbbell.jpg');
	}
	if (label === 'chinning dipping' || label === 'leg raise tower') {
		addPath('/images/chinningdipping.jpg');
	}
	
	const displaySlug = slugifyForImage(exercise.display);
	if (displaySlug) addBase(displaySlug);
	const keySlug = slugifyForImage(exercise.key?.replace(/_/g, ' '));
	if (keySlug) addBase(keySlug);
	const rawKeySlug = slugifyForImage(exercise.key);
	if (rawKeySlug && rawKeySlug !== keySlug) addBase(rawKeySlug);
	return candidates;
}

function slugifyForImage(value) {
	if (!value) return '';
	return value.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function handleExerciseImageError(img) {
	if (!img) return;
	const fallbacks = (img.dataset.fallbacks || '').split('|').filter(Boolean);
	if (fallbacks.length) {
		const nextSrc = fallbacks.shift();
		img.dataset.fallbacks = fallbacks.join('|');
		img.src = nextSrc;
		return;
	}
	const thumb = img.closest('.workout-exercise-thumb');
	if (thumb) {
		thumb.classList.add('placeholder');
	}
	img.remove();
}

function hasWorkoutDraft() {
	return !!localStorage.getItem(WORKOUT_DRAFT_KEY);
}

function saveWorkoutDraft() {
	if (!currentWorkout) {
		clearWorkoutDraft();
		return;
	}
	const draft = {
		workout: currentWorkout,
		startTime: workoutStartTime || Date.now(),
		editingWorkoutId: editingWorkoutId || null
	};
	try {
		localStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify(draft));
	} catch (e) {
		console.error('Failed to save workout draft:', e);
	}
	updateWorkoutStartButton();
}

function clearWorkoutDraft() {
	try {
		localStorage.removeItem(WORKOUT_DRAFT_KEY);
	} catch (e) {
		console.error('Failed to clear workout draft:', e);
	}
	updateWorkoutStartButton();
}

function cancelWorkout() {
	// Stop the workout timer
	if (workoutTimer) {
		clearInterval(workoutTimer);
		workoutTimer = null;
	}
	
	// Clear workout data
	currentWorkout = null;
	workoutStartTime = null;
	editingWorkoutId = null;
	
	// Clear the draft
	clearWorkoutDraft();
	
	// Switch back to workouts tab
	switchTab('workouts');
}

function updateWorkoutStartButton() {
	const continueBtn = document.getElementById('continue-workout-btn');
	const startButtons = document.getElementById('start-workout-buttons');
	
	const hasDraft = hasWorkoutDraft();
	
	// Always ensure mutual exclusivity
	if (hasDraft) {
		// Show continue button, hide start buttons
		if (continueBtn) {
			continueBtn.classList.remove('hidden');
			continueBtn.style.display = 'block';
		}
		if (startButtons) {
			startButtons.style.display = 'none';
		}
	} else {
		// Hide continue button, show start buttons
		if (continueBtn) {
			continueBtn.classList.add('hidden');
			continueBtn.style.display = 'none';
		}
		if (startButtons) {
			startButtons.style.display = 'flex';
		}
	}
}

function resumeWorkoutDraft() {
	const raw = localStorage.getItem(WORKOUT_DRAFT_KEY);
	if (!raw) {
		startNewWorkout();
		return;
	}
	let parsed = null;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		console.error('Failed to parse workout draft:', e);
		startNewWorkout();
		return;
	}
	const draftWorkout = parsed.workout;
	const draftStartTime = parsed.startTime;
	const draftEditingId = parsed.editingWorkoutId || null;
	if (!draftWorkout || !Array.isArray(draftWorkout.exercises)) {
		startNewWorkout();
		return;
	}
	currentWorkout = draftWorkout;
	editingWorkoutId = draftEditingId;
	
	// If we're editing a workout, don't start the timer and use the existing duration
	if (editingWorkoutId) {
		workoutStartTime = null;
		if (workoutTimer) {
			clearInterval(workoutTimer);
			workoutTimer = null;
		}
		setWorkoutTimerDisplay(currentWorkout.duration || 0);
	} else {
		// New workout - start the timer
		workoutStartTime = draftStartTime || Date.now();
		startWorkoutTimer();
	}
	
	const workoutName = document.getElementById('workout-name');
	if (workoutName) workoutName.value = currentWorkout.name || 'Workout';
	renderWorkoutList();
	switchTab('workout-builder');
}

function formatWorkoutDate(date) {
	return date.toLocaleDateString(undefined, {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});
}

function formatDurationDisplay(durationMs = 0) {
	if (!durationMs || durationMs < 0) return '00:00';
	const totalSeconds = Math.floor(durationMs / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	// Under 1 hour → keep MM:SS
	if (hours === 0) {
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	// 1 hour or more → H:MM:SS
	return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDurationForCard(durationMs = 0) {
	if (!durationMs || durationMs < 0) return '0 min';
	const totalSeconds = Math.floor(durationMs / 1000);
	const totalMinutes = Math.floor(totalSeconds / 60);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	// Under 1 hour → show as "45 min"
	if (hours === 0) {
		return `${minutes} min`;
	}

	// 1 hour or more → show as "1h 10min"
	if (minutes === 0) {
		return `${hours}h`;
	}
	return `${hours}h ${minutes}min`;
}

function calculateWorkoutVolume(workout) {
	if (!workout || !workout.exercises) return 0;
	let totalVolume = 0;
	
	workout.exercises.forEach(exercise => {
		if (!exercise.sets || !Array.isArray(exercise.sets)) return;
		
		exercise.sets.forEach(set => {
			const weight = parseFloat(set.weight) || 0;
			const reps = parseInt(set.reps) || 0;
			totalVolume += weight * reps;
		});
	});
	
	return totalVolume;
}

function formatVolume(volumeKg) {
	if (volumeKg === 0) return '0 kg';
	return `${Math.round(volumeKg).toLocaleString()} kg`;
}

function deleteWorkout(id) {
	const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
	const filtered = workouts.filter(workout => workout.id !== id);
	localStorage.setItem('workouts', JSON.stringify(filtered));
	loadWorkouts();
}

function editWorkout(workout) {
	if (!workout) return;
	currentWorkout = JSON.parse(JSON.stringify(workout));
	editingWorkoutId = workout.id;
	workoutStartTime = null;
	if (workoutTimer) {
		clearInterval(workoutTimer);
		workoutTimer = null;
	}
	setWorkoutTimerDisplay(currentWorkout.duration || 0);
	
	const workoutName = document.getElementById('workout-name');
	if (workoutName) workoutName.value = currentWorkout.name || 'Workout';
	
	renderWorkoutList();
	switchTab('workout-builder');
}

function reuseWorkout(workout) {
	if (!workout) return;
	const source = JSON.parse(JSON.stringify(workout));
	delete source.id;
	const reused = {
		name: source.name || 'Workout',
		exercises: [],
		startTime: new Date(),
		duration: 0
	};
	if (Array.isArray(source.exercises)) {
		source.exercises.forEach(ex => {
			const prevSets = Array.isArray(ex.sets) ? ex.sets.map(s => ({
				weight: s.weight ?? 0,
				reps: s.reps ?? 0
			})) : [];
			const sets = createDefaultSets(prevSets.length || DEFAULT_SET_COUNT);
			reused.exercises.push({
				...ex,
				previousSets: prevSets,
				sets
			});
		});
	}
	currentWorkout = reused;
	editingWorkoutId = null;
	workoutStartTime = Date.now();
	setWorkoutTimerDisplay(0);
	startWorkoutTimer();
	
	const workoutName = document.getElementById('workout-name');
	if (workoutName) workoutName.value = currentWorkout.name || 'Workout';
	
	renderWorkoutList();
	switchTab('workout-builder');
}

// ========== PROGRESS ==========
function initProgress() {
	// Set default date to today
	const dateInput = document.getElementById('progress-date');
	if (dateInput && !dateInput.value) {
		const today = new Date();
		const year = today.getFullYear();
		const month = String(today.getMonth() + 1).padStart(2, '0');
		const day = String(today.getDate()).padStart(2, '0');
		dateInput.value = `${year}-${month}-${day}`;
	}
	
	const progressForm = document.getElementById('progress-form');
	if (progressForm) {
		progressForm.addEventListener('submit', (e) => {
			e.preventDefault();
			const weight = document.getElementById('progress-weight')?.value;
			const dateInputValue = document.getElementById('progress-date')?.value;
			if (weight && dateInputValue) {
				const progress = JSON.parse(localStorage.getItem('progress') || '[]');
				// Use the selected date so you can backfill specific days
				const dayKey = dateInputValue; // YYYY-MM-DD from input[type=date]
				const now = new Date(`${dayKey}T12:00:00`);
				const value = parseFloat(weight);
				// Remove any existing entries for this day (to prevent duplicates)
				const filteredProgress = progress.filter(p => {
					const pDayKey = p.dayKey || (p.date ? p.date.slice(0, 10) : '');
					return pDayKey !== dayKey;
				});
				// Add the new entry with both date and dayKey for consistency
				filteredProgress.push({
					date: now.toISOString(),
					dayKey: dayKey, // Ensure dayKey is always set
					weight: value
				});
				// Ensure all existing entries also have dayKey
				const normalizedProgress = filteredProgress.map(p => ({
					...p,
					dayKey: p.dayKey || (p.date ? p.date.slice(0, 10) : '')
				}));
				localStorage.setItem('progress', JSON.stringify(normalizedProgress));
				// Reset weight input
				const weightInput = document.getElementById('progress-weight');
				if (weightInput) weightInput.value = '';
				// Reset date to today after saving
				const today = new Date();
				const year = today.getFullYear();
				const month = String(today.getMonth() + 1).padStart(2, '0');
				const day = String(today.getDate()).padStart(2, '0');
				if (dateInput) dateInput.value = `${year}-${month}-${day}`;
				const dateEl = document.getElementById('progress-date');
				if (dateEl) {
					const today = new Date();
					dateEl.value = today.toISOString().slice(0, 10);
				}
				loadProgress();
			}
		});
	}
	
	const filterBtns = document.querySelectorAll('.progress-filter-btn');
	filterBtns.forEach(btn => {
		btn.addEventListener('click', () => {
			filterBtns.forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			loadProgress();
		});
	});

	// Exercise insights selector
	const prSelectBtn = document.getElementById('progress-open-exercise-selector');
	if (prSelectBtn) {
		prSelectBtn.addEventListener('click', () => {
			window.exerciseSelectorContext = 'insights';
			openExerciseSelector();
		});
	}
	
	loadProgress();

	// Ensure date input defaults to today on first load
	const dateEl = document.getElementById('progress-date');
	if (dateEl && !dateEl.value) {
		const today = new Date();
		dateEl.value = today.toISOString().slice(0, 10);
	}
}

async function loadProgress() {
	const progress = JSON.parse(localStorage.getItem('progress') || '[]');
	const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
	renderWeightChart(progress);
	await renderMuscleFocus(workouts);
	updateExerciseInsightsOptions(workouts);
	renderPRTimeline(workouts);
	renderProgressiveOverloadTracker(workouts);
}

function renderWeightChart(progress) {
	const canvas = document.getElementById('progress-chart');
	const empty = document.getElementById('progress-empty');
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	canvas.width = canvas.clientWidth || 320;
	canvas.height = canvas.clientHeight || 220;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	
	// Clear any existing hover points
	canvas.__weightPoints = null;

	if (!progress.length) {
		if (empty) empty.classList.remove('hidden');
		const tooltip = document.getElementById('progress-tooltip');
		if (tooltip) tooltip.style.display = 'none';
		return;
	}
	if (empty) empty.classList.add('hidden');

	// Sort by dayKey (YYYY-MM-DD) if available, otherwise by date string
	// This ensures consistent sorting regardless of how the date was stored
	const sorted = [...progress].sort((a, b) => {
		const aKey = a.dayKey || (a.date ? a.date.slice(0, 10) : '');
		const bKey = b.dayKey || (b.date ? b.date.slice(0, 10) : '');
		return aKey.localeCompare(bKey);
	});
	
	// Remove the first data point if there are multiple points
	if (sorted.length > 1) {
		sorted.shift(); // Remove first element
	}
	const points = sorted.map((p, idx) => ({
		x: idx,
		y: p.weight,
		date: new Date(p.dayKey ? `${p.dayKey}T12:00:00` : p.date)
	}));

	// Define initial Y-axis ticks around the FIRST value (keep equal visual spacing)
	const firstWeight = points[0].y || 0;
	const base = Math.round(firstWeight / 10) * 10; // nearest 10
	let rawTicks = [
		base - 40,
		base - 20,
		base,
		base + 20,
		base + 40
	].map(v => Math.max(0, v));

	// If a later value goes above the current top tick, stretch only the top part:
	// - keep the three lower ticks the same
	// - make the highest value the new top tick
	// - put a new tick exactly in the middle between base and the new top
	const maxDataValue = Math.max(...points.map(p => p.y || 0));
	if (maxDataValue > rawTicks[4]) {
		const newTop = Math.ceil(maxDataValue / 10) * 10; // round up to nearest 10
		const midHigh = Math.round((base + newTop) / 20) * 10; // midpoint between base and top, rounded to 10
		rawTicks = [
			rawTicks[0],
			rawTicks[1],
			base,
			midHigh,
			newTop
		];
	}

	const minY = rawTicks[0];
	const maxY = rawTicks[rawTicks.length - 1];
	const padX = 40;
	const padY = 24;
	const w = canvas.width - padX * 2;
	const h = canvas.height - padY * 2;

	const scaleX = points.length > 1 ? w / (points.length - 1) : 0;
	const scaleY = maxY === minY ? 1 : h / (maxY - minY);

	// Helper: map a weight value to a Y coordinate.
	// For values up to the second tick, we "stretch" 0..tick1 across the space
	// from the X-axis to the first visible gridline, so lower weights don't sit
	// directly on the axis.
	function valueToY(v) {
		const vClamped = Math.max(0, v);
		const bottomY = padY + h;
		const tick0 = rawTicks[0];
		const tick1 = rawTicks[1];
		const yTick1 = padY + h - ((tick1 - minY) * scaleY);
		const bandHeight = bottomY - yTick1;

		if (vClamped <= tick1) {
			const ratio = vClamped / tick1;
			return bottomY - bandHeight * ratio;
		}
		return padY + h - ((vClamped - minY) * scaleY);
	}

	// Axes + horizontal gridlines (labels via DOM for crisp text)
	ctx.strokeStyle = '#2b2b34';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(padX, padY);
	ctx.lineTo(padX, padY + h);
	ctx.lineTo(padX + w, padY + h);
	ctx.stroke();

	rawTicks.forEach(val => {
		const y = padY + h - ((val - minY) * scaleY);
		ctx.strokeStyle = 'rgba(43,43,52,0.6)';
		ctx.beginPath();
		ctx.moveTo(padX, y);
		ctx.lineTo(padX + w, y);
		ctx.stroke();
	});

	// Line
	ctx.strokeStyle = '#7c5cff';
	ctx.lineWidth = 2;
	ctx.beginPath();
	points.forEach((p, i) => {
		const x = padX + (scaleX * i);
		const y = valueToY(p.y);
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	});
	ctx.stroke();

	// Points
	ctx.fillStyle = '#7c5cff';
	const hoverPoints = points.map((p, i) => {
		const cx = padX + (scaleX * i);
		const cy = valueToY(p.y);
		ctx.beginPath();
		ctx.arc(cx, cy, 3, 0, Math.PI * 2);
		ctx.fill();
		return { cx, cy, date: p.date, weight: p.y };
	});

	// DOM-based axis labels for crisp text
	const yLabelsEl = document.getElementById('progress-y-labels');
	const xLabelsEl = document.getElementById('progress-x-labels');
	const tooltip = document.getElementById('progress-tooltip');
	
	// Hide tooltip initially
	if (tooltip) tooltip.style.display = 'none';
	
	// Set placeholder to last weight entry
	const weightInput = document.getElementById('progress-weight');
	if (weightInput && sorted.length > 0) {
		const lastEntry = sorted[sorted.length - 1];
		weightInput.placeholder = `${lastEntry.weight}`;
	} else if (weightInput) {
		weightInput.placeholder = '';
	}
	
	if (yLabelsEl) {
		yLabelsEl.innerHTML = '';
		rawTicks.forEach((val, idx) => {
			// position label a bit below the grid line to avoid overlapping the 'kg' unit
			const y = padY + h - ((val - minY) * scaleY) + 4;
			const label = document.createElement('span');
			label.style.top = `${y}px`;
			label.textContent = idx === 0 ? '' : val.toString();
			yLabelsEl.appendChild(label);
		});
	}
	if (xLabelsEl) {
		xLabelsEl.innerHTML = '';
		// Decide which indices to label on the X-axis
		const n = points.length;
		let labelIndices;
		if (n <= 1) {
			// 0–1 point: show all
			labelIndices = points.map((_, idx) => idx);
		} else {
			// 2+ points: only first and last label (clean X-axis)
			const lastIdx = n - 1;
			labelIndices = [0, lastIdx];
		}

		points.forEach((p, i) => {
			if (!labelIndices.includes(i)) return;
			// Calculate the exact X position of the data point on the canvas
			const pointX = padX + (scaleX * i);
			// The xLabelsEl container has left: 40px (padX), so we need to subtract that offset
			const label = document.createElement('span');
			label.style.left = `${pointX - padX}px`;
			label.textContent = p.date.toLocaleDateString(undefined, {
				day: '2-digit',
				month: 'short'
			});
			xLabelsEl.appendChild(label);
		});
	}
	// Store hover points on the canvas for interactive tooltip
	canvas.__weightPoints = hoverPoints;

	// Attach hover listeners once
	if (!canvas.__hoverBound) {
		canvas.addEventListener('mousemove', (e) => {
			if (!canvas.__weightPoints || !tooltip) return;
			const rect = canvas.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;
			let nearest = null;
			let minDistSq = Infinity;
			canvas.__weightPoints.forEach(pt => {
				const dx = x - pt.cx;
				const dy = y - pt.cy;
				const d2 = dx * dx + dy * dy;
				if (d2 < minDistSq) {
					minDistSq = d2;
					nearest = pt;
				}
			});
			const maxRadius = 48; // squared distance threshold ~7px
			if (!nearest || minDistSq > maxRadius) {
				tooltip.style.display = 'none';
				return;
			}
			const labelDate = nearest.date.toLocaleDateString(undefined, {
				day: '2-digit',
				month: 'short'
			});
			tooltip.textContent = `${labelDate} • ${nearest.weight} kg`;
			tooltip.style.left = `${nearest.cx}px`;
			tooltip.style.top = `${nearest.cy}px`;
			tooltip.style.display = 'block';
		});
		canvas.addEventListener('mouseleave', () => {
			if (tooltip) tooltip.style.display = 'none';
		});
		canvas.__hoverBound = true;
	}
		}

function updateWeightChartDate(progress) {
	const dateEl = document.getElementById('progress-chart-date');
	if (!dateEl) return;
	
	if (!progress || progress.length === 0) {
		// Show today's date if no data
		const today = new Date();
		dateEl.textContent = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		return;
	}
	
	// Show date range if there's data
	const sorted = [...progress].sort((a, b) => new Date(a.date) - new Date(b.date));
	const firstDate = new Date(sorted[0].date);
	const lastDate = new Date(sorted[sorted.length - 1].date);
	
	if (firstDate.toDateString() === lastDate.toDateString()) {
		// Same date, just show one
		dateEl.textContent = firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	} else {
		// Show date range
		const firstStr = firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		const lastStr = lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		dateEl.textContent = `${firstStr} - ${lastStr}`;
	}
}

async function renderMuscleFocus(workouts) {
	const empty = document.getElementById('progress-muscle-empty');
	const legend = document.getElementById('progress-muscle-legend');
	const canvas = document.getElementById('progress-muscle-chart');
	if (!legend || !canvas) return;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	canvas.width = canvas.clientWidth || 260;
	canvas.height = canvas.clientHeight || 260;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	legend.innerHTML = '';

	if (!workouts.length) {
		if (empty) empty.classList.remove('hidden');
		return;
	}

	// Date range filter
	const activeBtn = document.querySelector('.progress-filter-btn.active');
	const range = activeBtn?.dataset.range || 'week';
	
	let filtered;
	if (range === 'all') {
		// Show all workouts regardless of date
		filtered = workouts;
	} else {
		const now = new Date();
		const msPerDay = 24 * 60 * 60 * 1000;
		let days = 7;
		if (range === 'month') days = 30;
		else if (range === 'year') days = 365;
		const cutoff = now.getTime() - days * msPerDay;

		filtered = workouts.filter(w => {
			const d = new Date(w.date || now);
			return d.getTime() >= cutoff;
		});
	}

	if (!filtered.length) {
		if (empty) empty.classList.remove('hidden');
		return;
	}
	if (empty) empty.classList.add('hidden');

	// First, fetch missing muscle data for exercises that don't have it
	const exercisesNeedingMuscles = [];
	filtered.forEach(workout => {
		(workout.exercises || []).forEach(ex => {
			if (!ex.muscles || ex.muscles.length === 0) {
				exercisesNeedingMuscles.push({ exercise: ex, workout: workout });
			}
		});
	});
	
	// Fetch all missing muscle data in parallel
	await Promise.all(exercisesNeedingMuscles.map(async ({ exercise, workout }) => {
		try {
			const res = await fetch('/exercise-info', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ exercise: exercise.key || exercise.display })
			});
			const data = await res.json();
			if (data.muscles && data.muscles.length > 0) {
				exercise.muscles = data.muscles;
				// Update in localStorage
				const allWorkouts = JSON.parse(localStorage.getItem('workouts') || '[]');
				const workoutIndex = allWorkouts.findIndex(w => w.id === workout.id);
				if (workoutIndex >= 0) {
					const exIndex = allWorkouts[workoutIndex].exercises.findIndex(e => 
						(e.key || e.display) === (exercise.key || exercise.display)
					);
					if (exIndex >= 0) {
						allWorkouts[workoutIndex].exercises[exIndex].muscles = data.muscles;
						localStorage.setItem('workouts', JSON.stringify(allWorkouts));
					}
				}
			}
		} catch (e) {
			console.error('Failed to fetch exercise muscles:', e);
		}
	}));
	
	// Now calculate muscle totals
	const muscleTotals = {};
	filtered.forEach(workout => {
		(workout.exercises || []).forEach(ex => {
			const muscles = ex.muscles || [];
			const sets = ex.sets || [];
			const volume = sets.length || 1;
			const primary = muscles[0];
			if (!primary || primary === '-') return;
			// Normalize muscle name: capitalize first letter, lowercase rest
			const key = primary.charAt(0).toUpperCase() + primary.slice(1).toLowerCase();
			muscleTotals[key] = (muscleTotals[key] || 0) + volume;
		});
	});

	const entries = Object.entries(muscleTotals)
		.sort((a, b) => b[1] - a[1]);

	if (!entries.length) {
		if (empty) empty.classList.remove('hidden');
		return;
	}
	if (empty) empty.classList.add('hidden');

	const total = entries.reduce((sum, [, v]) => sum + v, 0);
	const centerX = canvas.width / 2;
	const centerY = canvas.height / 2;
	const radius = Math.min(canvas.width, canvas.height) / 2 - 10;
	const innerRadius = radius * 0.6;

	const colors = [
		'#ff69b4',  // pink
		'#00d4ff',  // light blue (vibrant)
		'#1e3a8a',  // dark blue
		'#32cd32',  // lime green
		'#006400',  // dark green
		'#7c5cff',  // purple (matches button accent color)
		'#ff0000',  // red
		'#ffa500',  // orange
		'#ffd700'   // yellow
	];

	let startAngle = -Math.PI / 2;
	entries.forEach(([muscle, value], idx) => {
		const percent = (value / total) * 100;
		const sliceAngle = (percent / 100) * Math.PI * 2;
		// Use white for abs, otherwise use the color array
		const color = muscle.toLowerCase() === 'abs' ? '#ffffff' : colors[idx % colors.length];

		ctx.beginPath();
		ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
		ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true);
		ctx.closePath();
		ctx.fillStyle = color;
		ctx.fill();

		startAngle += sliceAngle;

			const li = document.createElement('li');
			li.innerHTML = `
			<span class="progress-muscle-swatch" style="background:${color}"></span>
			<span>${muscle}</span>
			<span class="progress-muscle-value">${Math.round(percent)}%</span>
		`;
		legend.appendChild(li);
	});

	// DOM-based center label for crisp text
	const centerLabel = document.getElementById('progress-muscle-center');
	if (centerLabel) {
		centerLabel.innerHTML = `
			<div class="label">Total Sets</div>
			<div class="value">${total}</div>
		`;
	}
}

let exerciseInsightsCache = null;

function updateExerciseInsightsOptions(workouts) {
	const datalist = document.getElementById('progress-pr-options');

	const map = {};
	workouts.forEach(w => {
		(w.exercises || []).forEach(ex => {
			const name = ex.display || ex.key;
			if (!name) return;
			const key = name.toLowerCase();
			if (!map[key]) {
				map[key] = { name, workouts: [] };
			}
			map[key].workouts.push(w);
		});
	});
	exerciseInsightsCache = map;

	// Datalist is optional now; only populate if present
	if (datalist) {
		datalist.innerHTML = '';
		Object.values(map).forEach(entry => {
			const opt = document.createElement('option');
			opt.value = entry.name;
			datalist.appendChild(opt);
			});
		}
	}

function handleExerciseInsightsSubmit() {
	const input = document.getElementById('progress-pr-input');
	if (!input || !exerciseInsightsCache) return;

	const name = input.value.trim();
	if (!name) return;

	handleExerciseInsightsForName(name);
}

function handleExerciseInsightsForName(name) {
	const results = document.getElementById('progress-pr-results');
	if (!results || !exerciseInsightsCache) return;

	const query = name.trim().toLowerCase();
	if (!query) return;

	const entry = exerciseInsightsCache[query];
	if (!entry) {
		results.innerHTML = '<div class="progress-pr-empty">No data for this exercise yet.</div>';
		return;
	}

	// Find the exercise object to check if it's bodyweight
	let exerciseObj = null;
	for (const w of entry.workouts) {
		for (const ex of (w.exercises || [])) {
			const name = ex.display || ex.key;
			if (name && name.toLowerCase() === entry.name.toLowerCase()) {
				exerciseObj = ex;
				break;
			}
		}
		if (exerciseObj) break;
	}

	const isBodyweight = exerciseObj ? isBodyweightExercise(exerciseObj) : false;

	const allSets = [];
	entry.workouts.forEach(w => {
		const date = new Date(w.date || Date.now());
		(w.exercises || []).forEach(ex => {
			const name = ex.display || ex.key;
			if (!name || name.toLowerCase() !== entry.name.toLowerCase()) return;
			(ex.sets || []).forEach(set => {
				allSets.push({
					date,
					weight: set.weight || 0,
					reps: set.reps || 0
				});
			});
		});
	});

	if (!allSets.length) {
		results.innerHTML = '<div class="progress-pr-empty">No sets logged yet for this exercise.</div>';
		return;
	}

	allSets.sort((a, b) => a.date - b.date);

	if (isBodyweight) {
		// For bodyweight exercises, find the set with most reps
		let bestRepsSet = null;
		allSets.forEach(s => {
			if (!bestRepsSet || s.reps > bestRepsSet.reps) {
				bestRepsSet = s;
			}
		});

		results.innerHTML = `
			<div class="progress-pr-result">
				<div class="progress-pr-result-title">Top reps set</div>
				<div class="progress-pr-result-meta">
					<span><strong>${entry.name}</strong></span>
					<span>${bestRepsSet.reps} reps</span>
				</div>
			</div>
		`;
	} else {
		// Find best sets for weighted exercises
		let bestWeightSet = null;
		let bestVolumeSet = null;
		allSets.forEach(s => {
			const volume = (s.weight || 0) * (s.reps || 0);
			if (!bestWeightSet || s.weight > bestWeightSet.weight) {
				bestWeightSet = { ...s, volume };
			}
			if (!bestVolumeSet || volume > bestVolumeSet.volume) {
				bestVolumeSet = { ...s, volume };
			}
		});

		results.innerHTML = `
			<div class="progress-pr-result">
				<div class="progress-pr-result-title">Top weight set</div>
				<div class="progress-pr-result-meta">
					<span><strong>${entry.name}</strong></span>
					<span>${bestWeightSet.weight} kg × ${bestWeightSet.reps}</span>
				</div>
			</div>
			<div class="progress-pr-result">
				<div class="progress-pr-result-title">Top volume set</div>
				<div class="progress-pr-result-meta">
					<span><strong>${entry.name}</strong></span>
					<span>${bestVolumeSet.weight} kg × ${bestVolumeSet.reps} (${bestVolumeSet.volume} kg)</span>
				</div>
			</div>
		`;
	}

	// Chart removed for now – only cards shown
}

function renderPRTimeline(workouts) {
	const container = document.getElementById('progress-pr-timeline');
	if (!container) return;
	
	// Collect all sets from all workouts with exercise info and dates
	const allSets = [];
	workouts.forEach(workout => {
		if (!workout.exercises || !workout.date) return;
		const workoutDate = new Date(workout.date);
		workout.exercises.forEach(exercise => {
			if (!exercise.sets || !exercise.key) return;
			exercise.sets.forEach(set => {
				const weight = parseFloat(set.weight) || 0;
				const reps = parseInt(set.reps) || 0;
				if (weight > 0 && reps > 0) {
					allSets.push({
						exerciseKey: exercise.key,
						exerciseDisplay: exercise.display || exercise.key,
						weight,
						reps,
						volume: weight * reps,
						date: workoutDate,
						workoutId: workout.id
					});
				}
			});
		});
	});
	
	if (allSets.length === 0) {
		container.innerHTML = '<div class="progress-pr-empty">No personal records yet. Complete workouts to see your PRs!</div>';
		return;
	}
	
	// Group by exercise and find PRs (best weight × reps for each exercise)
	const prsByExercise = {};
	allSets.forEach(set => {
		const key = set.exerciseKey;
		if (!prsByExercise[key]) {
			prsByExercise[key] = {
				display: set.exerciseDisplay,
				bestWeight: set.weight,
				bestReps: set.reps,
				bestVolume: set.volume,
				date: set.date,
				workoutId: set.workoutId
			};
		} else {
			const current = prsByExercise[key];
			// PR is best weight (not volume)
			if (set.weight > current.bestWeight) {
				current.bestWeight = set.weight;
				current.bestReps = set.reps;
				current.bestVolume = set.volume;
				current.date = set.date;
				current.workoutId = set.workoutId;
			} else if (set.weight === current.bestWeight && set.reps > current.bestReps) {
				// If same weight, prefer higher reps
				current.bestWeight = set.weight;
				current.bestReps = set.reps;
				current.bestVolume = set.volume;
				current.date = set.date;
				current.workoutId = set.workoutId;
			}
		}
	});
	
	// Convert to array and sort by date (newest first)
	const prs = Object.values(prsByExercise)
		.sort((a, b) => b.date - a.date)
		.slice(0, 10); // Show top 10 most recent PRs
	
	if (prs.length === 0) {
		container.innerHTML = '<div class="progress-pr-empty">No personal records yet. Complete workouts to see your PRs!</div>';
		return;
	}
	
	container.innerHTML = prs.map(pr => {
		const dateStr = pr.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		return `
			<div class="progress-pr-timeline-item">
				<div class="progress-pr-timeline-date">${dateStr}</div>
				<div class="progress-pr-timeline-content">
					<div class="progress-pr-timeline-exercise">${pr.display}</div>
					<div class="progress-pr-timeline-value">${pr.bestWeight} kg × ${pr.bestReps} reps</div>
				</div>
			</div>
		`;
	}).join('');
}

function renderProgressiveOverloadTracker(workouts) {
	const container = document.getElementById('progress-overload-tracker');
	if (!container) return;
	
	// Collect best set per workout per exercise
	const exerciseData = {};
	workouts.forEach(workout => {
		if (!workout.exercises || !workout.date) return;
		const workoutDate = new Date(workout.date);
		workout.exercises.forEach(exercise => {
			if (!exercise.sets || !exercise.key) return;
			const key = exercise.key;
			if (!exerciseData[key]) {
				exerciseData[key] = {
					display: exercise.display || exercise.key,
					bestSetsPerWorkout: []
				};
			}
			
			// Find the best set in this workout for this exercise
			let bestSet = null;
			let bestVolume = 0;
			exercise.sets.forEach(set => {
				const weight = parseFloat(set.weight) || 0;
				const reps = parseInt(set.reps) || 0;
				if (weight > 0 && reps > 0) {
					const volume = weight * reps;
					if (volume > bestVolume) {
						bestVolume = volume;
						bestSet = {
							weight,
							reps,
							volume,
							date: workoutDate,
							workoutId: workout.id
						};
					}
				}
			});
			
			// Only add if we found a valid set
			if (bestSet) {
				exerciseData[key].bestSetsPerWorkout.push(bestSet);
			}
		});
	});
	
	// Filter exercises with at least 2 workouts
	const exercisesWithData = Object.entries(exerciseData)
		.filter(([_, data]) => data.bestSetsPerWorkout.length >= 2)
		.map(([key, data]) => ({
			key,
			display: data.display,
			bestSetsPerWorkout: data.bestSetsPerWorkout.sort((a, b) => a.date - b.date)
		}));
	
	if (exercisesWithData.length === 0) {
		container.innerHTML = '<div class="progress-pr-empty">Complete more workouts to track your progress.</div>';
		return;
	}
	
	// Analyze trend for each exercise - compare best sets from different workouts
	const trends = exercisesWithData.map(ex => {
		const bestSets = ex.bestSetsPerWorkout;
		const workoutCount = bestSets.length;
		const recentCount = Math.min(3, Math.floor(workoutCount / 2));
		const oldCount = Math.min(3, Math.floor(workoutCount / 2));
		
		// Get best sets from recent workouts vs old workouts
		const recentWorkouts = bestSets.slice(-recentCount);
		const oldWorkouts = bestSets.slice(0, oldCount);
		
		// Calculate average of best sets from each period
		const recentAvgVolume = recentWorkouts.reduce((sum, s) => sum + s.volume, 0) / recentWorkouts.length;
		const oldAvgVolume = oldWorkouts.reduce((sum, s) => sum + s.volume, 0) / oldWorkouts.length;
		
		// Get best set from each period for display
		const recentBestSet = recentWorkouts.reduce((best, s) => s.volume > best.volume ? s : best, recentWorkouts[0]);
		const oldBestSet = oldWorkouts.reduce((best, s) => s.volume > best.volume ? s : best, oldWorkouts[0]);
		
		const changePercent = oldAvgVolume > 0 ? ((recentAvgVolume - oldAvgVolume) / oldAvgVolume) * 100 : 0;
		
		let status = 'plateau';
		let statusClass = 'plateau';
		let statusText = 'Stable';
		if (changePercent > 5) {
			status = 'improving';
			statusClass = 'improving';
			statusText = 'Improving';
		} else if (changePercent < -5) {
			status = 'declining';
			statusClass = 'declining';
			statusText = 'Declining';
		}
		
		return {
			key: ex.key,
			display: ex.display,
			status,
			statusClass,
			statusText,
			changePercent: Math.abs(changePercent).toFixed(1),
			recentBest: `${recentBestSet.weight}kg × ${recentBestSet.reps}`,
			oldBest: `${oldBestSet.weight}kg × ${oldBestSet.reps}`,
			workoutCount: workoutCount
		};
	});
	
	// Sort: improving first, then plateau, then declining
	trends.sort((a, b) => {
		const order = { improving: 0, plateau: 1, declining: 2 };
		return order[a.status] - order[b.status];
	});
	
	container.innerHTML = trends.map(trend => {
		const statusIcon = trend.status === 'improving' ? '↑' : trend.status === 'declining' ? '↓' : '→';
		return `
			<div class="progress-overload-item ${trend.statusClass}">
				<div class="progress-overload-exercise">
					<span class="progress-overload-status-icon">${statusIcon}</span>
					<div class="progress-overload-name-wrapper">
						<span class="progress-overload-name">${trend.display}</span>
						<span class="progress-overload-sets">${trend.oldBest} → ${trend.recentBest}</span>
					</div>
				</div>
				<div class="progress-overload-info">
					<span class="progress-overload-change">${trend.changePercent}% ${trend.status === 'improving' ? '↑' : trend.status === 'declining' ? '↓' : ''}</span>
				</div>
			</div>
		`;
	}).join('');
}

// ======================
// 🚪 LOGOUT
// ======================
function initLogout() {
	const btn = document.getElementById('logout-btn');
	if (!btn) return;
	
	btn.addEventListener('click', async () => {
			if (confirm('Are you sure you want to log out?')) {
			await logout();
			}
		});
	}

// ========== SETTINGS ==========
function initSettings() {
	initLogout(); // Initialize logout button
}

async function loadSettings() {
	// Load user info from Supabase
	try {
		const user = await getUser();
		if (user) {
				const usernameEl = document.getElementById('settings-username');
				const emailEl = document.getElementById('settings-email');
			if (usernameEl) usernameEl.textContent = user.user_metadata?.username || user.email?.split('@')[0] || '—';
			if (emailEl) emailEl.textContent = user.email || '—';
			}
	} catch (e) {
		console.error('Failed to load settings:', e);
	}
}

// ========== VISION CHAT ==========
function initVision() {
	const sendBtn = document.getElementById('vision-send-btn');
	const input = document.getElementById('vision-input');
	const messagesContainer = document.getElementById('vision-chat-messages');
	const exampleButtons = document.querySelectorAll('.vision-example-btn');

	if (exampleButtons.length && input) {
		exampleButtons.forEach(btn => {
			btn.addEventListener('click', () => {
				const text = btn.dataset.example || btn.textContent.trim();
				input.value = text;
				input.focus();
			});
		});
	}
	
	if (sendBtn && input) {
		const sendMessage = async () => {
			const message = input.value.trim();
			if (!message) return;
			
			// Add user message
			addChatMessage(message, 'user');
			input.value = '';
			sendBtn.disabled = true;
			
			// Show immediate acknowledgment - instant response
			const loadingMessageId = addChatMessage('I\'m creating your workout...', 'bot', false);
			const loadingElement = document.querySelector(`[data-message-id="${loadingMessageId}"]`);
			
			try {
				// Include current workout context if in workout builder
				const workoutContext = currentTab === 'workout-builder' && currentWorkout 
					? {
						name: currentWorkout.name,
						exercises: currentWorkout.exercises.map(ex => ({
							key: ex.key,
							display: ex.display || ex.key
						}))
					}
					: null;
				
				// Simple check: is this a workout request? (only basic keywords, no muscle group matching)
				const msgLower = message.toLowerCase();
				const workoutKeywords = ["workout", "make", "create", "maak", "train", "oefeningen", "exercises"];
				const isWorkoutRequest = workoutKeywords.some(keyword => msgLower.includes(keyword));
				
				if (isWorkoutRequest) {
					// Send to Groq API - let Groq determine the workout based on the prompt
					const apiUrl = getApiUrl('/api/vision-workout');
					const requestPromise = fetch(apiUrl, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ 
							message,
							workoutContext: workoutContext
						})
					});
					
					// Update message while waiting
					let dotCount = 0;
					const updateInterval = setInterval(() => {
						if (loadingElement) {
							const contentEl = loadingElement.querySelector('.vision-message-content');
							if (contentEl) {
								dotCount = (dotCount % 3) + 1;
								contentEl.textContent = 'I\'m generating your workout' + '.'.repeat(dotCount);
							}
						}
					}, 300);
					
					try {
						const res = await requestPromise;
						clearInterval(updateInterval);
						
						if (!res.ok) {
							const errorData = await res.json().catch(() => ({ error: 'Failed to generate workout' }));
							if (loadingElement) loadingElement.remove();
							addChatMessage(`Error: ${errorData.error || 'Failed to generate workout'}`, 'bot');
							sendBtn.disabled = false;
							return;
						}
						
						const data = await res.json();
						if (data.error) {
							if (loadingElement) loadingElement.remove();
							addChatMessage(`Error: ${data.error}`, 'bot');
							sendBtn.disabled = false;
							return;
						}
						
						if (data.workout && data.workout.exercises && data.workout.exercises.length > 0) {
							// Successfully generated workout - apply it and switch to workout builder
							if (loadingElement) loadingElement.remove();
							applyWorkoutFromVision(data.workout);
							switchTab('workout-builder');
							addChatMessage(`✓ Created "${data.workout.name}" with ${data.workout.exercises.length} exercises!`, 'bot');
						} else {
							if (loadingElement) loadingElement.remove();
							addChatMessage('No workout was generated. Please try again with a clearer request.', 'bot');
						}
						sendBtn.disabled = false;
					} catch (fetchError) {
						clearInterval(updateInterval);
						if (loadingElement) loadingElement.remove();
						console.error('Workout request failed:', fetchError);
						addChatMessage(`Error: ${fetchError.message || 'Failed to generate workout. Please try again.'}`, 'bot');
						sendBtn.disabled = false;
					}
				} else {
					// Regular chat message - use the chat endpoint
					const apiUrl = getApiUrl('/chat');
					const res = await fetch(apiUrl, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ 
							message,
							workoutContext: workoutContext
						})
					});
					
					// Remove loading message
					if (loadingElement) {
						loadingElement.remove();
					}
					
					const data = await res.json();
					if (data.error) {
						addChatMessage(`Error: ${data.error}`, 'bot');
					} else if (data.workout) {
						// Chat endpoint returned a workout - use it!
						applyWorkoutFromVision(data.workout);
						switchTab('workout-builder');
						addChatMessage(`✓ Created "${data.workout.name}" with ${data.workout.exercises.length} exercises!`, 'bot');
					} else {
						addChatMessage(data.reply, 'bot');
					}
					sendBtn.disabled = false;
				}
			} catch (e) {
				console.error('Request failed:', e);
				// Remove loading message
				if (loadingElement) {
					loadingElement.remove();
				}
				addChatMessage('Failed to get response. Please try again.', 'bot');
			} finally {
				sendBtn.disabled = false;
			}
		};
		
		sendBtn.addEventListener('click', sendMessage);
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				sendMessage();
			}
		});
	}
}

function initExerciseVideoModal() {
	const modal = document.getElementById('exercise-video-modal');
	const frame = document.getElementById('exercise-video-frame');
	const closeBtn = document.getElementById('exercise-video-close');
	const backdrop = modal ? modal.querySelector('.video-modal-backdrop') : null;
	if (!modal || !frame) return;
	
	const closeModal = () => {
		modal.classList.add('hidden');
		document.body.classList.remove('modal-open');
		frame.src = '';
	};
	
	[closeBtn, backdrop].forEach(el => {
		if (el) el.addEventListener('click', closeModal);
	});
	
	document.addEventListener('click', async (e) => {
		const btn = e.target.closest('.exercise-info-btn');
		if (!btn) return;
		e.preventDefault();
		e.stopPropagation();
		
		// Find the exercise card container
		const exerciseCard = btn.closest('.workout-exercise, .workout-edit-exercise');
		if (!exerciseCard) return;
		
		// Ensure workout details are expanded in "Your Workouts" view
		const workoutDetails = exerciseCard.closest('.workout-details');
		if (workoutDetails && !workoutDetails.classList.contains('expanded')) {
			workoutDetails.classList.add('expanded');
		}
		
		// Check if video is already showing
		const existingVideo = exerciseCard.querySelector('.exercise-video-inline');
		if (existingVideo) {
			existingVideo.remove();
			return;
		}
		
		let videoUrl = btn.dataset.video;
		if (!videoUrl) {
			const exerciseKey = btn.dataset.exercise;
			if (!exerciseKey) return;
			btn.disabled = true;
			try {
				const data = await fetchExerciseInfoByKey(exerciseKey);
				if (data?.video) {
					videoUrl = data.video;
					btn.dataset.video = videoUrl;
				} else {
					alert('No video available for this exercise yet.');
					return;
				}
			} catch (error) {
				console.error('Failed to load exercise video:', error);
				alert('Could not load the exercise video. Please try again.');
				return;
			} finally {
				btn.disabled = false;
			}
		}
		
		// Create inline video container
		const videoContainer = document.createElement('div');
		videoContainer.className = 'exercise-video-inline';
		videoContainer.innerHTML = `
			<button class="exercise-video-inline-close" type="button" aria-label="Close video">✕</button>
			<div class="exercise-video-inline-frame">
				<iframe src="${escapeHtmlAttr(videoUrl)}" title="Exercise video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
			</div>
		`;
		
		// Insert after the header, before sets
		const setsContainer = exerciseCard.querySelector('.workout-edit-sets, .workout-view-sets');
		if (setsContainer) {
			exerciseCard.insertBefore(videoContainer, setsContainer);
		} else {
			exerciseCard.appendChild(videoContainer);
		}
		
		// Close button handler
		const closeBtn = videoContainer.querySelector('.exercise-video-inline-close');
		if (closeBtn) {
			closeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				videoContainer.remove();
			});
		}
	});
}

async function fetchExerciseInfoByKey(exerciseKey) {
	const body = JSON.stringify({ exercise: exerciseKey });
	const res = await fetch('/exercise-info', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch info for ${exerciseKey}`);
	}
	return res.json();
}

function addChatMessage(text, role, isLoading = false) {
	const messagesContainer = document.getElementById('vision-chat-messages');
	if (!messagesContainer) return null;
	
	const messageDiv = document.createElement('div');
	const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	messageDiv.setAttribute('data-message-id', messageId);
	messageDiv.className = `vision-message vision-message-${role}`;
	
	if (isLoading) {
		messageDiv.classList.add('vision-message-loading');
	}
	
	if (role === 'bot') {
		// Strip any trailing dots/ellipsis from text when loading
		const displayText = isLoading ? text.replace(/\.{1,3}\s*$/, '') : text;
		messageDiv.innerHTML = `
			<div class="vision-avatar">
				<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<circle cx="12" cy="12" r="10" stroke="var(--accent)" stroke-width="2" fill="rgba(124,92,255,0.1)"/>
					<circle cx="12" cy="12" r="4" fill="var(--accent)"/>
					<path d="M2 12s3-4 10-4 10 4 10 4" stroke="var(--accent)" stroke-width="2" fill="none" stroke-linecap="round"/>
				</svg>
			</div>
			<div class="vision-message-content">${displayText}${isLoading ? '<span class="loading-dots">...</span>' : ''}</div>
		`;
	} else {
		messageDiv.innerHTML = `
			<div class="vision-message-content">${text}</div>
		`;
	}
	
	messagesContainer.appendChild(messageDiv);
	messagesContainer.scrollTop = messagesContainer.scrollHeight;
	return messageId;
}

// ========== EXERCISE CARD ==========
function initExerciseCard() {
	const resultTitle = document.getElementById('result-title');
	const summaryCard = document.querySelector('.summary');
	
	if (resultTitle && summaryCard) {
		summaryCard.style.cursor = 'pointer';
		summaryCard.addEventListener('click', () => {
			if (resultTitle.textContent === 'Add an exercise') {
				openExerciseSelector();
			}
		});
	}
}

// ========== UTILITY FUNCTIONS ==========
async function loadExercises() {
	try {
		const apiUrl = getApiUrl('/exercises');
		const res = await fetch(apiUrl);
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}: ${res.statusText}`);
		}
		const data = await res.json();
		allExercises = data.exercises || [];
		console.log(`[DEBUG] Loaded ${allExercises.length} exercises`);
	} catch (e) {
		console.error('Failed to load exercises:', e);
		allExercises = []; // Set empty array on error
	}
}

function loadStreak() {
	const streak = parseInt(localStorage.getItem('streak') || '0');
	document.querySelectorAll('.streak-count').forEach(el => {
		if (el) el.textContent = streak;
	});
}

function updateStreak() {
	const today = new Date();
	const todayKey = today.toISOString().slice(0, 10); // YYYY-MM-DD
	
	const lastStreakDate = localStorage.getItem('lastStreakDate');
	const currentStreak = parseInt(localStorage.getItem('streak') || '0');
	
	// If no previous date or it's a new day, increment streak
	if (!lastStreakDate || lastStreakDate !== todayKey) {
		const newStreak = currentStreak + 1;
		localStorage.setItem('streak', newStreak.toString());
		localStorage.setItem('lastStreakDate', todayKey);
		loadStreak();
	}
}

function saveRecentScan(data) {
	const scans = JSON.parse(localStorage.getItem('recentScans') || '[]');
	scans.unshift({
		...data,
		timestamp: new Date().toISOString()
	});
	scans.splice(10); // Keep only last 10
	localStorage.setItem('recentScans', JSON.stringify(scans));
	loadRecentScans();
}

function loadRecentScans() {
	const scans = JSON.parse(localStorage.getItem('recentScans') || '[]');
	const list = document.getElementById('recent-scans-list');
	if (!list) return;
	
	list.innerHTML = '';
	// Show at most the 3 most recent scans
	scans.slice(0, 3).forEach(scan => {
		const item = document.createElement('div');
		item.className = 'scan-item';
		const date = new Date(scan.timestamp);
		const thumbSrc = scan._previewImage || scan.image || getExerciseImageSource(scan) || null;
		item.innerHTML = `
			${thumbSrc ? `<img src="${thumbSrc}" alt="${scan.display || 'Scan'}" />` : ''}
			<div class="scan-item-info">
				<div class="scan-item-name">${scan.display || 'Unknown'}</div>
				<div class="scan-item-time">${date.toLocaleString()}</div>
			</div>
		`;
		item.onclick = () => {
			displayPrediction(scan);
		};
		list.appendChild(item);
	});
}

// AI Detect Error Modal
function showAIDetectErrorModal() {
	const modal = document.getElementById('ai-detect-error-modal');
	if (modal) {
		modal.classList.remove('hidden');
		const tryAgainBtn = document.getElementById('ai-detect-error-try-again');
		const backdrop = modal.querySelector('.ai-detect-error-backdrop');
		
		const closeModal = () => {
			modal.classList.add('hidden');
		};
		
		if (tryAgainBtn) {
			tryAgainBtn.onclick = closeModal;
		}
		if (backdrop) {
			backdrop.onclick = closeModal;
		}
	}
}

// AI Detect Chat Modal
function openAIDetectChat() {
	const selector = document.getElementById('exercise-selector');
	const modal = document.getElementById('ai-detect-chat-modal');
	if (!modal) return;
	
	modal.classList.remove('hidden');
	document.body.classList.add('ai-detect-chat-open');
	
	// Clear previous messages except the initial bot message
	const messagesContainer = document.getElementById('ai-detect-chat-messages');
	if (messagesContainer) {
		messagesContainer.innerHTML = `
			<div class="ai-detect-chat-message ai-detect-chat-message-bot">
				<div class="ai-detect-chat-avatar">🤖</div>
				<div class="ai-detect-chat-text">Hoi! Stuur een foto van een oefening en ik vertel je welke oefening het is! 📸</div>
			</div>
		`;
	}
	
	// Setup file input
	const fileInput = document.getElementById('ai-detect-chat-file');
	if (fileInput) {
		fileInput.onchange = async (e) => {
			const file = e.target.files[0];
			if (!file) return;
			
			// Show user message with image preview
			addAIDetectChatMessage('user', 'Welke oefening is dit?', file);
			
			// Show loading message
			const loadingId = addAIDetectChatMessage('bot', 'Even nadenken...', null, true);
			
			try {
				// Send to backend
				const formData = new FormData();
				formData.append('image', file);
				formData.append('message', 'Welke oefening is dit?');
				const apiUrl = getApiUrl('/api/vision-detect');
				const res = await fetch(apiUrl, {
					method: 'POST',
					body: formData
				});
				
				const data = await res.json();
				console.log('AI detect response:', data);
				
				// Remove loading message
				const loadingEl = document.querySelector(`[data-message-id="${loadingId}"]`);
				if (loadingEl) loadingEl.remove();
				
				// ALWAYS show something - even if it's an error, show it in the chat
				if (data.success && data.message) {
					// Show AI chat response
					addAIDetectChatMessage('bot', data.message, null);
				} else {
					// Error from backend - show in chat, don't show error modal
					const errorMsg = data.error || 'Er ging iets mis. Probeer het opnieuw.';
					addAIDetectChatMessage('bot', `Sorry, ${errorMsg.toLowerCase()}`, null);
				}
			} catch (e) {
				// Remove loading message
				const loadingEl = document.querySelector(`[data-message-id="${loadingId}"]`);
				if (loadingEl) loadingEl.remove();
				
				console.error('AI detect failed:', e);
				addAIDetectChatMessage('bot', 'Sorry, er ging iets mis. Probeer het opnieuw.', null);
			}
			
			// Reset file input
			fileInput.value = '';
		};
	}
	
	// Setup close button
	const closeBtn = document.getElementById('ai-detect-chat-close');
	const backdrop = modal.querySelector('.ai-detect-chat-backdrop');
	
	const closeModal = () => {
		closeAIDetectChat();
	};
	
	if (closeBtn) {
		closeBtn.onclick = closeModal;
	}
	if (backdrop) {
		backdrop.onclick = closeModal;
	}
}

function closeAIDetectChat() {
	const modal = document.getElementById('ai-detect-chat-modal');
	if (modal) {
		modal.classList.add('hidden');
		document.body.classList.remove('ai-detect-chat-open');
	}
}

function addAIDetectChatMessage(role, text, file, isLoading = false) {
	const messagesContainer = document.getElementById('ai-detect-chat-messages');
	if (!messagesContainer) return null;
	
	const messageId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
	const messageDiv = document.createElement('div');
	messageDiv.className = `ai-detect-chat-message ai-detect-chat-message-${role}`;
	messageDiv.setAttribute('data-message-id', messageId);
	
	if (role === 'user' && file) {
		// User message with image
		const reader = new FileReader();
		reader.onload = (e) => {
			messageDiv.innerHTML = `
				<div class="ai-detect-chat-avatar">👤</div>
				<div class="ai-detect-chat-content">
					<img src="${e.target.result}" alt="Uploaded photo" class="ai-detect-chat-image" />
				</div>
			`;
		};
		reader.readAsDataURL(file);
	} else if (role === 'bot') {
		// Bot message - convert markdown ** to bold
		const formattedText = text ? text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') : '';
		messageDiv.innerHTML = `
			<div class="ai-detect-chat-avatar">🤖</div>
			<div class="ai-detect-chat-text">${isLoading ? '<span class="ai-detect-chat-loading">' + formattedText + '</span>' : formattedText}</div>
		`;
	}
	
	messagesContainer.appendChild(messageDiv);
	messagesContainer.scrollTop = messagesContainer.scrollHeight;
	
	return messageId;
}

// Make exercise selector accessible from workout builder
window.openExerciseSelector = openExerciseSelector;
window.addExerciseToWorkout = addExerciseToWorkout;

