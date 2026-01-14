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
let isSavingWorkout = false; // Prevent duplicate saves
let workoutTimer = null;
let workoutStartTime = null;
const WORKOUT_DRAFT_KEY = 'currentWorkoutDraft';
const DEFAULT_SET_COUNT = 3;

// Track if exercise selector is already initialized to prevent duplicate initialization
let exerciseSelectorInitialized = false;

// ========== WEIGHT UNIT CONVERSION ==========
function getWeightUnit() {
	// Default to 'kg' for new users, but check if value exists first
	const saved = localStorage.getItem('settings-weight-unit');
	if (saved === null || saved === undefined) {
		// No value set yet - default to 'kg' for new accounts
		return 'kg';
	}
	return saved;
}

function isKg() {
	return getWeightUnit() === 'kg';
}

function isLbs() {
	return getWeightUnit() === 'lbs';
}

// Convert kg to lbs (for display/input)
function kgToLbs(kg) {
	if (kg == null || kg === '') return '';
	return (Number(kg) * 2.20462).toFixed(1);
}

// Convert lbs to kg (for storage)
function lbsToKg(lbs) {
	if (lbs == null || lbs === '') return '';
	return (Number(lbs) / 2.20462).toFixed(1);
}

// Convert weight for display based on current unit
function convertWeightForDisplay(weightKg) {
	if (weightKg == null || weightKg === '') return '';
	const weight = Number(weightKg);
	if (isLbs()) {
		return kgToLbs(weight); // Returns with 1 decimal (e.g., "10.0")
	}
	return Math.round(weight).toString(); // kg: no decimals (e.g., "10")
}

// Convert weight for storage (always store as kg)
function convertWeightForStorage(weight, currentUnit) {
	if (weight == null || weight === '') return '';
	if (currentUnit === 'lbs') {
		return Number(lbsToKg(weight));
	}
	return Number(weight);
}

// Get weight unit label
function getWeightUnitLabel() {
	return isKg() ? 'Kg' : 'Lbs';
}

function createDefaultSets(count = DEFAULT_SET_COUNT, isCardio = false) {
	if (isCardio) {
		// Cardio: always just 1 set with min, sec, km, cal, notes
		return [{ min: '', sec: '', km: '', cal: '', notes: '' }];
	}
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
	// Check if custom exercise with bodyweight type
	if (exercise.isCustom && exercise.exerciseType === 'bodyweight') {
		return true;
	}
	
	const key = (exercise.key || '').toLowerCase();
	const display = (exercise.display || '').toLowerCase();
	
	// Weighted exercises are NOT bodyweight
	if (key.includes('weighted') || display.includes('weighted')) {
		return false;
	}
	
	const bodyweightKeys = [
		'push_up', 'pull_up', 'chin_up', 'dips', 'diamond_push_up',
		'crunch', 'decline_sit_up', 'hanging_leg_raise', 'knee_raise'
	];
	return bodyweightKeys.includes(key) || 
	       display.includes('push-up') || display.includes('pull-up') || 
	       display.includes('chin-up') || (display.includes('dip') && !display.includes('machine')) ||
	       (display.includes('crunch') && !display.includes('cable')) || display.includes('sit-up') || 
	       display.includes('leg raise') || display.includes('knee raise');
}

function isCardioExercise(exercise) {
	// Check if custom exercise with Cardio muscle group
	if (exercise.muscles && Array.isArray(exercise.muscles)) {
		const musclesLower = exercise.muscles.map(m => (m || '').toLowerCase());
		if (musclesLower.includes('cardio')) {
			return true;
		}
	}
	
	const key = (exercise.key || '').toLowerCase();
	const display = (exercise.display || '').toLowerCase();
	
	const cardioKeys = [
		'running', 'walking', 'stairmaster', 'rowing_machine', 
		'hometrainer', 'elliptical_machine'
	];
	return cardioKeys.includes(key) || 
	       display.toLowerCase().includes('running') || 
	       display.toLowerCase().includes('walking') ||
	       display.toLowerCase().includes('stairmaster') ||
	       display.toLowerCase().includes('rowing') ||
	       display.toLowerCase().includes('hometrainer') ||
	       display.toLowerCase().includes('elliptical');
}

// Helper function to fetch user from backend with Authorization header
async function getUserCredits() {
	/**Get user credits from backend.*/
	try {
		const session = await supabaseClient.auth.getSession();
		if (!session.data.session) {
			return { credits_remaining: 10, last_reset_month: null };
		}
		
		const apiUrl = getApiUrl('/api/user-credits');
		const res = await fetch(apiUrl, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${session.data.session.access_token}`
			}
		});
		
		if (res.ok) {
			const data = await res.json();
			return {
				credits_remaining: data.credits_remaining || 10,
				last_reset_month: data.last_reset_month
			};
		}
	} catch (e) {
		console.error('[CREDITS] Error fetching credits:', e);
	}
	return { credits_remaining: 10, last_reset_month: null };
}

// Update AI detect buttons based on credits
async function updateAIDetectButtons() {
	/**Disable AI detect buttons if user has no credits.*/
	try {
		const creditsInfo = await getUserCredits();
		const aiDetectBtn = document.getElementById('exercise-selector-ai-detect');
		const aiDetectChatFile = document.getElementById('ai-detect-chat-file');
		const aiDetectChatFileLabel = document.querySelector('.ai-detect-chat-file-label');
		const fileInput = document.getElementById('exercise-selector-file');
		
		const hasNoCredits = creditsInfo.credits_remaining <= 0;
		
		// Disable/enable main AI detect button
		if (aiDetectBtn) {
			aiDetectBtn.disabled = hasNoCredits;
			if (hasNoCredits) {
				aiDetectBtn.style.opacity = '0.5';
				aiDetectBtn.style.cursor = 'not-allowed';
				aiDetectBtn.style.pointerEvents = 'none';
			} else {
				aiDetectBtn.style.opacity = '1';
				aiDetectBtn.style.cursor = 'pointer';
				aiDetectBtn.style.pointerEvents = 'auto';
			}
		}
		
		// Disable/enable file input for AI detect
		if (fileInput) {
			fileInput.disabled = hasNoCredits;
		}
		
		// Disable/enable AI detect chat file input
		if (aiDetectChatFile) {
			aiDetectChatFile.disabled = hasNoCredits;
		}
		if (aiDetectChatFileLabel) {
			if (hasNoCredits) {
				aiDetectChatFileLabel.style.opacity = '0.5';
				aiDetectChatFileLabel.style.cursor = 'not-allowed';
			} else {
				aiDetectChatFileLabel.style.opacity = '1';
				aiDetectChatFileLabel.style.cursor = 'pointer';
			}
		}
	} catch (e) {
		console.error('[CREDITS] Error updating AI detect buttons:', e);
	}
}

function showCreditsMessage(creditsRemaining) {
	/**Show credits message briefly during AI detect.*/
	const message = `${creditsRemaining} credit${creditsRemaining !== 1 ? 's' : ''} left this month`;
	
	// Create or update credits display
	let creditsDisplay = document.getElementById('ai-credits-display');
	if (!creditsDisplay) {
		creditsDisplay = document.createElement('div');
		creditsDisplay.id = 'ai-credits-display';
		creditsDisplay.style.cssText = `
			position: fixed;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			background: rgba(0, 0, 0, 0.9);
			color: white;
			padding: 16px 24px;
			border-radius: 12px;
			font-size: 16px;
			font-weight: 600;
			z-index: 10000;
			transition: opacity 0.3s;
			box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
		`;
		document.body.appendChild(creditsDisplay);
	}
	
	creditsDisplay.textContent = message;
	creditsDisplay.style.opacity = '1';
	
	// Hide after 3 seconds
	setTimeout(() => {
		if (creditsDisplay) {
			creditsDisplay.style.opacity = '0';
			setTimeout(() => {
				if (creditsDisplay && creditsDisplay.parentNode) {
					creditsDisplay.parentNode.removeChild(creditsDisplay);
				}
			}, 300);
		}
	}, 3000);
}

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
// ========== WEBVIEW FOCUS & TOUCH FIX ==========
// Force WebView to receive touch events (iOS/Capacitor fix)
function forceWebViewFocus() {
	console.log('[FOCUS] Forcing WebView focus...');
	
	// Force focus on body/document
	if (document.body) {
		document.body.focus();
		document.body.click(); // Trigger focus
	}
	
	// Force window focus
	window.focus();
	
	// Remove any blocking overlays
	const blockingOverlays = document.querySelectorAll('[style*="pointer-events: none"], [style*="pointer-events:none"]');
	blockingOverlays.forEach(el => {
		el.style.pointerEvents = 'auto';
		console.log('[FOCUS] Removed blocking overlay:', el);
	});
	
	// Ensure all interactive elements are touchable
	const interactiveElements = document.querySelectorAll('button, a, input, select, textarea, [onclick]');
	interactiveElements.forEach(el => {
		el.style.touchAction = 'manipulation';
		el.style.webkitTouchCallout = 'none';
		el.style.webkitUserSelect = 'none';
		el.style.userSelect = 'none';
	});
	
	console.log('[FOCUS] WebView focus forced, interactive elements:', interactiveElements.length);
}

// Re-initialize all button listeners (safety net)
function reinitializeButtonListeners() {
	console.log('[BTNS] Re-initializing button listeners...');
	
	// Re-init workout buttons
	const aiWorkoutBtn = document.getElementById('ai-workout-btn');
	const manualWorkoutBtn = document.getElementById('manual-workout-btn');
	
	if (aiWorkoutBtn) {
		// Remove old listeners and add new
		const newBtn = aiWorkoutBtn.cloneNode(true);
		aiWorkoutBtn.parentNode.replaceChild(newBtn, aiWorkoutBtn);
		newBtn.addEventListener('click', () => {
			console.log('[BTNS] AI Workout button clicked');
			startAIWorkout();
		});
		newBtn.addEventListener('touchend', (e) => {
			e.preventDefault();
			console.log('[BTNS] AI Workout button touched');
			startAIWorkout();
		});
	}
	
	if (manualWorkoutBtn) {
		const newBtn = manualWorkoutBtn.cloneNode(true);
		manualWorkoutBtn.parentNode.replaceChild(newBtn, manualWorkoutBtn);
		newBtn.addEventListener('click', () => {
			console.log('[BTNS] Manual Workout button clicked');
			startNewWorkout();
		});
		newBtn.addEventListener('touchend', (e) => {
			e.preventDefault();
			console.log('[BTNS] Manual Workout button touched');
			startNewWorkout();
		});
	}
	
	// Re-init navigation
	const navButtons = document.querySelectorAll('.nav-btn');
	navButtons.forEach(btn => {
		const tab = btn.dataset.tab;
		if (tab) {
			btn.addEventListener('click', () => {
				console.log('[BTNS] Nav button clicked:', tab);
				switchTab(tab);
			});
			btn.addEventListener('touchend', (e) => {
				e.preventDefault();
				console.log('[BTNS] Nav button touched:', tab);
				switchTab(tab);
			});
		}
	});
	
	console.log('[BTNS] Button listeners re-initialized');
}

document.addEventListener('DOMContentLoaded', async () => {
	try {
		console.log('[INIT] Starting app initialization...');
		console.log('[INIT] Platform:', window.Capacitor?.isNativePlatform() ? 'NATIVE' : 'WEB');
		
		// Hide loading overlay after a short delay to prevent flash
		const loadingOverlay = document.getElementById('app-loading-overlay');
		const hideLoadingOverlay = () => {
			if (loadingOverlay) {
				setTimeout(() => {
					loadingOverlay.style.display = 'none';
				}, 100);
			}
		};
		
		// Wait for Capacitor to be ready (if in native app)
		if (window.Capacitor && window.Capacitor.isNativePlatform()) {
			console.log('[INIT] Waiting for Capacitor to be ready...');
			await new Promise(resolve => setTimeout(resolve, 200));
		}
		
		// IMMEDIATE: Force WebView focus (iOS fix)
		forceWebViewFocus();
		
		// Initialize Supabase
		await initSupabase();
		console.log('[INIT] Supabase initialized:', !!supabaseClient);
	
		// Check session FIRST - simple and reliable
		let hasSession = false;
		try {
		if (supabaseClient) {
				const { data: { session }, error } = await supabaseClient.auth.getSession();
				hasSession = !!(session && !error);
				console.log('[INIT] Session check result:', hasSession ? 'FOUND' : 'NOT FOUND');
			} else {
				console.log('[INIT] No Supabase client available');
			}
		} catch (e) {
			console.error('[INIT] Session check error:', e);
			hasSession = false;
		}
		
		// If no session, show login screen and stop
		if (!hasSession) {
			console.log('[INIT] No session - showing login screen');
			showLoginScreen();
			hideLoadingOverlay();
		return;
	}
	
		// Session exists - initialize app
		console.log('[INIT] Session found - initializing app...');
	
		// Init app features
		initLogout();
	initNavigation();
	initTabs();
	initFileUpload();
	initManualInput();
	initExerciseSelector();
	initWorkoutBuilder();
	initProgress();
	initSettings();
	
	// Update AI detect buttons based on credits
	updateAIDetectButtons();
		initRestTimer();
	initVision();
		initExerciseVideoModal();
	initExerciseCard();
		
		// Load data
		try {
	loadStreak();
	loadRecentScans();
			await loadExercises();
			await loadWorkouts();
	updateWorkoutStartButton();
		} catch (e) {
			console.error('[INIT] Error loading data:', e);
		}
		
		// Show workouts tab
		try {
			await switchTab('workouts');
		} catch (e) {
			console.error('[INIT] Error switching to workouts:', e);
		}
		
		// Hide loading overlay now that everything is loaded
		hideLoadingOverlay();
		
		// Schedule notifications (don't block on errors)
		try {
			await scheduleDailyNotifications();
			await scheduleWeeklyNotifications();
		} catch (e) {
			console.error('[INIT] Error scheduling notifications:', e);
		}
		
		// AFTER INIT: Force focus again and re-init buttons (iOS safety net)
		setTimeout(() => {
			forceWebViewFocus();
			reinitializeButtonListeners();
		}, 500);
		
		// Also force focus on visibility change (app comes to foreground)
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden) {
				console.log('[FOCUS] App became visible - forcing focus');
				setTimeout(() => {
					forceWebViewFocus();
					reinitializeButtonListeners();
				}, 100);
				
				// Update rest timer display if it's running (timer continues automatically)
				if (restTimerRunning && restTimerStartTime) {
					// Timer will automatically update via setInterval, just ensure display is correct
					const elapsed = Math.floor((Date.now() - restTimerStartTime) / 1000);
					const remaining = Math.max(0, restTimerInitialSeconds - elapsed);
					restTimerSeconds = remaining;
					updateRestTimerDisplay();
					
					// Update button text if overlay is visible
					const overlay = document.getElementById('rest-timer-overlay');
					if (overlay && !overlay.classList.contains('hidden')) {
						const startBtn = document.getElementById('rest-timer-start');
						if (startBtn) startBtn.textContent = 'Pause';
					}
					
					// If timer finished while in background, show completion
					if (remaining === 0) {
						stopRestTimer();
						showRestTimerComplete();
					}
				}
			}
		});
		
		// Also on window focus (iOS specific)
		window.addEventListener('focus', () => {
			console.log('[FOCUS] Window focused - forcing focus');
			setTimeout(() => {
				forceWebViewFocus();
				reinitializeButtonListeners();
			}, 100);
		});
		
		console.log('[INIT] App initialization complete!');
		
		// AGGRESSIVE FIX: Force buttons to work immediately after a delay
		// This ensures buttons work even if event listeners fail
		setTimeout(() => {
			console.log('[FIX] Aggressive button fix - forcing direct handlers');
			const aiBtn = document.getElementById('ai-workout-btn');
			const manualBtn = document.getElementById('manual-workout-btn');
			
			if (aiBtn) {
				// Remove all existing listeners and add direct handler
				const newAiBtn = aiBtn.cloneNode(true);
				aiBtn.parentNode.replaceChild(newAiBtn, aiBtn);
				newAiBtn.onclick = function(e) {
					e.preventDefault();
					e.stopPropagation();
					console.log('[FIX] AI button clicked (direct handler)');
					if (window.startAIWorkout) {
						window.startAIWorkout();
					} else {
						console.error('[FIX] startAIWorkout not available!');
						alert('App not ready. Please wait...');
					}
					return false;
				};
				newAiBtn.ontouchstart = function(e) {
					e.preventDefault();
					e.stopPropagation();
					console.log('[FIX] AI button touched (direct handler)');
					if (window.startAIWorkout) {
						window.startAIWorkout();
					}
					return false;
				};
			}
			
			if (manualBtn) {
				const newManualBtn = manualBtn.cloneNode(true);
				manualBtn.parentNode.replaceChild(newManualBtn, manualBtn);
				newManualBtn.onclick = function(e) {
					e.preventDefault();
					e.stopPropagation();
					console.log('[FIX] Manual button clicked (direct handler)');
					if (window.startNewWorkout) {
						window.startNewWorkout();
					} else {
						console.error('[FIX] startNewWorkout not available!');
						alert('App not ready. Please wait...');
					}
					return false;
				};
				newManualBtn.ontouchstart = function(e) {
					e.preventDefault();
					e.stopPropagation();
					console.log('[FIX] Manual button touched (direct handler)');
					if (window.startNewWorkout) {
						window.startNewWorkout();
					}
					return false;
				};
			}
			
			// Also force focus one more time
			forceWebViewFocus();
			
			// AGGRESSIVE FIX: Fix ALL nav buttons
			console.log('[FIX] Fixing nav buttons...');
			const navButtons = document.querySelectorAll('.nav-btn');
			navButtons.forEach(btn => {
				const tab = btn.dataset.tab;
				if (tab) {
					const newBtn = btn.cloneNode(true);
					btn.parentNode.replaceChild(newBtn, btn);
					newBtn.onclick = function(e) {
						e.preventDefault();
						e.stopPropagation();
						console.log('[FIX] Nav button clicked (direct):', tab);
						if (window.switchTab) {
							window.switchTab(tab);
						} else {
							console.error('[FIX] switchTab not available!');
						}
						return false;
					};
					newBtn.ontouchstart = function(e) {
						e.preventDefault();
						e.stopPropagation();
						console.log('[FIX] Nav button touched (direct):', tab);
						if (window.switchTab) {
							window.switchTab(tab);
						}
						return false;
					};
				}
			});
			
			// AGGRESSIVE FIX: Fix ALL buttons in workout builder
			console.log('[FIX] Fixing workout builder buttons...');
			const saveWorkoutBtn = document.getElementById('save-workout');
			const backWorkoutBtn = document.getElementById('back-to-workouts');
			const addExerciseBtn = document.querySelector('.workout-add-exercise-btn');
			
			if (saveWorkoutBtn) {
				const newBtn = saveWorkoutBtn.cloneNode(true);
				saveWorkoutBtn.parentNode.replaceChild(newBtn, saveWorkoutBtn);
				newBtn.onclick = function(e) {
					e.preventDefault();
					e.stopPropagation();
					console.log('[FIX] Save workout clicked');
					if (window.saveWorkout && !isSavingWorkout) {
						window.saveWorkout();
					}
					return false;
				};
			}
			
			if (backWorkoutBtn) {
				const newBtn = backWorkoutBtn.cloneNode(true);
				backWorkoutBtn.parentNode.replaceChild(newBtn, backWorkoutBtn);
				newBtn.onclick = function(e) {
					e.preventDefault();
					e.stopPropagation();
					console.log('[FIX] Back to workouts clicked');
					if (window.switchTab) {
						window.switchTab('workouts');
					}
					return false;
				};
			}
		}, 1000);
		
	} catch (error) {
		console.error('[INIT] Fatal error during app initialization:', error);
		console.error('[INIT] Error stack:', error.stack);
		
		// Show user-friendly error message
		const errorMsg = document.createElement('div');
		errorMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#ff4444;color:white;padding:20px;border-radius:10px;z-index:9999;text-align:center;max-width:80%;';
		errorMsg.innerHTML = `
			<h3 style="margin:0 0 10px 0;">App Error</h3>
			<p style="margin:0 0 15px 0;">Er is een fout opgetreden. Check de console voor details.</p>
			<button onclick="location.reload()" style="background:white;color:#ff4444;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;">Herlaad App</button>
		`;
		document.body.appendChild(errorMsg);
	}
});

// ======================
// 🔑 LOGIN LOGIC
// ======================
function initLoginForm() {
	const form = document.getElementById('login-form');
	if (!form) return;
	
	// Initialize register link
	initRegisterLink();
	
	const errorEl = document.getElementById('login-error-message') || document.getElementById('error-message');
	const submitBtn = document.getElementById('login-submit-btn') || document.getElementById('submit-btn');
	
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		
		if (submitBtn) {
			submitBtn.disabled = true;
			submitBtn.textContent = 'Signing in...';
		}
		if (errorEl) errorEl.classList.remove('show');
		
		const email = document.getElementById('login-email')?.value || document.getElementById('email')?.value;
		const password = document.getElementById('login-password')?.value || document.getElementById('password')?.value;
		
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
			console.log('[LOGIN] Login successful, initializing app...');
			// Hide login content
			const loginContent = document.getElementById('login-content');
			if (loginContent) {
				loginContent.classList.add('hidden');
			}
			
			// Initialize app features
			initLogout();
			initNavigation();
			initTabs();
			initFileUpload();
			initManualInput();
			initExerciseSelector();
			initWorkoutBuilder();
			initProgress();
			initSettings();
	
	// Update AI detect buttons based on credits
	updateAIDetectButtons();
			initRestTimer();
			initVision();
			initExerciseVideoModal();
			initExerciseCard();
			loadStreak();
			loadRecentScans();
			await loadExercises();
			await migrateLocalStorageWorkouts(); // Migrate any local workouts to Supabase
			await loadWorkouts();
			updateWorkoutStartButton();
			
			// Show workouts tab
			switchTab('workouts');
			
			// Schedule notifications
			await scheduleDailyNotifications();
			await scheduleWeeklyNotifications();
		} else {
			console.error('[LOGIN] Session not found after login');
			if (errorEl) {
				errorEl.textContent = 'Login failed. Please try again.';
				errorEl.classList.add('show');
			}
			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.textContent = 'Sign In';
			}
		}
	});
}

// ======================
// 🆕 REGISTER LOGIC
// ======================
function initRegisterForm() {
	const form = document.getElementById('register-form');
	if (!form) return;
	
	// Initialize back to login link
	initBackToLoginLink();
	
	const errorEl = document.getElementById('register-error-message') || document.getElementById('error-message');
	const submitBtn = document.getElementById('register-submit-btn') || document.getElementById('submit-btn');
	
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		
		if (submitBtn) {
			submitBtn.disabled = true;
			submitBtn.textContent = 'Creating account...';
		}
		if (errorEl) errorEl.classList.remove('show');
		
		const email = document.getElementById('register-email')?.value;
		const password = document.getElementById('register-password')?.value;
		const username = document.getElementById('register-username')?.value; // Optional
		
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
		
		// Registration successful - set default settings for new account
		// Notifications: ON (and request permission)
		localStorage.setItem('settings-notifications', 'true');
		// Weight unit: kg
		localStorage.setItem('settings-weight-unit', 'kg');
		// Rest timer: OFF
		localStorage.setItem('settings-rest-timer', 'false');
		
		// Request notification permission immediately
		try {
			await requestNotificationPermission();
			// Schedule notifications
			await scheduleDailyNotifications();
			await scheduleWeeklyNotifications();
		} catch (e) {
			// Ignore permission errors for now
		}
		
		// Registration successful
		alert('Account created! Please log in.');
		showLoginScreen();
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
		console.log('[AUTH] Starting login check...');
		
		if (!supabaseClient) {
			console.log('[AUTH] Supabase client not initialized, initializing...');
			await initSupabase();
		}
		if (!supabaseClient) {
			console.error('[AUTH] Supabase client initialization failed');
			authCheckComplete = false;
			showLoginScreen();
			return false;
		}
		
		console.log('[AUTH] Getting session...');
		const { data: { session }, error } = await supabaseClient.auth.getSession();
		
		if (error) {
			console.error('[AUTH] Session check error:', error);
			authCheckComplete = false;
			showLoginScreen();
			return false;
		}
		
		if (!session) {
			console.log('[AUTH] No session found - redirecting to login');
			authCheckComplete = false;
			// Force redirect - use replace to prevent back button issues
			showLoginScreen();
			return false;
		}
		
		console.log('[AUTH] Session found - user authenticated:', session.user?.email);
		authCheckComplete = true;
		return true;
	} catch (error) {
		console.error('[AUTH] Fatal error in requireLogin:', error);
		console.error('[AUTH] Error stack:', error.stack);
		authCheckComplete = false;
		// Show login screen on error
		showLoginScreen();
		return false;
	} finally {
		authLoading = false;
	}
}

// Helper: Get current user (for backwards compatibility)
async function getUser() {
	const session = await getSession();
	return session?.user || null;
}

// Helper: Show login screen (content switching, not redirect)
async function showLoginScreen() {
	// Clear all app state
	currentWorkout = null;
	editingWorkoutId = null;
	allExercises = [];
	currentExercise = null;
	
	// Stop any timers
	if (workoutTimer) {
		clearInterval(workoutTimer);
		workoutTimer = null;
	}
	workoutStartTime = null;
	
	// Reset supabase client
	supabaseClient = null;
	
	// Hide ALL content sections (explicit for WebView)
	const allContent = document.querySelectorAll('.content');
	allContent.forEach(content => {
		content.classList.add('hidden');
		content.style.display = 'none';
	});
	
	// Hide navigation bar on login screen
	const navbar = document.querySelector('.navbar');
	if (navbar) {
		navbar.style.display = 'none';
	}
	
	// Show login content (explicit for WebView)
	const loginContent = document.getElementById('login-content');
	if (loginContent) {
		loginContent.classList.remove('hidden');
		loginContent.style.display = '';
		// Force reflow in WebView
		if (window.Capacitor && window.Capacitor.isNativePlatform()) {
			loginContent.offsetHeight;
		}
		// Reset all form states
		const loginSubmitBtn = document.getElementById('login-submit-btn') || document.getElementById('submit-btn');
		if (loginSubmitBtn) {
			loginSubmitBtn.disabled = false;
			loginSubmitBtn.textContent = 'Sign In';
		}
		const loginEmail = document.getElementById('login-email') || document.getElementById('email');
		const loginPassword = document.getElementById('login-password') || document.getElementById('password');
		if (loginEmail) loginEmail.value = '';
		if (loginPassword) loginPassword.value = '';
		
		// Initialize form after delay
		setTimeout(() => {
			initLoginForm();
			initRegisterLink();
		}, 150);
	}
}

// Initialize register link
function initRegisterLink() {
	const registerLink = document.getElementById('show-register-link');
	if (registerLink) {
		// Remove old listeners
		const newLink = registerLink.cloneNode(true);
		registerLink.parentNode.replaceChild(newLink, registerLink);
		
		newLink.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			// Show register content
			const loginContent = document.getElementById('login-content');
			const registerContent = document.getElementById('register-content');
			if (loginContent) {
				loginContent.classList.add('hidden');
				loginContent.style.display = 'none';
			}
			if (registerContent) {
				registerContent.classList.remove('hidden');
				registerContent.style.display = '';
				// Reset register form states
				const registerSubmitBtn = document.getElementById('register-submit-btn') || document.getElementById('submit-btn');
				if (registerSubmitBtn) {
					registerSubmitBtn.disabled = false;
					registerSubmitBtn.textContent = 'Sign Up';
				}
				const registerEmail = document.getElementById('register-email');
				const registerUsername = document.getElementById('register-username');
				const registerPassword = document.getElementById('register-password');
				if (registerEmail) registerEmail.value = '';
				if (registerUsername) registerUsername.value = '';
				if (registerPassword) registerPassword.value = '';
				// Initialize register form
				initRegisterForm();
				initBackToLoginLink();
			}
		});
	}
}

// Initialize back to login link
function initBackToLoginLink() {
	const backLink = document.getElementById('show-login-link');
	if (backLink) {
		// Remove old listeners
		const newLink = backLink.cloneNode(true);
		backLink.parentNode.replaceChild(newLink, backLink);
		
		newLink.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			// Show login content
			const loginContent = document.getElementById('login-content');
			const registerContent = document.getElementById('register-content');
			if (registerContent) {
				registerContent.classList.add('hidden');
				registerContent.style.display = 'none';
			}
			if (loginContent) {
				loginContent.classList.remove('hidden');
				loginContent.style.display = '';
				// Reset login form states
				const loginSubmitBtn = document.getElementById('login-submit-btn') || document.getElementById('submit-btn');
				if (loginSubmitBtn) {
					loginSubmitBtn.disabled = false;
					loginSubmitBtn.textContent = 'Sign In';
				}
				const loginEmail = document.getElementById('login-email') || document.getElementById('email');
				const loginPassword = document.getElementById('login-password') || document.getElementById('password');
				if (loginEmail) loginEmail.value = '';
				if (loginPassword) loginPassword.value = '';
				initLoginForm();
				initRegisterLink();
			}
		});
	}
}

// Helper: Logout function
async function logout() {
	try {
		// Clear all data
		localStorage.clear();
		
		// Sign out from Supabase
		if (supabaseClient) {
	try {
		await supabaseClient.auth.signOut();
	} catch (e) {
				// Ignore sign out errors
			}
		}
		
		// Reset client
		supabaseClient = null;
		
		// Show login screen
		showLoginScreen();
	} catch (e) {
		// On any error, just clear and show login
		localStorage.clear();
		supabaseClient = null;
		showLoginScreen();
	}
}

// Make logout globally accessible
window.logout = logout;

// ========== NAVIGATION ==========
function initNavigation() {
	const navButtons = document.querySelectorAll('.nav-btn');
	navButtons.forEach(btn => {
			const tab = btn.dataset.tab;
		if (tab) {
			btn.addEventListener('click', () => {
				console.log('[NAV] Nav button clicked:', tab);
				switchTab(tab);
		});
			// Also add touchend for iOS
			btn.addEventListener('touchend', (e) => {
				e.preventDefault();
				console.log('[NAV] Nav button touched:', tab);
				switchTab(tab);
			});
			// Ensure button is touchable
			btn.style.touchAction = 'manipulation';
			btn.style.cursor = 'pointer';
		}
	});
	console.log('[NAV] Navigation initialized, buttons:', navButtons.length);
}

// Make switchTab globally available
window.switchTab = async function(tab) {
	// If already on login screen, ignore
	const loginContent = document.getElementById('login-content');
	if (loginContent && !loginContent.classList.contains('hidden')) {
		return;
	}
	
	// Check auth
	if (supabaseClient) {
		try {
			const { data: { session }, error } = await supabaseClient.auth.getSession();
			if (!session || error) {
				showLoginScreen();
				return;
			}
		} catch (e) {
			showLoginScreen();
			return;
		}
	} else {
		showLoginScreen();
		return;
	}
	
	// Show navigation bar (user is logged in)
	const navbar = document.querySelector('.navbar');
	if (navbar) {
		navbar.style.display = '';
	}
	
	// Update nav buttons
	document.querySelectorAll('.nav-btn').forEach(btn => {
		btn.classList.toggle('active', btn.dataset.tab === tab);
	});
	
	// Hide all content
	document.querySelectorAll('.content').forEach(content => {
		content.classList.add('hidden');
		content.style.display = 'none';
	});
	
	// Show selected content
	const contentId = `${tab}-content`;
	const content = document.getElementById(contentId);
	if (content) {
		content.classList.remove('hidden');
		content.style.display = ''; // Reset display style
		currentTab = tab;
		
		// Load tab-specific data (only if user is logged in)
		if (tab === 'workouts') {
			await loadWorkouts();
			updateWorkoutStartButton();
		} else if (tab === 'progress') {
			await loadProgress();
		} else if (tab === 'settings') {
			// Settings can be shown even if user data fails to load
			await loadSettings();
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
		const apiUrl = getApiUrl('/exercise-info');
		const res = await fetch(apiUrl, {
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
		const apiUrl = getApiUrl('/exercise-info');
		const res = await fetch(apiUrl, {
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
	// Prevent duplicate initialization
	if (exerciseSelectorInitialized) {
		console.log('[ExerciseSelector] Already initialized, skipping...');
		return;
	}
	
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

	// AI detect - SIMPLE - werkt zoals vision-detect
	if (aiDetectBtn) {
		const fileInput = document.getElementById('exercise-selector-file');
		if (fileInput) {
		aiDetectBtn.addEventListener('click', async () => {
				// Check if button is disabled (no credits)
				if (aiDetectBtn.disabled) {
					alert('You are out of your monthly credits');
					return;
				}
				fileInput.click();
			});
			
			fileInput.addEventListener('change', async (e) => {
				const file = e.target.files[0];
				if (!file) return;
				
				// Get credits before starting
				const creditsInfo = await getUserCredits();
				if (creditsInfo.credits_remaining <= 0) {
					alert('You are out of your monthly credits');
					return;
				}
				
				// Show credits message - subtract 1 because we're about to use one
				const creditsAfterUse = Math.max(0, creditsInfo.credits_remaining - 1);
				showCreditsMessage(creditsAfterUse);
				
				aiDetectBtn.disabled = true;
				aiDetectBtn.textContent = 'Analyzing...';
				
				try {
					// Get auth token for request
					const session = await supabaseClient.auth.getSession();
					const headers = {};
					if (session.data.session) {
						headers['Authorization'] = `Bearer ${session.data.session.access_token}`;
					}
					
					const formData = new FormData();
					formData.append('image', file);
					
					const apiUrl = getApiUrl('/api/recognize-exercise');
					console.log('[AI Detect] Sending to:', apiUrl);
					console.log('[AI Detect] File:', file.name, file.size, 'bytes');
					
					const res = await fetch(apiUrl, {
						method: 'POST',
						headers: headers,
						body: formData
					});
					
					console.log('[AI Detect] Response status:', res.status, res.statusText);
					
					if (!res.ok) {
						if (res.status === 403) {
							const errorData = await res.json().catch(() => ({}));
							if (errorData.error === 'no_credits') {
								alert('You are out of your monthly credits');
								// Update buttons to reflect no credits
								updateAIDetectButtons();
								aiDetectBtn.disabled = false;
								aiDetectBtn.textContent = 'AI-detect';
								fileInput.value = '';
								return;
							}
						}
						const errorText = await res.text();
						console.error('[AI Detect] Error response:', errorText);
						throw new Error(`Server error: ${res.status} ${res.statusText}`);
					}
					
					const responseText = await res.text();
					console.log('[AI Detect] Raw response text:', responseText);
					
					let data;
					try {
						data = JSON.parse(responseText);
					} catch (e) {
						console.error('[AI Detect] Failed to parse JSON:', e);
						alert('ERROR: Response is not JSON:\n' + responseText.substring(0, 200));
						return;
					}
					
					console.log('[AI Detect] Parsed response:', JSON.stringify(data));
					
					// Update credits display if provided
					if (data.credits_remaining !== undefined) {
						showCreditsMessage(data.credits_remaining);
						// Update buttons based on new credits
						updateAIDetectButtons();
					}
					
					// Extract exercise name - be VERY lenient, accept anything
					let exerciseName = '';
					if (data) {
						// Try multiple ways to get the exercise name
						exerciseName = data.exercise || data.message || data.text || '';
						exerciseName = String(exerciseName).toLowerCase().trim();
					}
					
					console.log('[AI Detect] Raw data:', data);
					console.log('[AI Detect] Exercise name extracted:', exerciseName);
					console.log('[AI Detect] Exercise name length:', exerciseName.length);
					
					// ONLY show error if it's EXPLICITLY "unknown exercise" or completely empty
					// If the model detected ANYTHING (even if it doesn't match), show it
					const isExplicitlyUnknown = exerciseName === 'unknown exercise' || 
					                              exerciseName === 'unknown' ||
					                              !exerciseName || 
					                              exerciseName.length < 2;
					
					if (isExplicitlyUnknown) {
						console.log('[AI Detect] Explicitly unknown or empty - showing friendly message');
						alert('We couldn\'t recognize an exercise in this image.\n\nPlease try a clearer photo of the exercise being performed.');
						return;
					}
					
					// Model detected something - try to find match, but always show what was detected
					console.log('[AI Detect] Looking for match for:', exerciseName);
					
					// Find match
					const matchingExercise = findExerciseByName(exerciseName);
					console.log('[AI Detect] Match found?', matchingExercise ? matchingExercise.display : 'NO MATCH');
					
					if (matchingExercise) {
						console.log('[AI Detect] Adding exercise:', matchingExercise.display);
						// Close selector en voeg toe
						if (selector) selector.classList.add('hidden');
						document.body.classList.remove('selector-open');
						addExerciseToWorkout(matchingExercise);
					} else {
						// Model detected something but no match - show detected name (NO ERROR, just info)
						const displayName = exerciseName.split(' ').map(w => 
							w.charAt(0).toUpperCase() + w.slice(1)
						).join(' ');
						console.log('[AI Detect] No match, showing detected name:', displayName);
						alert(`Detected: ${displayName}\n\nThis exercise is not in the list. Please select manually.`);
					}
					
				} catch (e) {
					console.error('AI detect error:', e);
					alert('We couldn\'t recognize an exercise in this image.\n\nPlease try a clearer photo of the exercise being performed.');
				} finally {
					// Update buttons based on current credits (may be disabled if no credits left)
					updateAIDetectButtons();
					aiDetectBtn.textContent = 'AI-detect';
					fileInput.value = '';
				}
			});
		}
	}
	
	// Muscle filters
	const muscles = ['All', 'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Cardio'];
	if (musclesContainer) {
		// Clear container first to prevent duplicates when initExerciseSelector is called multiple times
		musclesContainer.innerHTML = '';
		
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
		
		// Add "+" button for custom exercise
		const addCustomBtn = document.createElement('button');
		addCustomBtn.textContent = '+';
		addCustomBtn.className = 'exercise-selector-add-custom';
				addCustomBtn.style.cssText = 'background:var(--accent);border:1px solid var(--accent);color:#fff;font-weight:700;font-size:18px;';
		addCustomBtn.onclick = () => {
			openCustomExerciseModal();
		};
		musclesContainer.appendChild(addCustomBtn);
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
			const isCustom = ex.isCustom === true;
			
			// Create wrapper for custom exercises with delete button
			const wrapper = document.createElement('div');
			wrapper.className = 'exercise-selector-item-wrapper';
			wrapper.style.cssText = 'display:flex;align-items:center;gap:8px;position:relative;';
			
			const item = document.createElement('button');
			item.className = 'exercise-selector-item';
			if (isCustom) {
				item.style.flex = '1';
			}
			const imageSrc = getExerciseImageSource(ex);
			const initial = (ex.display || ex.key || '?').charAt(0).toUpperCase();
			item.innerHTML = `
				<div class="exercise-selector-item-main">
					${imageSrc
						? `<img class="exercise-selector-item-image" src="${imageSrc}" alt="${ex.display || ex.key || 'Exercise'}" />`
						: `<div class="exercise-selector-item-image" style="background:rgba(124,92,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;">${initial}</div>`}
				<div class="exercise-selector-item-content">
					<div style="font-weight: 600;">${ex.display}</div>
					${ex.muscles && ex.muscles.length > 0 ? `<span>${[...new Set(ex.muscles.filter(m => m && m !== '-'))].join(', ')}</span>` : ''}
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
			
			if (isCustom) {
				// Add delete button for custom exercises
				const deleteBtn = document.createElement('button');
				deleteBtn.className = 'exercise-selector-delete-custom';
				deleteBtn.setAttribute('data-exercise-key', ex.key);
				deleteBtn.setAttribute('aria-label', 'Delete custom exercise');
				deleteBtn.innerHTML = '<img src="static/close.png" alt="Delete" style="width:14px;height:14px;filter:invert(1);">';
				deleteBtn.onclick = (e) => {
					e.stopPropagation();
					if (confirm('Are you sure you want to delete this custom exercise?')) {
						deleteCustomExercise(ex.key);
						// Refresh the exercise list
						filterExercises(searchInput?.value || '', selectedMuscle);
					}
				};
				wrapper.appendChild(item);
				wrapper.appendChild(deleteBtn);
				resultsContainer.appendChild(wrapper);
			} else {
			resultsContainer.appendChild(item);
			}
		});
	}

	// Custom Exercise Modal Functions
	function openCustomExerciseModal() {
		const modal = document.getElementById('custom-exercise-modal');
		const nameInput = document.getElementById('custom-exercise-name');
		const muscleField = document.getElementById('custom-exercise-muscle-field');
		if (modal) {
			modal.classList.remove('hidden');
			document.body.classList.add('custom-exercise-modal-open');
			// Show muscle field by default (weight-reps is default)
			if (muscleField) {
				muscleField.style.display = '';
			}
			if (nameInput) {
				setTimeout(() => nameInput.focus(), 100);
			}
		}
	}

	function closeCustomExerciseModal() {
		const modal = document.getElementById('custom-exercise-modal');
		const nameInput = document.getElementById('custom-exercise-name');
		const muscleSelect = document.getElementById('custom-exercise-muscle');
		if (modal) {
			modal.classList.add('hidden');
			document.body.classList.remove('custom-exercise-modal-open');
			if (nameInput) {
				nameInput.value = '';
			}
			if (muscleSelect) {
				muscleSelect.value = '';
			}
			// Reset type to default
			const typeBtns = document.querySelectorAll('.custom-exercise-type-btn');
			typeBtns.forEach(btn => btn.classList.remove('active'));
			if (typeBtns[0]) typeBtns[0].classList.add('active');
			// Show muscle field by default
			const muscleField = document.getElementById('custom-exercise-muscle-field');
			if (muscleField) {
				muscleField.style.display = '';
			}
		}
	}

	function initCustomExerciseModal() {
		const modal = document.getElementById('custom-exercise-modal');
		if (!modal) return;

		const closeBtn = document.getElementById('custom-exercise-close');
		const cancelBtn = document.getElementById('custom-exercise-cancel');
		const addBtn = document.getElementById('custom-exercise-add');
		const nameInput = document.getElementById('custom-exercise-name');
		const muscleSelect = document.getElementById('custom-exercise-muscle');
		const muscleField = document.getElementById('custom-exercise-muscle-field');
		const typeBtns = document.querySelectorAll('.custom-exercise-type-btn');
		const backdrop = modal.querySelector('.custom-exercise-backdrop');

		let selectedType = 'weight-reps';

		// Type selection
		typeBtns.forEach(btn => {
			btn.addEventListener('click', () => {
				typeBtns.forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				selectedType = btn.dataset.type;
				
				// Show/hide muscle field based on type
				if (muscleField) {
					if (selectedType === 'cardio') {
						muscleField.style.display = 'none';
					} else {
						muscleField.style.display = '';
					}
				}
			});
		});

		// Close handlers
		if (closeBtn) {
			closeBtn.addEventListener('click', closeCustomExerciseModal);
		}
		if (cancelBtn) {
			cancelBtn.addEventListener('click', closeCustomExerciseModal);
		}
		if (backdrop) {
			backdrop.addEventListener('click', closeCustomExerciseModal);
		}

		// Add exercise handler
		if (addBtn && nameInput) {
			addBtn.addEventListener('click', () => {
				const exerciseName = nameInput.value.trim();
				if (!exerciseName) {
					alert('Please enter an exercise name');
					return;
				}

				// Create custom exercise object
				const isCardio = selectedType === 'cardio';
				const isBodyweight = selectedType === 'bodyweight';
				const selectedMuscle = muscleSelect?.value || '';
				
				// Validate muscle selection for non-cardio exercises
				if (!isCardio && !selectedMuscle) {
					alert('Please select a primary muscle for this exercise');
					return;
				}

				const customExercise = {
					key: `custom_${Date.now()}_${exerciseName.toLowerCase().replace(/\s+/g, '_')}`,
					display: exerciseName,
					isCustom: true, // Mark as custom so it doesn't try to fetch metadata
					exerciseType: selectedType, // Store the type: 'weight-reps', 'bodyweight', or 'cardio'
					muscles: isCardio ? ['Cardio', '-', '-'] : [selectedMuscle.toLowerCase(), '-', '-'],
					video: null, // No video for custom exercises
					sets: createDefaultSets(DEFAULT_SET_COUNT, isCardio)
				};

				// Save custom exercise to localStorage
				saveCustomExercise(customExercise);

				// Add to workout (custom exercises don't need metadata lookup)
				if (!currentWorkout) {
					startNewWorkout();
				}

				currentWorkout.exercises.push(customExercise);

				renderWorkoutList();
				saveWorkoutDraft();
				
				// Close modals
				closeCustomExerciseModal();
				if (selector) selector.classList.add('hidden');
				document.body.classList.remove('selector-open');
			});
		}

		// Enter key to add
		if (nameInput) {
			nameInput.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					if (addBtn) addBtn.click();
				}
			});
		}
	}

	// Initialize custom exercise modal
	initCustomExerciseModal();

	// Expose filter for external callers (e.g. when opening selector)
	window.filterExercisesForSelector = (query, muscle) => {
		filterExercises(query, muscle);
	};
	
	// Mark as initialized to prevent duplicate initialization
	exerciseSelectorInitialized = true;
	
	// Mark as initialized to prevent duplicate initialization
	exerciseSelectorInitialized = true;
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
					${muscles && muscles.length ? `<span>${[...new Set(muscles)].join(', ')}</span>` : ''}
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
						const apiUrl = getApiUrl('/exercise-info');
						const res = await fetch(apiUrl, {
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
					sets: createDefaultSets(3, isCardioExercise(exerciseData))
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
			const subtitleText = isGeneric ? 'Click to see exercises' : (muscles && muscles.length ? [...new Set(muscles)].join(', ') : '');
			
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
						sets: createDefaultSets(3, isCardioExercise({ key: pred.key || label.toLowerCase(), display: label }))
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
			console.log('[WORKOUT] AI Workout button clicked');
			startAIWorkout();
		});
		// Also add touchend for iOS
		aiWorkoutBtn.addEventListener('touchend', (e) => {
			e.preventDefault();
			console.log('[WORKOUT] AI Workout button touched');
			startAIWorkout();
		});
		// Ensure button is touchable
		aiWorkoutBtn.style.touchAction = 'manipulation';
		aiWorkoutBtn.style.cursor = 'pointer';
		aiWorkoutBtn.style.webkitTouchCallout = 'none';
	}
	
	if (manualWorkoutBtn) {
		manualWorkoutBtn.addEventListener('click', () => {
			console.log('[WORKOUT] Manual Workout button clicked');
			startNewWorkout();
		});
		// Also add touchend for iOS
		manualWorkoutBtn.addEventListener('touchend', (e) => {
			e.preventDefault();
			console.log('[WORKOUT] Manual Workout button touched');
			startNewWorkout();
		});
		// Ensure button is touchable
		manualWorkoutBtn.style.touchAction = 'manipulation';
		manualWorkoutBtn.style.cursor = 'pointer';
		manualWorkoutBtn.style.webkitTouchCallout = 'none';
	}
	
	if (saveWorkoutBtn) {
		// Remove any existing listeners first
		const newBtn = saveWorkoutBtn.cloneNode(true);
		saveWorkoutBtn.parentNode.replaceChild(newBtn, saveWorkoutBtn);
		
		// Add single event listener
		newBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (window.saveWorkout && !isSavingWorkout) {
				window.saveWorkout();
			}
		}, { once: false });
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

// Make functions globally available for inline onclick handlers
window.startAIWorkout = function() {
	console.log('[WORKOUT] startAIWorkout called (global)');
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

// Make functions globally available for inline onclick handlers
window.startNewWorkout = function(workoutData = null) {
	console.log('[WORKOUT] startNewWorkout called (global)');
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
	const exerciseKey = meta?.key || exercise?.key;
	// Load notes from localStorage (linked to exercise key)
	const notes = exerciseKey ? getExerciseNotes(exerciseKey) : '';
	return {
		key: exerciseKey,
		display: exercise?.display || meta?.display || exercise?.key || 'Exercise',
		image: meta?.image || exercise?.image,
		muscles: (exercise?.muscles && exercise.muscles.length) ? exercise.muscles : (meta?.muscles || []),
		video: meta?.video || exercise?.video,
		notes: notes,
		sets
	};
}

function renderExerciseInfoButton(exercise) {
	if (!exercise) return '';
	// Don't show info button for custom exercises (no video)
	if (exercise.isCustom) return '';
	
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

// Helper function to find exercise by name (from OpenAI response)
function findExerciseByName(exerciseName) {
	if (!exerciseName || !allExercises || allExercises.length === 0) return null;
	
	const nameLower = exerciseName.toLowerCase().trim();
	
	// Try exact match first (key or display)
	let match = allExercises.find(ex => {
		const keyLower = (ex.key || '').toLowerCase().trim();
		const displayLower = (ex.display || '').toLowerCase().trim();
		return keyLower === nameLower || displayLower === nameLower;
	});
	
	if (match) return match;
	
	// Try partial match - check if name is contained in key or display
	match = allExercises.find(ex => {
		const keyLower = (ex.key || '').toLowerCase().replace(/_/g, ' ').trim();
		const displayLower = (ex.display || '').toLowerCase().trim();
		return keyLower.includes(nameLower) || displayLower.includes(nameLower) ||
		       nameLower.includes(keyLower) || nameLower.includes(displayLower);
	});
	
	if (match) return match;
	
	// Try fuzzy match - check if key parts match
	const nameParts = nameLower.split(' ').filter(p => p.length > 2);
	if (nameParts.length > 0) {
		match = allExercises.find(ex => {
			const keyLower = (ex.key || '').toLowerCase().replace(/_/g, ' ');
			const displayLower = (ex.display || '').toLowerCase();
			// Check if all name parts are in key or display
			return nameParts.every(part => keyLower.includes(part) || displayLower.includes(part));
		});
	}
	
	return match || null;
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
	
	// Get full exercise info if we only have a key (skip for custom exercises)
	let exerciseData = exercise;
	if (!exercise.isCustom && (typeof exercise === 'string' || (exercise && !exercise.display))) {
		try {
		const apiUrl = getApiUrl('/exercise-info');
		const res = await fetch(apiUrl, {
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
		const isCardio = isCardioExercise(exerciseData);
		if (isCardio) {
			previousSetsForPlaceholder = exerciseData.previousSets.map(s => ({ 
				min: s.min || '', 
				sec: s.sec || '', 
				km: s.km || '', 
				cal: s.cal || '', 
				notes: s.notes || '' 
			}));
		} else {
		previousSetsForPlaceholder = exerciseData.previousSets.map(s => ({ weight: s.weight || '', reps: s.reps || '' }));
		}
		existingSets = createDefaultSets(previousSetsForPlaceholder.length || DEFAULT_SET_COUNT, isCardio);
	} else {
		// New exercise - try to get last workout data for placeholders
		const isCardio = isCardioExercise(exerciseData);
		const lastSets = getLastExerciseData(exerciseData.key || exerciseData.display);
		if (lastSets && lastSets.length > 0) {
			previousSetsForPlaceholder = lastSets;
			existingSets = createDefaultSets(lastSets.length, isCardio);
		} else {
			existingSets = createDefaultSets(DEFAULT_SET_COUNT, isCardio);
		}
	}
	
	// Ensure exercise always has a unique key
	if (!exerciseData.key) {
		// Generate unique key from display name if key doesn't exist
		const displaySlug = (exerciseData.display || 'exercise').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
		exerciseData.key = `${displaySlug}_${Date.now()}`;
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
					<button class="workout-exercise-notes-btn ${getExerciseNotes(ex.key || `exercise_${idx}_${(ex.display || '').toLowerCase().replace(/\s+/g, '_')}`) ? 'has-notes' : ''}" data-exercise-key="${ex.key || `exercise_${idx}_${(ex.display || '').toLowerCase().replace(/\s+/g, '_')}`}" data-exercise-index="${idx}" aria-label="Exercise notes" title="Add notes">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
							<polyline points="14 2 14 8 20 8"></polyline>
							<line x1="16" y1="13" x2="8" y2="13"></line>
							<line x1="16" y1="17" x2="8" y2="17"></line>
							<polyline points="10 9 9 9 8 9"></polyline>
						</svg>
					</button>
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
		const isCardio = isCardioExercise(ex);
		const isBodyweight = isBodyweightExercise(ex);
		if (ex.sets.length === 0) {
			ex.sets = createDefaultSets(DEFAULT_SET_COUNT, isCardio);
		}
		if (isBodyweight) {
			setsContainer.classList.add('bodyweight');
		}
		if (isCardio) {
			setsContainer.classList.add('cardio');
		}
		
		if (isCardio) {
			// Cardio: Special layout with Min, Sec, KM, Cal, and Notes field
			const set = ex.sets[0] || { min: '', sec: '', km: '', cal: '', notes: '' };
			const prevSet = Array.isArray(ex.previousSets) ? ex.previousSets[0] : null;
			
			const cardioRow = document.createElement('div');
			cardioRow.className = 'workout-edit-cardio-row';
			cardioRow.innerHTML = `
				<div class="cardio-left">
					<div class="cardio-fields-grid">
						<div class="cardio-field">
							<label class="cardio-label">Min</label>
							<input type="number" class="workout-edit-set-input cardio-input" placeholder="0" inputmode="numeric" value="${set.min ?? ''}" aria-label="Minutes">
						</div>
						<div class="cardio-field">
							<label class="cardio-label">Sec</label>
							<input type="number" class="workout-edit-set-input cardio-input" placeholder="0" inputmode="numeric" value="${set.sec ?? ''}" aria-label="Seconds">
						</div>
						<div class="cardio-field">
							<label class="cardio-label">KM</label>
							<input type="number" class="workout-edit-set-input cardio-input" placeholder="0" inputmode="decimal" value="${set.km ?? ''}" aria-label="Kilometers">
						</div>
						<div class="cardio-field">
							<label class="cardio-label">Cal</label>
							<input type="number" class="workout-edit-set-input cardio-input" placeholder="0" inputmode="numeric" value="${set.cal ?? ''}" aria-label="Calories">
						</div>
					</div>
				</div>
				<div class="cardio-right">
					<label class="cardio-label">Notes</label>
					<textarea class="workout-edit-set-input cardio-notes" placeholder="" aria-label="Notes">${set.notes ?? ''}</textarea>
				</div>
			`;
			
			const inputs = cardioRow.querySelectorAll('.cardio-input');
			const notesInput = cardioRow.querySelector('.cardio-notes');
			
			inputs.forEach((input, idx) => {
				const fieldName = ['min', 'sec', 'km', 'cal'][idx];
				input.addEventListener('input', (e) => {
					if (!ex.sets[0]) ex.sets[0] = { min: '', sec: '', km: '', cal: '', notes: '' };
					ex.sets[0][fieldName] = e.target.value ? Number(e.target.value) : '';
					saveWorkoutDraft();
				});
			});
			
			if (notesInput) {
				notesInput.addEventListener('input', (e) => {
					if (!ex.sets[0]) ex.sets[0] = { min: '', sec: '', km: '', cal: '', notes: '' };
					ex.sets[0].notes = e.target.value;
					saveWorkoutDraft();
				});
			}
			
			setsContainer.appendChild(cardioRow);
		} else {
			// Regular exercises: header and multiple sets
		const headerRow = document.createElement('div');
		headerRow.className = 'workout-edit-set-row workout-edit-set-header';
		headerRow.innerHTML = `
			<div class="set-col">Set</div>
			${isBodyweight ? '' : `<div class="weight-col">${getWeightUnitLabel()}</div>`}
			<div class="reps-col">Reps</div>
			<div class="action-col"></div>
		`;
		setsContainer.appendChild(headerRow);
		
		ex.sets.forEach((set, setIdx) => {
			// Get placeholder values from previousSets or from the set itself if it has values
			const prevSet = Array.isArray(ex.previousSets) ? ex.previousSets[setIdx] : null;
			
				const setRow = document.createElement('div');
				setRow.className = 'workout-edit-set-row data';
				if ((setIdx % 2) === 1) {
					setRow.classList.add('even');
				}
				// Regular: Weight and Reps columns
			// For weight placeholder: use set value if it exists, otherwise use previousSet, otherwise 0
			// Convert to display unit (kg or lbs)
			const weightKg = (set.weight != null && set.weight !== '') 
				? set.weight 
				: (prevSet && prevSet.weight != null && prevSet.weight !== '' ? prevSet.weight : 0);
			const weightPlaceholder = convertWeightForDisplay(weightKg);
			const weightDisplayValue = set.weight != null && set.weight !== '' ? convertWeightForDisplay(set.weight) : '';
			
			// For reps placeholder: use set value if it exists, otherwise use previousSet, otherwise 0
			const repsPlaceholder = (set.reps != null && set.reps !== '') 
				? set.reps 
				: (prevSet && prevSet.reps != null && prevSet.reps !== '' ? prevSet.reps : 0);
			
			setRow.innerHTML = `
				<div class="set-col">
				<div class="workout-edit-set-number">${setIdx + 1}</div>
				</div>
				${isBodyweight ? '' : `<div class="weight-col">
					<input type="number" class="workout-edit-set-input weight" placeholder="${weightPlaceholder}" inputmode="decimal" value="${weightDisplayValue}" aria-label="Set weight (${getWeightUnitLabel().toLowerCase()})">
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
					// Convert input value (in current unit) to kg for storage
					const currentUnit = getWeightUnit();
					ex.sets[setIdx].weight = convertWeightForStorage(e.target.value, currentUnit);
					saveWorkoutDraft();
					// Auto-trigger rest timer if enabled and set is complete (both weight and reps)
					checkAndTriggerRestTimer(ex.sets[setIdx], e.target.value, repsInput.value, ex);
				});
			}
			
				repsInput.addEventListener('input', (e) => {
				ex.sets[setIdx].reps = e.target.value ? Number(e.target.value) : '';
				saveWorkoutDraft();
				// Auto-trigger rest timer if enabled and set is complete (both weight and reps)
				const weightValue = weightInput ? weightInput.value : '';
				checkAndTriggerRestTimer(ex.sets[setIdx], weightValue, e.target.value, ex);
				});
			
				if (deleteBtn) {
			deleteBtn.addEventListener('click', () => {
					ex.sets.splice(setIdx, 1);
					renderWorkoutList();
				saveWorkoutDraft();
				});
				}
			
			setsContainer.appendChild(setRow);
		});
		
			// Only show "Add Set" button for non-cardio exercises
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
			setsContainer.appendChild(addSetBtn);
		}
		
		li.appendChild(setsContainer);
		
		const deleteExerciseBtn = li.querySelector('.workout-edit-exercise-delete');
		deleteExerciseBtn.addEventListener('click', () => {
				currentWorkout.exercises.splice(idx, 1);
				renderWorkoutList();
			saveWorkoutDraft();
			});
		
		const notesBtn = li.querySelector('.workout-exercise-notes-btn');
		if (notesBtn) {
			notesBtn.addEventListener('click', () => {
				// Use key if available, otherwise create unique key from display + index
				const exerciseKey = ex.key || `exercise_${idx}_${(ex.display || '').toLowerCase().replace(/\s+/g, '_')}`;
				openExerciseNotesModal(exerciseKey, idx);
			});
		}
		
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
			// Ask for confirmation before canceling
			if (confirm('Are you sure you want to cancel this workout? All unsaved progress will be lost.')) {
			cancelWorkout();
			}
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

// Make saveWorkout globally available
window.saveWorkout = async function() {
	console.log('[WORKOUT] saveWorkout called (global)');
	
	// Prevent duplicate saves - check immediately and set flag synchronously
	if (isSavingWorkout) {
		console.log('[WORKOUT] Save already in progress, ignoring duplicate call');
		return;
	}
	
	if (!currentWorkout) return;
	
	// Set saving flag IMMEDIATELY (synchronously) before any async operations
	isSavingWorkout = true;
	
	// Disable save button immediately
	const saveWorkoutBtn = document.getElementById('save-workout');
	if (saveWorkoutBtn) {
		saveWorkoutBtn.disabled = true;
		saveWorkoutBtn.style.opacity = '0.5';
		saveWorkoutBtn.style.pointerEvents = 'none';
	}
	
	try {
		// Check if user is logged in
		if (!supabaseClient) {
			await initSupabase();
		}
		if (!supabaseClient) {
			alert('Please log in to save workouts');
			isSavingWorkout = false;
			const saveWorkoutBtn = document.getElementById('save-workout');
			if (saveWorkoutBtn) {
				saveWorkoutBtn.disabled = false;
				saveWorkoutBtn.style.opacity = '1';
				saveWorkoutBtn.style.pointerEvents = 'auto';
			}
			return;
		}
		
		const { data: { session } } = await supabaseClient.auth.getSession();
		if (!session) {
			alert('Please log in to save workouts');
			isSavingWorkout = false;
			const saveWorkoutBtn = document.getElementById('save-workout');
			if (saveWorkoutBtn) {
				saveWorkoutBtn.disabled = false;
				saveWorkoutBtn.style.opacity = '1';
				saveWorkoutBtn.style.pointerEvents = 'auto';
			}
			return;
		}
		
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
		
		// Calculate total volume
		const volume = calculateWorkoutVolume(currentWorkout);
		
		// Determine workout date - SIMPLE: use originalDate if editing, today if new
		let workoutDate;
		if (editingWorkoutId && currentWorkout.originalDate) {
			// When editing, use the EXACT original date string - NO CONVERSION
			workoutDate = currentWorkout.originalDate;
		} else {
			// New workout - use today's date
			const today = new Date();
			const year = today.getFullYear();
			const month = String(today.getMonth() + 1).padStart(2, '0');
			const day = String(today.getDate()).padStart(2, '0');
			workoutDate = `${year}-${month}-${day}`;
		}
		
		// Prepare payload for Supabase
		const workoutPayload = {
			user_id: session.user.id,
			name: currentWorkout.name || 'Workout',
			date: workoutDate,
			exercises: currentWorkout.exercises || [],
			duration: duration,
			total_volume: volume
		};
		
		if (editingWorkoutId) {
			// Update existing workout
			const { data, error } = await supabaseClient
				.from('workouts')
				.update(workoutPayload)
				.eq('id', editingWorkoutId)
				.eq('user_id', session.user.id)
				.select()
				.single();
			
			if (error) {
				console.error('[WORKOUT] Error updating workout:', error);
				alert('Failed to update workout. Please try again.');
				isSavingWorkout = false;
				const saveWorkoutBtn = document.getElementById('save-workout');
				if (saveWorkoutBtn) {
					saveWorkoutBtn.disabled = false;
					saveWorkoutBtn.style.opacity = '1';
					saveWorkoutBtn.style.pointerEvents = 'auto';
				}
				return;
			}
			console.log('[WORKOUT] Workout updated successfully:', data);
		} else {
			// Insert new workout
			const { data, error } = await supabaseClient
				.from('workouts')
				.insert(workoutPayload)
				.select()
				.single();
			
			if (error) {
				console.error('[WORKOUT] Error saving workout:', error);
				alert('Failed to save workout. Please try again.');
				isSavingWorkout = false;
				const saveWorkoutBtn = document.getElementById('save-workout');
				if (saveWorkoutBtn) {
					saveWorkoutBtn.disabled = false;
					saveWorkoutBtn.style.opacity = '1';
					saveWorkoutBtn.style.pointerEvents = 'auto';
				}
				return;
			}
			console.log('[WORKOUT] Workout saved successfully:', data);
		}
		
		// Also save to localStorage as backup
		const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
		const payload = {
			...currentWorkout,
			id: editingWorkoutId || currentWorkout.id || Date.now(),
			date: workoutDate
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
		
		// Update streak for all workouts (recalculate from actual data)
		loadStreak();
		
		// Update daily notification if user just worked out
		updateDailyNotificationIfNeeded();
		
		editingWorkoutId = null;
		clearWorkoutDraft();
		
		const saveSuccess = document.getElementById('save-success');
		if (saveSuccess) {
			saveSuccess.classList.remove('hidden');
			setTimeout(() => {
				saveSuccess.classList.add('hidden');
			}, 2000);
		}
		
		await loadWorkouts();
		switchTab('workouts');
	} catch (error) {
		console.error('[WORKOUT] Unexpected error saving workout:', error);
		alert('An error occurred while saving the workout. Please try again.');
	} finally {
		// Always reset the saving flag and re-enable button
		isSavingWorkout = false;
		const saveWorkoutBtn = document.getElementById('save-workout');
		if (saveWorkoutBtn) {
			saveWorkoutBtn.disabled = false;
			saveWorkoutBtn.style.opacity = '1';
			saveWorkoutBtn.style.pointerEvents = 'auto';
		}
	}
}

// Migrate localStorage workouts to Supabase
async function migrateLocalStorageWorkouts() {
	if (!supabaseClient) {
		await initSupabase();
	}
	if (!supabaseClient) {
		return;
	}
	
	const { data: { session } } = await supabaseClient.auth.getSession();
	if (!session) {
		return;
	}
	
	// Check if migration already done for this user
	const migrationKey = `workouts_migrated_${session.user.id}`;
	if (localStorage.getItem(migrationKey) === 'true') {
		return; // Already migrated
	}
	
	// Get workouts from localStorage
	const localWorkouts = JSON.parse(localStorage.getItem('workouts') || '[]');
	if (localWorkouts.length === 0) {
		// Mark as migrated even if no workouts to avoid checking again
		localStorage.setItem(migrationKey, 'true');
		return;
	}
	
	try {
		// Check if user already has workouts in Supabase
		const { data: existingWorkouts, error: checkError } = await supabaseClient
			.from('workouts')
			.select('id')
			.eq('user_id', session.user.id)
			.limit(1);
		
		if (checkError) {
			console.error('[MIGRATION] Error checking existing workouts:', checkError);
			return;
		}
		
		// If user already has workouts in Supabase, don't migrate (they might have been synced already)
		if (existingWorkouts && existingWorkouts.length > 0) {
			console.log('[MIGRATION] User already has workouts in Supabase, skipping migration');
			localStorage.setItem(migrationKey, 'true');
			return;
		}
		
		// Migrate each workout
		const workoutsToMigrate = localWorkouts.map(workout => {
			// Preserve date as YYYY-MM-DD string to avoid timezone issues
			let workoutDate;
			if (workout.date) {
				if (typeof workout.date === 'string' && workout.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
					// Already a date string, use it directly
					workoutDate = workout.date;
				} else {
					// ISO string or Date object, extract date part using local time
					const date = new Date(workout.date);
					const year = date.getFullYear();
					const month = String(date.getMonth() + 1).padStart(2, '0');
					const day = String(date.getDate()).padStart(2, '0');
					workoutDate = `${year}-${month}-${day}`;
				}
			} else {
				// No date, use today
				const today = new Date();
				const year = today.getFullYear();
				const month = String(today.getMonth() + 1).padStart(2, '0');
				const day = String(today.getDate()).padStart(2, '0');
				workoutDate = `${year}-${month}-${day}`;
			}
			
			return {
				user_id: session.user.id,
				name: workout.name || 'Workout',
				date: workoutDate,
				exercises: workout.exercises || [],
				duration: workout.duration || 0,
				total_volume: calculateWorkoutVolume(workout) || 0
			};
		});
		
		if (workoutsToMigrate.length > 0) {
			const { data, error } = await supabaseClient
				.from('workouts')
				.insert(workoutsToMigrate)
				.select();
			
			if (error) {
				console.error('[MIGRATION] Error migrating workouts:', error);
				return;
			}
			
			console.log(`[MIGRATION] Successfully migrated ${workoutsToMigrate.length} workouts to Supabase`);
		}
		
		// Mark migration as complete
		localStorage.setItem(migrationKey, 'true');
	} catch (error) {
		console.error('[MIGRATION] Unexpected error during migration:', error);
	}
}

async function loadWorkouts(prefetchedWorkouts = null) {
	// Check if user is logged in
	if (!supabaseClient) {
		await initSupabase();
	}
	if (!supabaseClient) {
		showLoginScreen();
		return;
	}
	
	const { data: { session } } = await supabaseClient.auth.getSession();
	if (!session) {
		showLoginScreen();
		return;
	}
	
	let workouts = [];
	
	// If prefetched workouts provided, use those (for backward compatibility)
	if (prefetchedWorkouts) {
		workouts = prefetchedWorkouts;
	} else {
		// Load from Supabase
		try {
			const { data, error } = await supabaseClient
				.from('workouts')
				.select('*')
				.eq('user_id', session.user.id)
				.order('date', { ascending: false });
			
			if (error) {
				console.error('[WORKOUT] Error loading workouts:', error);
				// Fallback to localStorage if Supabase fails
				workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
			} else {
				// Transform Supabase data to match app format
				workouts = (data || []).map(workout => {
					// CRITICAL: Preserve the EXACT date string from Supabase (YYYY-MM-DD)
					// Store it as both 'date' and 'originalDate' to ensure it's never lost
					let workoutDate;
					if (workout.date) {
						// Supabase returns dates as YYYY-MM-DD strings - use it DIRECTLY
						if (typeof workout.date === 'string' && workout.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
							workoutDate = workout.date;
						} else {
							// Fallback: extract date part (shouldn't happen with Supabase)
							workoutDate = workout.date.toString().split('T')[0];
						}
					} else {
						// No date, use today
						const today = new Date();
						const year = today.getFullYear();
						const month = String(today.getMonth() + 1).padStart(2, '0');
						const day = String(today.getDate()).padStart(2, '0');
						workoutDate = `${year}-${month}-${day}`;
					}
					
					return {
						id: workout.id,
						name: workout.name || 'Workout',
						date: workoutDate, // For display/sorting
						originalDate: workoutDate, // EXACT original date - NEVER TOUCH THIS
						exercises: workout.exercises || [],
						duration: workout.duration || 0,
						total_volume: workout.total_volume || 0
					};
				});
				
				// Also sync to localStorage as backup
				localStorage.setItem('workouts', JSON.stringify(workouts));
			}
		} catch (error) {
			console.error('[WORKOUT] Unexpected error loading workouts:', error);
			// Fallback to localStorage
			workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
		}
	}
	
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
		
		// Sort by date string (YYYY-MM-DD) directly to avoid timezone issues
		const sorted = [...workouts].sort((a, b) => {
			// Compare date strings directly (YYYY-MM-DD format)
			return b.date.localeCompare(a.date);
		});
		
		sorted.forEach(workout => {
			const li = document.createElement('li');
			// Parse date string (YYYY-MM-DD) to Date object for display
			// Use noon (12:00) to avoid timezone issues when converting
			const date = new Date(workout.date + 'T12:00:00');
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
				if (e.target.closest('.workout-exercise-notes-btn')) return;
				if (e.target.closest('.exercise-video-inline')) return;
				if (!details) return;
				details.classList.toggle('expanded');
				details.classList.add('readonly');
				details.classList.remove('inline-edit');
			});
			
			// Add event listeners for notes buttons in workout view
			const notesButtons = li.querySelectorAll('.workout-exercise-notes-btn');
			notesButtons.forEach(notesBtn => {
				notesBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					const exerciseKey = notesBtn.dataset.exerciseKey || '';
					// Find exercise index in workout - use key for matching
					const exerciseIndex = workout.exercises.findIndex(ex => ex.key === exerciseKey || (ex.key || ex.display) === exerciseKey);
					if (exerciseIndex >= 0) {
						openExerciseNotesModal(exerciseKey, exerciseIndex);
					}
				});
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
					if (confirm('Are you sure that you want to delete this workout?')) {
					deleteWorkout(workout.id);
					}
			});
			}
			
			workoutsList.appendChild(li);
		});
	}
	
	// Render workout heatmap in workouts tab
	renderWorkoutHeatmap(workouts);
}

function buildWorkoutExercisesMarkup(workout) {
	const exercises = workout.exercises || [];
	if (!exercises.length) {
		return `<div class="workout-exercise-empty">No exercises logged</div>`;
	}
	
	return exercises.map(exercise => {
		const sets = exercise.sets || [];
		const isBodyweight = isBodyweightExercise(exercise);
		const isCardio = isCardioExercise(exercise);
		
		const setsMarkup = sets.length
			? sets.map((set, idx) => {
				if (isCardio) {
					const cardioSet = sets[0] || { min: '', sec: '', km: '', cal: '', notes: '' };
					return `
				<div class="workout-edit-cardio-row view">
					<div class="cardio-left">
						<div class="cardio-fields-grid">
							<div class="cardio-field">
								<label class="cardio-label">Min</label>
								<div class="workout-view-value">${cardioSet.min || '0'}</div>
							</div>
							<div class="cardio-field">
								<label class="cardio-label">Sec</label>
								<div class="workout-view-value">${cardioSet.sec || '0'}</div>
							</div>
							<div class="cardio-field">
								<label class="cardio-label">KM</label>
								<div class="workout-view-value">${cardioSet.km || '0'}</div>
							</div>
							<div class="cardio-field">
								<label class="cardio-label">Cal</label>
								<div class="workout-view-value">${cardioSet.cal || '0'}</div>
							</div>
						</div>
					</div>
					<div class="cardio-right">
						<label class="cardio-label">Notes</label>
						<div class="workout-view-value cardio-notes-view">${cardioSet.notes || '-'}</div>
					</div>
				</div>
			`;
				} else {
					return `
				<div class="workout-edit-set-row view${(idx % 2) === 1 ? ' even' : ''}">
					<div class="set-col">
						<div class="workout-edit-set-number">${idx + 1}</div>
				</div>
					${isBodyweight ? '' : `<div class="weight-col">
						<div class="workout-view-value">${convertWeightForDisplay(set.weight ?? 0)}</div>
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
			`;
				}
			}).join('')
			: `<div class="workout-set-line empty">No sets recorded</div>`;
		
		const infoButtonHtml = renderExerciseInfoButton(exercise);
		// Use key if available, otherwise create unique key from display
		// For workout view, we need a stable identifier - use key if available
		const exerciseKey = exercise.key || exercise.display || '';
		const notesButtonHtml = `<button class="workout-exercise-notes-btn ${getExerciseNotes(exerciseKey) ? 'has-notes' : ''}" data-exercise-key="${exerciseKey}" aria-label="Exercise notes" title="Add notes">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
				<polyline points="14 2 14 8 20 8"></polyline>
				<line x1="16" y1="13" x2="8" y2="13"></line>
				<line x1="16" y1="17" x2="8" y2="17"></line>
				<polyline points="10 9 9 9 8 9"></polyline>
			</svg>
		</button>`;
		return `
			<div class="workout-exercise workout-view-exercise">
				<div class="workout-view-header">
					<div class="workout-exercise-main">
						${buildExerciseThumb(exercise)}
						<div class="workout-exercise-name">${exercise.display || exercise.key || 'Exercise'}</div>
					</div>
					<div class="workout-view-actions">
						${notesButtonHtml}
						${infoButtonHtml}
					</div>
				</div>
				<div class="workout-edit-sets view-mode ${isBodyweight ? 'bodyweight' : ''} ${isCardio ? 'cardio' : ''}">
					${isCardio ? setsMarkup : `
					<div class="workout-edit-set-row workout-edit-set-header">
						<div class="set-col">Set</div>
						${isBodyweight ? '' : `<div class="weight-col">${getWeightUnitLabel()}</div>`}
						<div class="reps-col">Reps</div>
						<div class="action-col"></div>
					</div>
					${setsMarkup}
					`}
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
	// Custom exercises don't have images from metadata
	if (exercise.isCustom) {
		return [];
	}
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
	if (volumeKg === 0) return `0 ${getWeightUnitLabel().toLowerCase()}`;
	const unit = getWeightUnitLabel().toLowerCase();
	if (isLbs()) {
		const volumeLbs = Math.round(Number(kgToLbs(volumeKg)));
		return `${volumeLbs.toLocaleString()} ${unit}`;
	}
	return `${Math.round(volumeKg).toLocaleString()} ${unit}`;
}

async function deleteWorkout(id) {
	if (!supabaseClient) {
		await initSupabase();
	}
	if (!supabaseClient) {
		alert('Please log in to delete workouts');
		return;
	}
	
	const { data: { session } } = await supabaseClient.auth.getSession();
	if (!session) {
		alert('Please log in to delete workouts');
		return;
	}
	
	try {
		// Delete from Supabase
		const { error } = await supabaseClient
			.from('workouts')
			.delete()
			.eq('id', id)
			.eq('user_id', session.user.id);
		
		if (error) {
			console.error('[WORKOUT] Error deleting workout:', error);
			alert('Failed to delete workout. Please try again.');
			return;
		}
		
		// Also remove from localStorage
		const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
		const filtered = workouts.filter(workout => workout.id !== id);
		localStorage.setItem('workouts', JSON.stringify(filtered));
		
		await loadWorkouts();
	} catch (error) {
		console.error('[WORKOUT] Unexpected error deleting workout:', error);
		alert('An error occurred while deleting the workout. Please try again.');
	}
}

function editWorkout(workout) {
	if (!workout) return;
	currentWorkout = JSON.parse(JSON.stringify(workout));
	editingWorkoutId = workout.id;
	
	// CRITICAL: Preserve the original date string EXACTLY as it came from Supabase
	// Store it separately so it's never touched or converted
	if (workout.originalDate) {
		currentWorkout.originalDate = workout.originalDate;
	} else if (workout.date) {
		// If originalDate not set, extract it from the date field
		// This handles workouts loaded from Supabase (which stores as YYYY-MM-DD)
		if (typeof workout.date === 'string' && workout.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
			currentWorkout.originalDate = workout.date;
		} else {
			// Fallback: extract date part from ISO string
			const dateStr = workout.date.toString();
			if (dateStr.includes('T')) {
				currentWorkout.originalDate = dateStr.split('T')[0];
			} else {
				// Last resort: use local date components
				const date = new Date(workout.date);
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, '0');
				const day = String(date.getDate()).padStart(2, '0');
				currentWorkout.originalDate = `${year}-${month}-${day}`;
			}
		}
	}
	
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
			const isCardio = isCardioExercise(ex);
			const prevSets = Array.isArray(ex.sets) ? ex.sets.map(s => {
				if (isCardio) {
					return { 
						min: s.min ?? 0, 
						sec: s.sec ?? 0, 
						km: s.km ?? 0, 
						cal: s.cal ?? 0, 
						notes: s.notes ?? '' 
					};
				} else {
					return { weight: s.weight ?? 0, reps: s.reps ?? 0 };
				}
			}) : [];
			const sets = createDefaultSets(prevSets.length || DEFAULT_SET_COUNT, isCardio);
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
				// Convert weight from display unit to kg for storage
				const currentUnit = getWeightUnit();
				const value = convertWeightForStorage(parseFloat(weight), currentUnit);
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
	// Check if user is logged in
	if (supabaseClient) {
		const { data: { session } } = await supabaseClient.auth.getSession();
		if (!session) {
			showLoginScreen();
			return;
		}
	} else {
		showLoginScreen();
		return;
	}
	const progress = JSON.parse(localStorage.getItem('progress') || '[]');
	const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
	
	// Initialize unit label
	const unitLabel = document.getElementById('progress-unit-label');
	if (unitLabel) {
		unitLabel.textContent = getWeightUnitLabel().toLowerCase();
	}
	
	renderWeightChart(progress);
	renderWorkoutHeatmap(workouts);
	renderMonthlyHeatmap(workouts);
	initMonthlyHeatmapNavigation();
	await renderMuscleFocus(workouts);
	updateExerciseInsightsOptions(workouts);
	renderPRTimeline(workouts);
	renderProgressiveOverloadTracker(workouts);
}

function renderWeightChart(progress) {
	const canvas = document.getElementById('progress-chart');
	const empty = document.getElementById('progress-empty');
	const chartWrapper = document.querySelector('.progress-chart-wrapper');
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	
	// Update unit label in chart wrapper
	if (chartWrapper) {
		const unit = getWeightUnitLabel().toLowerCase();
		chartWrapper.setAttribute('data-unit', unit);
	}

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
	
	// Create points from all sorted data - show all dates that were entered
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

	// Scale X: if only 1 point, place it in the center; otherwise distribute across width
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
	
	// Set placeholder to last weight entry (convert to display unit)
	const weightInput = document.getElementById('progress-weight');
	if (weightInput && sorted.length > 0) {
		const lastEntry = sorted[sorted.length - 1];
		// Convert from stored kg to display unit
		const displayWeight = convertWeightForDisplay(lastEntry.weight);
		weightInput.placeholder = `${displayWeight}`;
	} else if (weightInput) {
		weightInput.placeholder = '';
	}
	
	// Update unit label dynamically
	const unitLabel = document.getElementById('progress-unit-label');
	if (unitLabel) {
		unitLabel.textContent = getWeightUnitLabel().toLowerCase();
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
			tooltip.textContent = `${labelDate} • ${convertWeightForDisplay(nearest.weight)} ${getWeightUnitLabel().toLowerCase()}`;
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
			const apiUrl = getApiUrl('/exercise-info');
			const res = await fetch(apiUrl, {
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
	
	// Now calculate muscle totals (exclude Cardio)
	const muscleTotals = {};
	filtered.forEach(workout => {
		(workout.exercises || []).forEach(ex => {
			// Skip cardio exercises
			if (isCardioExercise(ex)) return;
			const muscles = ex.muscles || [];
			// Filter out Cardio from muscles array
			const filteredMuscles = muscles.filter(m => m.toLowerCase() !== 'cardio');
			if (filteredMuscles.length === 0) return;
			const sets = ex.sets || [];
			const volume = sets.length || 1;
			const primary = filteredMuscles[0];
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
					<span>${convertWeightForDisplay(bestWeightSet.weight)} ${getWeightUnitLabel().toLowerCase()} × ${bestWeightSet.reps}</span>
				</div>
			</div>
			<div class="progress-pr-result">
				<div class="progress-pr-result-title">Top volume set</div>
				<div class="progress-pr-result-meta">
					<span><strong>${entry.name}</strong></span>
					<span>${convertWeightForDisplay(bestVolumeSet.weight)} ${getWeightUnitLabel().toLowerCase()} × ${bestVolumeSet.reps} (${formatVolume(bestVolumeSet.volume)})</span>
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
					<div class="progress-pr-timeline-value">${convertWeightForDisplay(pr.bestWeight)} ${getWeightUnitLabel().toLowerCase()} × ${pr.bestReps} reps</div>
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
	// Sort workouts by date first (newest first) to ensure correct order
	const sortedWorkouts = [...workouts].sort((a, b) => {
		const dateA = new Date(a.date || 0).getTime();
		const dateB = new Date(b.date || 0).getTime();
		return dateB - dateA; // Newest first
	});
	
	sortedWorkouts.forEach(workout => {
		if (!workout.exercises || !workout.date) return;
		// Parse date as YYYY-MM-DD string to avoid timezone issues
		let workoutDate;
		if (typeof workout.date === 'string' && workout.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
			// Use noon to avoid timezone issues
			workoutDate = new Date(workout.date + 'T12:00:00');
		} else {
			workoutDate = new Date(workout.date);
		}
		
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
							date: workoutDate.getTime(), // Store as timestamp for reliable sorting
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
	
	// Filter exercises with at least 2 workouts and sort by date (newest first)
	const exercisesWithData = Object.entries(exerciseData)
		.filter(([_, data]) => data.bestSetsPerWorkout.length >= 2)
		.map(([key, data]) => ({
			key,
			display: data.display,
			bestSetsPerWorkout: data.bestSetsPerWorkout.sort((a, b) => b.date - a.date) // Newest first
		}));
	
	if (exercisesWithData.length === 0) {
		container.innerHTML = '<div class="progress-pr-empty">Complete more workouts to track your progress.</div>';
		return;
	}
	
	// Analyze trend for each exercise - compare last workout with previous workout
	const trends = exercisesWithData.map(ex => {
		const bestSets = ex.bestSetsPerWorkout;
		
		// Remove duplicates by workoutId to ensure we only compare unique workouts
		const uniqueSets = [];
		const seenWorkoutIds = new Set();
		for (const set of bestSets) {
			if (!seenWorkoutIds.has(set.workoutId)) {
				seenWorkoutIds.add(set.workoutId);
				uniqueSets.push(set);
			}
		}
		
		const workoutCount = uniqueSets.length;
		
		// Get the last two unique workouts (most recent and previous)
		// bestSets is already sorted newest first, so index 0 is most recent
		const lastWorkout = uniqueSets[0];
		const previousWorkout = uniqueSets[1];
		
		// If we only have one workout, can't calculate change
		if (!previousWorkout) {
			const singleWeight = parseFloat(lastWorkout.weight) || 0;
			const singleReps = parseInt(lastWorkout.reps) || 0;
			return {
				key: ex.key,
				display: ex.display,
				status: 'plateau',
				statusClass: 'plateau',
				statusText: 'Stable',
				changePercent: '0.0',
				recentBest: `${convertWeightForDisplay(singleWeight)}${getWeightUnitLabel().toLowerCase()} × ${singleReps}`,
				oldBest: `${convertWeightForDisplay(singleWeight)}${getWeightUnitLabel().toLowerCase()} × ${singleReps}`,
				workoutCount: workoutCount
			};
		}
		
		// Ensure weight and reps are numbers for accurate comparison
		const lastWeight = parseFloat(lastWorkout.weight) || 0;
		const lastReps = parseInt(lastWorkout.reps) || 0;
		const previousWeight = parseFloat(previousWorkout.weight) || 0;
		const previousReps = parseInt(previousWorkout.reps) || 0;
		
		// Recalculate volumes to ensure accuracy
		const lastVolume = lastWeight * lastReps;
		const previousVolume = previousWeight * previousReps;
		
		// If weight and reps are exactly the same, change is 0%
		let changePercent = 0;
		if (lastWeight === previousWeight && lastReps === previousReps) {
			changePercent = 0;
		} else {
			// Calculate percentage change based on volume
			changePercent = previousVolume > 0 ? ((lastVolume - previousVolume) / previousVolume) * 100 : 0;
		}
		
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
			recentBest: `${convertWeightForDisplay(lastWeight)}${getWeightUnitLabel().toLowerCase()} × ${lastReps}`,
			oldBest: `${convertWeightForDisplay(previousWeight)}${getWeightUnitLabel().toLowerCase()} × ${previousReps}`,
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
// Track if logout is already initialized to prevent duplicate listeners
let logoutInitialized = false;

function initLogout() {
	const btn = document.getElementById('logout-btn');
	if (!btn) return;
	
	// If already initialized, remove old listener first
	if (logoutInitialized) {
		// Clone button to remove all listeners
		const newBtn = btn.cloneNode(true);
		btn.parentNode.replaceChild(newBtn, btn);
		// Update reference
		const updatedBtn = document.getElementById('logout-btn');
		if (!updatedBtn) return;
		updatedBtn.addEventListener('click', handleLogoutClick);
		return;
	}
	
	// First time initialization
	btn.addEventListener('click', handleLogoutClick);
	logoutInitialized = true;
}

async function handleLogoutClick(e) {
	e.preventDefault();
	e.stopPropagation();
	
			if (confirm('Are you sure you want to log out?')) {
			await logout();
			}
	}

// ========== SETTINGS ==========
function initSettings() {
	initLogout(); // Initialize logout button
	initSettingsToggles();
	initDeleteAccount();
}

function initSettingsToggles() {
	// Notifications toggle
	const notificationsToggle = document.getElementById('settings-notifications-toggle');
	if (notificationsToggle) {
		// Load saved state
		const saved = localStorage.getItem('settings-notifications') === 'true';
		notificationsToggle.checked = saved;
		notificationsToggle.addEventListener('change', async (e) => {
			localStorage.setItem('settings-notifications', e.target.checked);
			if (e.target.checked) {
				// Request notification permission
				await requestNotificationPermission();
				// Schedule notifications when enabled
				await scheduleDailyNotifications();
				await scheduleWeeklyNotifications();
			} else {
				// Cancel all notifications when disabled
				if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
					try {
						await window.Capacitor.Plugins.LocalNotifications.cancel({
							notifications: [{ id: 100 }, { id: 200 }]
						});
					} catch (error) {
						console.error('[NOTIFICATIONS] Failed to cancel notifications:', error);
					}
				}
			}
		});
		// Request permission on load if enabled
		if (saved) {
			requestNotificationPermission();
		}
	}
	
	// Rest timer toggle
	const restTimerToggle = document.getElementById('settings-rest-timer-toggle');
	if (restTimerToggle) {
		// Load saved state
		const saved = localStorage.getItem('settings-rest-timer') === 'true';
		restTimerToggle.checked = saved;
		restTimerToggle.addEventListener('change', (e) => {
			localStorage.setItem('settings-rest-timer', e.target.checked);
		});
	}
	
	// Gym/Sportschool input
	initGymInput();
	
	// Data collection consent toggle
	initDataConsentToggle();
}

// Initialize gym/sportschool input with backend-proxied Google Places suggestions
async function initGymInput() {
	const gymInput = document.getElementById('settings-gym-input');
	const dropdown = document.getElementById('gym-autocomplete-dropdown');
	
	if (!gymInput) {
		console.warn('[GYM INPUT] Input field not found!');
		return;
	}
	
	console.log('[GYM INPUT] Initializing gym input field (backend suggestions)');
	
	// Load saved gym name
	loadGymName().then(gymName => {
		if (gymName) {
			gymInput.value = gymName;
			console.log('[GYM INPUT] Loaded gym name:', gymName);
		}
	});
	
	// Always use backend-proxied suggestions (API key stays server-side)
	setupBackendGymAutocomplete(gymInput, dropdown);
}

function setupBackendGymAutocomplete(gymInput, dropdown) {
	let debounceTimer = null;
	let lastQuery = '';
	let lastResults = [];

	async function fetchSuggestions(query) {
		const apiUrl = getApiUrl(`/api/gym-suggestions?q=${encodeURIComponent(query)}`);
		const res = await fetch(apiUrl);
		const data = await res.json().catch(() => ({}));
		return (data && data.predictions) ? data.predictions : [];
	}

	function render(predictions) {
		if (!dropdown) return;
		dropdown.innerHTML = '';
		if (!predictions || predictions.length === 0) {
			dropdown.style.display = 'none';
			return;
		}
		predictions.slice(0, 6).forEach((p) => {
			const item = document.createElement('div');
			item.className = 'gym-autocomplete-item';
			item.innerHTML = `
				<div class="gym-autocomplete-item-name">${p.main_text || p.description || ''}</div>
				<div class="gym-autocomplete-item-address">${p.secondary_text || ''}</div>
			`;
			item.addEventListener('click', async () => {
				gymInput.value = (p.main_text || p.description || '').trim();
				if (p.place_id) gymInput.dataset.placeId = p.place_id;
				dropdown.style.display = 'none';
				await saveGymName(gymInput.value, gymInput.dataset.placeId || null);
			});
			dropdown.appendChild(item);
		});
		dropdown.style.display = 'block';
	}

	gymInput.addEventListener('input', (e) => {
		const query = (e.target.value || '').trim();
		gymInput.dataset.placeId = ''; // reset unless user selects again
		if (query.length < 2) {
			if (dropdown) dropdown.style.display = 'none';
			return;
		}
		lastQuery = query;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(async () => {
			try {
				const results = await fetchSuggestions(query);
				// ignore out-of-order responses
				if (query !== lastQuery) return;
				lastResults = results || [];
				render(lastResults);
			} catch (err) {
				console.warn('[GYM INPUT] Suggestions failed:', err);
				if (dropdown) dropdown.style.display = 'none';
			}
		}, 200);
	});

	// Hide dropdown when clicking outside
	document.addEventListener('click', (e) => {
		if (dropdown && !gymInput.contains(e.target) && !dropdown.contains(e.target)) {
			dropdown.style.display = 'none';
		}
	});

	// Save on blur; if user didn't pick, we still save typed value (best-effort)
	gymInput.addEventListener('blur', async () => {
		const gymName = gymInput.value.trim();
		if (gymName) {
			await saveGymName(gymName, gymInput.dataset.placeId || null);
		}
	});

	// Save on Enter key
	gymInput.addEventListener('keypress', async (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			gymInput.blur();
		}
	});
}

function setupManualInput(gymInput) {
	// Fallback: manual input only
	gymInput.addEventListener('blur', async () => {
		const gymName = gymInput.value.trim();
		if (gymName) {
			console.log('[GYM INPUT] Saving gym name (manual input):', gymName);
			await saveGymName(gymName);
		}
	});
	
	// Also save on Enter key
	gymInput.addEventListener('keypress', async (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			gymInput.blur();
		}
	});
}

// Initialize data collection consent toggle
function initDataConsentToggle() {
	const consentToggle = document.getElementById('settings-data-consent-toggle');
	if (!consentToggle) return;
	
	// Load saved consent state
	loadDataConsent().then(hasConsent => {
		consentToggle.checked = hasConsent;
	});
	
	consentToggle.addEventListener('change', async (e) => {
		const hasConsent = e.target.checked;
		await saveDataConsent(hasConsent);
		
		// If consent is given, also save gym name if it exists
		if (hasConsent) {
			const gymInput = document.getElementById('settings-gym-input');
			if (gymInput && gymInput.value.trim()) {
				await saveGymName(gymInput.value.trim());
			}
		}
	});
}

// Save gym name to Supabase user_metadata and sync to analytics table
async function saveGymName(gymName, placeId = null) {
	if (!supabaseClient) {
		await initSupabase();
	}
	if (!supabaseClient) {
		console.warn('[GYM] Supabase not available, saving to localStorage only');
		localStorage.setItem('user-gym-name', gymName);
		return;
	}
	
	try {
		const { data: { session } } = await supabaseClient.auth.getSession();
		if (!session) {
			// Not logged in, save to localStorage only
			localStorage.setItem('user-gym-name', gymName);
			return;
		}
		
		// Call backend endpoint to update user_metadata and sync to analytics table
		const apiUrl = getApiUrl('/api/collect-gym-data');
		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				gym_name: gymName || null,
				gym_place_id: placeId || null
			})
		});
		
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			console.error('[GYM] Error saving gym name:', errorData);
			// Fallback to localStorage
			localStorage.setItem('user-gym-name', gymName);
		} else {
			console.log('[GYM] Gym name saved and synced successfully');
			// Also save to localStorage as backup
			if (gymName) {
				localStorage.setItem('user-gym-name', gymName);
			} else {
				localStorage.removeItem('user-gym-name');
			}
		}
	} catch (e) {
		console.error('[GYM] Error saving gym name:', e);
		// Fallback to localStorage
		localStorage.setItem('user-gym-name', gymName);
	}
}

// Load gym name from Supabase user_metadata or localStorage
async function loadGymName() {
	if (!supabaseClient) {
		await initSupabase();
	}
	if (!supabaseClient) {
		return localStorage.getItem('user-gym-name') || '';
	}
	
	try {
		const { data: { session } } = await supabaseClient.auth.getSession();
		if (!session) {
			return localStorage.getItem('user-gym-name') || '';
		}
		
		const gymName = session.user.user_metadata?.gym_name || '';
		if (gymName) {
			// Also update localStorage as backup
			localStorage.setItem('user-gym-name', gymName);
			return gymName;
		}
		
		// Fallback to localStorage
		return localStorage.getItem('user-gym-name') || '';
	} catch (e) {
		console.error('[GYM] Error loading gym name:', e);
		return localStorage.getItem('user-gym-name') || '';
	}
}

// Save data collection consent to Supabase user_metadata and sync to analytics table
async function saveDataConsent(hasConsent) {
	if (!supabaseClient) {
		await initSupabase();
	}
	if (!supabaseClient) {
		console.warn('[CONSENT] Supabase not available, saving to localStorage only');
		localStorage.setItem('user-data-consent', hasConsent ? 'true' : 'false');
		return;
	}
	
	try {
		const { data: { session } } = await supabaseClient.auth.getSession();
		if (!session) {
			// Not logged in, save to localStorage only
			localStorage.setItem('user-data-consent', hasConsent ? 'true' : 'false');
			return;
		}
		
		// Call backend endpoint to update user_metadata and sync to analytics table
		const apiUrl = getApiUrl('/api/collect-gym-data');
		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${session.access_token}`
			},
			body: JSON.stringify({
				data_consent: hasConsent
			})
		});
		
		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			console.error('[CONSENT] Error saving consent:', errorData);
			// Fallback to localStorage
			localStorage.setItem('user-data-consent', hasConsent ? 'true' : 'false');
		} else {
			console.log('[CONSENT] Consent saved and synced successfully');
			// Also save to localStorage as backup
			localStorage.setItem('user-data-consent', hasConsent ? 'true' : 'false');
		}
	} catch (e) {
		console.error('[CONSENT] Error saving consent:', e);
		// Fallback to localStorage
		localStorage.setItem('user-data-consent', hasConsent ? 'true' : 'false');
	}
}

// Load data collection consent from Supabase user_metadata or localStorage
async function loadDataConsent() {
	if (!supabaseClient) {
		await initSupabase();
	}
	if (!supabaseClient) {
		return localStorage.getItem('user-data-consent') === 'true';
	}
	
	try {
		const { data: { session } } = await supabaseClient.auth.getSession();
		if (!session) {
			return localStorage.getItem('user-data-consent') === 'true';
		}
		
		const consent = session.user.user_metadata?.data_collection_consent;
		if (consent !== undefined) {
			// Also update localStorage as backup
			localStorage.setItem('user-data-consent', consent ? 'true' : 'false');
			return consent === true;
		}
		
		// Fallback to localStorage
		return localStorage.getItem('user-data-consent') === 'true';
	} catch (e) {
		console.error('[CONSENT] Error loading consent:', e);
		return localStorage.getItem('user-data-consent') === 'true';
	}
	
	// Weight unit toggle (kg/lbs)
	const unitToggle = document.getElementById('settings-unit-toggle');
	if (unitToggle) {
		// Load saved state (default to kg = false/left, lbs = true/right)
		const savedUnit = getWeightUnit(); // Uses 'kg' as default for new accounts
		unitToggle.checked = savedUnit === 'lbs'; // Right (purple) = lbs, Left = kg
		unitToggle.addEventListener('change', (e) => {
			const unit = e.target.checked ? 'lbs' : 'kg'; // Right (purple) = lbs, Left = kg
			localStorage.setItem('settings-weight-unit', unit);
			
			// Update weight chart unit label
			const chartWrapper = document.querySelector('.progress-chart-wrapper');
			if (chartWrapper) {
				const unitLabel = getWeightUnitLabel().toLowerCase();
				chartWrapper.setAttribute('data-unit', unitLabel);
			}
			
			// Reload progress to update chart with new units
			loadProgress();
			// Update progress unit label immediately
			const unitLabel = document.getElementById('progress-unit-label');
			if (unitLabel) {
				unitLabel.textContent = getWeightUnitLabel().toLowerCase();
			}
			// Refresh all displays to show converted weights
			if (currentTab === 'workout-builder' && currentWorkout) {
				renderWorkoutList();
			}
			if (currentTab === 'workouts') {
				loadWorkouts();
			}
			if (currentTab === 'progress') {
				loadProgress();
			}
		});
	}
}

// ========== REST TIMER ==========
let restTimerInterval = null;
let restTimerSeconds = 0;
let restTimerRunning = false;
let scheduledNotificationId = null;
let restTimerStartTime = null; // Track when timer started for background accuracy
let restTimerInitialSeconds = 0; // Store initial seconds when timer starts

function initRestTimer() {
	const overlay = document.getElementById('rest-timer-overlay');
	const closeBtn = document.getElementById('rest-timer-close');
	const startBtn = document.getElementById('rest-timer-start');
	const add30SecBtn = document.getElementById('rest-timer-add-30sec');
	const subtract30SecBtn = document.getElementById('rest-timer-subtract-30sec');
	const timeDisplay = document.getElementById('rest-timer-time');
	
	if (!overlay || !closeBtn || !startBtn || !add30SecBtn || !subtract30SecBtn || !timeDisplay) return;
	
	// Close button
	closeBtn.addEventListener('click', () => {
		stopRestTimer();
		overlay.classList.add('hidden');
	});
	
	// Start/Pause button
	startBtn.addEventListener('click', () => {
		if (restTimerRunning) {
			pauseRestTimer();
		} else {
			startRestTimer();
		}
	});
	
	// Add 30 seconds button
	add30SecBtn.addEventListener('click', async () => {
		if (restTimerRunning && restTimerStartTime) {
			// Timer is running - calculate current remaining time and add 30 seconds
			const elapsed = Math.floor((Date.now() - restTimerStartTime) / 1000);
			const currentRemaining = Math.max(0, restTimerInitialSeconds - elapsed);
			restTimerSeconds = currentRemaining + 30;
			restTimerInitialSeconds = restTimerSeconds;
			restTimerStartTime = Date.now(); // Reset start time
			await scheduleRestTimerNotification(restTimerSeconds);
		} else {
			// Timer is not running - just add 30 seconds
			restTimerSeconds += 30;
		}
		updateRestTimerDisplay();
	});
	
	// Subtract 30 seconds button
	subtract30SecBtn.addEventListener('click', async () => {
		if (restTimerRunning && restTimerStartTime) {
			// Timer is running - calculate current remaining time and subtract 30 seconds
			const elapsed = Math.floor((Date.now() - restTimerStartTime) / 1000);
			const currentRemaining = Math.max(0, restTimerInitialSeconds - elapsed);
			restTimerSeconds = Math.max(0, currentRemaining - 30);
			restTimerInitialSeconds = restTimerSeconds;
			restTimerStartTime = Date.now(); // Reset start time
			if (restTimerSeconds > 0) {
			await scheduleRestTimerNotification(restTimerSeconds);
			} else {
				// Timer reached 0, stop it
				stopRestTimer();
				showRestTimerComplete();
		}
		} else {
			// Timer is not running - just subtract 30 seconds
			restTimerSeconds = Math.max(0, restTimerSeconds - 30);
		}
		updateRestTimerDisplay();
	});
	
	// Update display initially
	updateRestTimerDisplay();
}

async function startRestTimer() {
	// Prevent multiple intervals
	if (restTimerInterval) {
		clearInterval(restTimerInterval);
		restTimerInterval = null;
	}
	
	if (restTimerSeconds === 0) {
		restTimerSeconds = 180; // Default to 3 minutes
		restTimerInitialSeconds = 180;
	} else if (restTimerInitialSeconds === 0) {
		// If initialSeconds is 0 but restTimerSeconds has a value, set it
		restTimerInitialSeconds = restTimerSeconds;
	}
	
	// If timer is already running, don't reset it - just ensure it continues
	if (restTimerRunning && restTimerStartTime) {
		// Timer is already running - don't reset, just ensure interval is active
		if (!restTimerInterval) {
			// Restart interval if it was cleared (e.g., after app comes back from background)
			restTimerInterval = setInterval(() => {
				if (restTimerRunning && restTimerStartTime) {
					const elapsed = Math.floor((Date.now() - restTimerStartTime) / 1000);
					const remaining = Math.max(0, restTimerInitialSeconds - elapsed);
					restTimerSeconds = remaining;
					updateRestTimerDisplay();
					
					if (remaining === 0) {
						stopRestTimer();
						showRestTimerComplete();
					}
				}
			}, 100);
		}
		return; // Don't restart timer if it's already running
	}
	
	restTimerRunning = true;
	restTimerStartTime = Date.now(); // Track start time for accurate timing
	restTimerInitialSeconds = restTimerSeconds; // Store initial value
	const startBtn = document.getElementById('rest-timer-start');
	if (startBtn) startBtn.textContent = 'Pause';
	
	// Schedule notification for when timer reaches 00:00 (works even when app is in background)
	await scheduleRestTimerNotification(restTimerSeconds);
	
	// Timer based on elapsed time - always accurate, even in background
	restTimerInterval = setInterval(() => {
		if (restTimerRunning && restTimerStartTime) {
			// Calculate elapsed time since start
			const elapsed = Math.floor((Date.now() - restTimerStartTime) / 1000);
			const remaining = Math.max(0, restTimerInitialSeconds - elapsed);
			
			// Always update display (even if value didn't change, for smooth updates)
			restTimerSeconds = remaining;
			updateRestTimerDisplay();
			
			if (remaining === 0) {
				// Timer finished
				stopRestTimer();
				showRestTimerComplete();
			}
		}
	}, 100); // Check every 100ms for smooth updates, but calculate based on elapsed time
}

async function pauseRestTimer() {
	restTimerRunning = false;
	// Update initial seconds to current remaining time for resume
	if (restTimerStartTime) {
		const elapsed = Math.floor((Date.now() - restTimerStartTime) / 1000);
		restTimerInitialSeconds = Math.max(0, restTimerInitialSeconds - elapsed);
		restTimerSeconds = restTimerInitialSeconds;
	}
	restTimerStartTime = null; // Clear start time
	const startBtn = document.getElementById('rest-timer-start');
	if (startBtn) startBtn.textContent = 'Start';
	
	if (restTimerInterval) {
		clearInterval(restTimerInterval);
		restTimerInterval = null;
	}
	
	// Cancel scheduled notification when paused
	await cancelRestTimerNotification();
}

async function stopRestTimer() {
	restTimerRunning = false;
	restTimerStartTime = null; // Clear start time
	restTimerInitialSeconds = 0;
	const startBtn = document.getElementById('rest-timer-start');
	if (startBtn) startBtn.textContent = 'Start';
	
	if (restTimerInterval) {
		clearInterval(restTimerInterval);
		restTimerInterval = null;
	}
	
	// Cancel scheduled notification when stopped
	await cancelRestTimerNotification();
	
	restTimerSeconds = 0;
	updateRestTimerDisplay();
}

function updateRestTimerDisplay() {
	const timeDisplay = document.getElementById('rest-timer-time');
	if (!timeDisplay) return;
	
	const minutes = Math.floor(restTimerSeconds / 60);
	const seconds = restTimerSeconds % 60;
	timeDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Schedule notification for when timer completes (works in background)
async function scheduleRestTimerNotification(secondsRemaining) {
	if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.LocalNotifications) {
		return;
	}
	
	try {
		// Cancel any existing notification first
		await cancelRestTimerNotification();
		
		// Calculate when the timer will reach 00:00
		const triggerTime = new Date(Date.now() + (secondsRemaining * 1000));
		
		console.log('[REST TIMER] Scheduling notification for:', triggerTime.toISOString(), '(', secondsRemaining, 'seconds from now)');
		
		// Schedule notification
		await window.Capacitor.Plugins.LocalNotifications.schedule({
			notifications: [{
				title: 'Rest Timer',
				body: 'Rest time is complete!',
				id: 1,
				schedule: {
					at: triggerTime
				},
				sound: 'default'
			}]
		});
		
		scheduledNotificationId = 1;
		console.log('[REST TIMER] Notification scheduled successfully');
	} catch (error) {
		console.error('[REST TIMER] Failed to schedule notification:', error);
	}
}

// Cancel scheduled notification
async function cancelRestTimerNotification() {
	if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.LocalNotifications) {
		return;
	}
	
	if (scheduledNotificationId !== null) {
		try {
			await window.Capacitor.Plugins.LocalNotifications.cancel({
				notifications: [{ id: scheduledNotificationId }]
			});
			console.log('[REST TIMER] Cancelled scheduled notification');
			scheduledNotificationId = null;
		} catch (error) {
			console.error('[REST TIMER] Failed to cancel notification:', error);
		}
	}
}

function showRestTimerComplete() {
	// This is called when timer reaches 00:00 while app is active
	// The scheduled notification will also fire if app is in background
	
	// Show alert if app is active (notification will also show)
	if (!document.hidden) {
		// App is visible, notification will show automatically
		console.log('[REST TIMER] Timer complete - notification should show');
	}
	
	// Vibrate if available
	if (navigator.vibrate) {
		navigator.vibrate([200, 100, 200]);
	}
	
	// Clear scheduled notification ID since it has fired
	scheduledNotificationId = null;
}

// Function to open rest timer (called from workout)
// IMPORTANT: This only opens the overlay, does NOT start the timer automatically
function openRestTimer() {
	const overlay = document.getElementById('rest-timer-overlay');
	if (!overlay) return;
	
	// Hide keyboard by blurring active input field
	if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
		document.activeElement.blur();
	}
	
	// Don't reset timer if it's already running - just show the overlay
	if (restTimerRunning && restTimerStartTime) {
		// Timer is running - just update display with current remaining time
		const elapsed = Math.floor((Date.now() - restTimerStartTime) / 1000);
		const remaining = Math.max(0, restTimerInitialSeconds - elapsed);
		restTimerSeconds = remaining;
		updateRestTimerDisplay();
		overlay.classList.remove('hidden');
		const startBtn = document.getElementById('rest-timer-start');
		if (startBtn) startBtn.textContent = 'Pause';
		return;
	}
	
	// Timer is not running - set default if needed
	overlay.classList.remove('hidden');
	if (restTimerSeconds === 0) {
		restTimerSeconds = 180; // Default 3 minutes
		restTimerInitialSeconds = 60;
	} else {
		// If timer has a value but initialSeconds is 0, set it
		if (restTimerInitialSeconds === 0) {
			restTimerInitialSeconds = restTimerSeconds;
		}
	}
	updateRestTimerDisplay();
	
	// Ensure start button shows "Start" (timer should NOT auto-start)
	const startBtn = document.getElementById('rest-timer-start');
	if (startBtn) startBtn.textContent = 'Start';
}

// Check if set is complete and trigger rest timer if enabled
function checkAndTriggerRestTimer(set, weightValue, repsValue, exercise) {
	const restTimerEnabled = localStorage.getItem('settings-rest-timer') === 'true';
	if (!restTimerEnabled) return;
	
	const isBodyweight = exercise ? isBodyweightExercise(exercise) : false;
	
	// For bodyweight: only need reps
	// For weighted: need both weight AND reps
	const hasWeight = weightValue != null && weightValue !== '' && weightValue !== '0';
	const hasReps = repsValue != null && repsValue !== '' && repsValue !== '0';
	
	const isComplete = isBodyweight ? hasReps : (hasWeight && hasReps);
	
	if (isComplete) {
		// Small delay to let user finish typing
		setTimeout(() => {
			openRestTimer();
		}, 800);
	}
}

// ========== NOTIFICATIONS ==========
async function requestNotificationPermission() {
	if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
		try {
			const result = await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
			if (result.display === 'granted') {
				console.log('Notification permission granted');
				return true;
			} else {
				console.log('Notification permission denied');
				return false;
			}
		} catch (e) {
			console.error('Failed to request notification permission:', e);
			return false;
		}
	} else if ('Notification' in window) {
		// Web browser fallback
		if (Notification.permission === 'default') {
			const permission = await Notification.requestPermission();
			return permission === 'granted';
		}
		return Notification.permission === 'granted';
	}
	return false;
}

// ========== DAILY & WEEKLY NOTIFICATIONS ==========

// Check if user worked out today
function hasWorkedOutToday() {
	const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayKey = today.toISOString().split('T')[0];
	
	return workouts.some(w => {
		const workoutDate = new Date(w.date);
		workoutDate.setHours(0, 0, 0, 0);
		return workoutDate.toISOString().split('T')[0] === todayKey;
	});
}

// Calculate weekly stats (for Sunday notification)
function calculateWeeklyStats() {
	const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
	
	// Get start of this week (Monday)
	const now = new Date();
	const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
	const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
	const weekStart = new Date(now);
	weekStart.setDate(now.getDate() - daysFromMonday);
	weekStart.setHours(0, 0, 0, 0);
	
	// Get end of week (Sunday)
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekStart.getDate() + 6);
	weekEnd.setHours(23, 59, 59, 999);
	
	// Filter workouts from this week
	const weekWorkouts = workouts.filter(w => {
		const workoutDate = new Date(w.date);
		return workoutDate >= weekStart && workoutDate <= weekEnd;
	});
	
	// Calculate stats
	const workoutCount = weekWorkouts.length;
	const exerciseCount = weekWorkouts.reduce((sum, w) => {
		return sum + (w.exercises?.length || 0);
	}, 0);
	const totalVolume = weekWorkouts.reduce((sum, w) => {
		return sum + (calculateWorkoutVolume(w) || 0);
	}, 0);
	
	return {
		workouts: workoutCount,
		exercises: exerciseCount,
		volume: totalVolume
	};
}

// Schedule daily workout reminder (18:00 every day)
async function scheduleDailyNotifications() {
	if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.LocalNotifications) {
		return;
	}
	
	// Check if notifications are enabled
	const notificationsEnabled = localStorage.getItem('settings-notifications') === 'true';
	if (!notificationsEnabled) {
		console.log('[NOTIFICATIONS] Daily notifications disabled');
		return;
	}
	
	try {
		// Cancel existing daily notifications first
		await window.Capacitor.Plugins.LocalNotifications.cancel({
			notifications: [{ id: 100 }] // Daily reminder ID = 100
		});
		
		// Get current streak
		const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
		const streak = calculateStreak(workouts);
		const hasWorkoutToday = hasWorkedOutToday();
		
		// Only schedule if user hasn't worked out today
		if (hasWorkoutToday) {
			console.log('[NOTIFICATIONS] User already worked out today, skipping daily reminder');
			return;
		}
		
		// Calculate next 18:00
		const now = new Date();
		const reminderTime = new Date(now);
		reminderTime.setHours(18, 0, 0, 0);
		
		// If it's already past 18:00 today, schedule for tomorrow
		if (now >= reminderTime) {
			reminderTime.setDate(reminderTime.getDate() + 1);
		}
		
		// Build notification message based on streak
		let title = 'Time to work out! 💪';
		let body = '';
		if (streak > 0) {
			body = `Don't lose your ${streak} day streak! 🔥`;
		} else {
			body = 'Start your workout streak! 🔥';
		}
		
		console.log('[NOTIFICATIONS] Scheduling daily reminder for:', reminderTime.toISOString());
		
		// Schedule notification - use 'every: day' for daily repeats
		await window.Capacitor.Plugins.LocalNotifications.schedule({
			notifications: [{
				title: title,
				body: body,
				id: 100,
				schedule: {
					at: reminderTime,
					every: 'day' // Repeat daily
				},
				sound: 'default'
			}]
		});
		
		console.log('[NOTIFICATIONS] Daily reminder scheduled successfully');
	} catch (error) {
		console.error('[NOTIFICATIONS] Failed to schedule daily reminder:', error);
	}
}

// Schedule weekly stats notification (Sunday 20:00)
async function scheduleWeeklyNotifications() {
	if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.LocalNotifications) {
		return;
	}
	
	// Check if notifications are enabled
	const notificationsEnabled = localStorage.getItem('settings-notifications') === 'true';
	if (!notificationsEnabled) {
		console.log('[NOTIFICATIONS] Weekly notifications disabled');
		return;
	}
	
	try {
		// Cancel existing weekly notifications first
		await window.Capacitor.Plugins.LocalNotifications.cancel({
			notifications: [{ id: 200 }] // Weekly stats ID = 200
		});
		
		// Calculate next Sunday 20:00
		const now = new Date();
		const nextSunday = new Date(now);
		const daysUntilSunday = (7 - now.getDay()) % 7 || 7; // 0 = Sunday, so if today is Sunday, next is in 7 days
		nextSunday.setDate(now.getDate() + daysUntilSunday);
		nextSunday.setHours(20, 0, 0, 0);
		nextSunday.setMinutes(0, 0, 0);
		
		// If today is Sunday and it's before 20:00, schedule for today
		if (now.getDay() === 0 && now.getHours() < 20) {
			nextSunday.setDate(now.getDate());
		}
		
		console.log('[NOTIFICATIONS] Scheduling weekly stats for:', nextSunday.toISOString());
		
		// Calculate current week stats
		const stats = calculateWeeklyStats();
		const volumeLabel = formatVolume(stats.volume);
		
		// Schedule notification - use 'every: week' with 'on: weekday' for weekly repeats
		// Note: Stats are calculated at scheduling time, not at notification time
		await window.Capacitor.Plugins.LocalNotifications.schedule({
			notifications: [{
				title: 'Your weekly stats',
				body: `${stats.workouts} workouts, ${stats.exercises} exercises, ${volumeLabel} volume`,
				id: 200,
				schedule: {
					at: nextSunday,
					every: 'week',
					on: {
						weekday: 1, // Sunday (1 = Sunday in Capacitor)
						hour: 20,
						minute: 0
					}
				},
				sound: 'default'
			}]
		});
		
		console.log('[NOTIFICATIONS] Weekly stats scheduled successfully');
	} catch (error) {
		console.error('[NOTIFICATIONS] Failed to schedule weekly stats:', error);
	}
}

// Update daily notification when workout is saved (check if user worked out today)
async function updateDailyNotificationIfNeeded() {
	const notificationsEnabled = localStorage.getItem('settings-notifications') === 'true';
	if (!notificationsEnabled) return;
	
	// If user worked out today, cancel today's reminder and reschedule for tomorrow
	if (hasWorkedOutToday()) {
		try {
			await window.Capacitor.Plugins.LocalNotifications.cancel({
				notifications: [{ id: 100 }]
			});
			// Reschedule for tomorrow (will check again if user worked out)
			await scheduleDailyNotifications();
		} catch (error) {
			console.error('[NOTIFICATIONS] Failed to update daily notification:', error);
		}
	}
}

function initDeleteAccount() {
	const btn = document.getElementById('delete-account-btn');
	if (!btn) return;
	
	btn.addEventListener('click', async () => {
		if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
			try {
				const { data: { session } } = await supabaseClient.auth.getSession();
				if (!session) {
					alert('You must be logged in to delete your account.');
					return;
				}
				
				const response = await fetch('/delete-account', {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${session.access_token}`,
						'Content-Type': 'application/json'
					}
				});
				
				const data = await response.json();
				if (response.ok && data.success) {
					alert('Account deleted successfully.');
					await logout();
				} else {
					alert(data.error || 'Failed to delete account. Please contact support.');
				}
			} catch (e) {
				console.error('Delete account failed:', e);
				alert('Failed to delete account. Please try again or contact support.');
			}
		}
	});
}

// Calculate workout streak (consecutive days with workouts)
function calculateStreak(workouts) {
	if (!workouts || workouts.length === 0) return 0;
	
	// Sort workouts by date (newest first)
	const sorted = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date));
	
	// Get today's date at midnight
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	
	let streak = 0;
	let currentDate = new Date(today);
	
	// Check if there's a workout today
	const todayKey = currentDate.toISOString().split('T')[0];
	const hasWorkoutToday = sorted.some(w => {
		const workoutDate = new Date(w.date);
		workoutDate.setHours(0, 0, 0, 0);
		return workoutDate.toISOString().split('T')[0] === todayKey;
	});
	
	// If no workout today, start from yesterday
	if (!hasWorkoutToday) {
		currentDate.setDate(currentDate.getDate() - 1);
	}
	
	// Count consecutive days with workouts
	while (true) {
		const dateKey = currentDate.toISOString().split('T')[0];
		const hasWorkout = sorted.some(w => {
			const workoutDate = new Date(w.date);
			workoutDate.setHours(0, 0, 0, 0);
			return workoutDate.toISOString().split('T')[0] === dateKey;
		});
		
		if (!hasWorkout) break;
		
		streak++;
		currentDate.setDate(currentDate.getDate() - 1);
	}
	
	return streak;
}

// Calculate total workout hours
function calculateTotalHours(workouts) {
	if (!workouts || workouts.length === 0) return 0;
	
	const totalMs = workouts.reduce((sum, workout) => {
		return sum + (workout.duration || 0);
	}, 0);
	
	// Convert milliseconds to hours (rounded to 1 decimal)
	const hours = totalMs / (1000 * 60 * 60);
	return Math.round(hours * 10) / 10; // Round to 1 decimal
}

async function loadSettings() {
	// Check if user is logged in - but don't redirect, just return if not logged in
	if (supabaseClient) {
		const { data: { session } } = await supabaseClient.auth.getSession();
		if (!session) {
			// Don't show login screen here - switchTab already handles that
			// Just show placeholder data
			const usernameEl = document.getElementById('settings-username');
			const emailEl = document.getElementById('settings-email');
			if (usernameEl) usernameEl.textContent = '—';
			if (emailEl) emailEl.textContent = '—';
			return;
		}
	} else {
		// No supabase client - show placeholder
		const usernameEl = document.getElementById('settings-username');
		const emailEl = document.getElementById('settings-email');
		if (usernameEl) usernameEl.textContent = '—';
		if (emailEl) emailEl.textContent = '—';
		return;
	}
	
	// Load user info from Supabase
	try {
		console.log('[SETTINGS] Loading user data...');
		const user = await getUser();
		console.log('[SETTINGS] User result:', user ? user.email : 'null');
		
		const usernameEl = document.getElementById('settings-username');
		const emailEl = document.getElementById('settings-email');
		
		if (user) {
			if (usernameEl) {
				const username = user.user_metadata?.username || user.email?.split('@')[0] || '—';
				usernameEl.textContent = username;
				console.log('[SETTINGS] Username set:', username);
			}
			if (emailEl) {
				const email = user.email || '—';
				emailEl.textContent = email;
				console.log('[SETTINGS] Email set:', email);
			}
			
			// Load gym name
			const gymInput = document.getElementById('settings-gym-input');
			if (gymInput) {
				const gymName = user.user_metadata?.gym_name || localStorage.getItem('user-gym-name') || '';
				gymInput.value = gymName;
			}
			
			// Load data consent
			const consentToggle = document.getElementById('settings-data-consent-toggle');
			if (consentToggle) {
				const hasConsent = user.user_metadata?.data_collection_consent === true || localStorage.getItem('user-data-consent') === 'true';
				consentToggle.checked = hasConsent;
			}
		} else {
			// No user but session exists - show placeholder
			console.log('[SETTINGS] No user found but session exists - showing placeholder');
			if (usernameEl) usernameEl.textContent = '—';
			if (emailEl) emailEl.textContent = '—';
		}
	} catch (e) {
		console.error('[SETTINGS] Failed to load settings:', e);
		// On error, just show placeholder - don't redirect
				const usernameEl = document.getElementById('settings-username');
				const emailEl = document.getElementById('settings-email');
		if (usernameEl) usernameEl.textContent = '—';
		if (emailEl) emailEl.textContent = '—';
	}
	
	// Calculate and display dynamic stats
	try {
		const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
		
		// Calculate stats
		const streak = calculateStreak(workouts);
		const workoutCount = workouts.length;
		const totalHours = calculateTotalHours(workouts);
		
		// Update UI
		const streakEl = document.getElementById('settings-stat-streak');
		const workoutsEl = document.getElementById('settings-stat-workouts');
		const hoursEl = document.getElementById('settings-stat-hours');
		
		if (streakEl) streakEl.textContent = streak.toString();
		if (workoutsEl) workoutsEl.textContent = workoutCount.toString();
		if (hoursEl) hoursEl.textContent = totalHours.toString();
	} catch (e) {
		console.error('Failed to calculate stats:', e);
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
					btn.disabled = false;
					return;
				}
			} catch (error) {
				console.error('Failed to load exercise video:', error);
				alert('Could not load the exercise video. Please try again.');
				btn.disabled = false;
				return;
			} finally {
				btn.disabled = false;
			}
		}
		
		// Convert YouTube embed URL to watch URL
		// From: https://www.youtube.com/embed/VIDEO_ID
		// To: https://www.youtube.com/watch?v=VIDEO_ID
		let watchUrl = videoUrl;
		if (videoUrl.includes('youtube.com/embed/')) {
			const videoId = videoUrl.match(/embed\/([^?&#]+)/)?.[1];
			if (videoId) {
				watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
			}
		}
		
		// Open in browser/app (prefer Capacitor Browser, fallback to window.open)
		if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
			try {
				await window.Capacitor.Plugins.Browser.open({
					url: watchUrl,
					windowName: '_system' // Opens in system browser/app
				});
			} catch (error) {
				console.error('Failed to open browser:', error);
				// Fallback to window.open
				window.open(watchUrl, '_blank');
			}
		} else {
			// Web browser fallback
			window.open(watchUrl, '_blank');
		}
	});
}

async function fetchExerciseInfoByKey(exerciseKey) {
	const body = JSON.stringify({ exercise: exerciseKey });
	const apiUrl = getApiUrl('/exercise-info');
	const res = await fetch(apiUrl, {
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
	// Check if user is logged in
	if (supabaseClient) {
		const { data: { session } } = await supabaseClient.auth.getSession();
		if (!session) {
			// Don't show login screen for exercises - they're needed for workout builder
			// Just return empty array
			allExercises = [];
			return;
		}
	} else {
		allExercises = [];
		return;
	}
	try {
		const apiUrl = getApiUrl('/exercises');
		const res = await fetch(apiUrl);
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}: ${res.statusText}`);
		}
		const data = await res.json();
		allExercises = data.exercises || [];
		
		// Load custom exercises from localStorage and add to allExercises
		const customExercises = getCustomExercises();
		allExercises = [...allExercises, ...customExercises];
		
		console.log(`[DEBUG] Loaded ${allExercises.length} exercises (${customExercises.length} custom)`);
	} catch (e) {
		console.error('Failed to load exercises:', e);
		allExercises = []; // Set empty array on error
	}
}

// Custom exercises management
function getCustomExercises() {
	try {
		const stored = localStorage.getItem('custom-exercises');
		if (!stored) return [];
		return JSON.parse(stored);
	} catch (e) {
		console.error('Failed to load custom exercises:', e);
		return [];
	}
}

function saveCustomExercise(exercise) {
	const customExercises = getCustomExercises();
	// Check if exercise already exists (by key)
	const existingIndex = customExercises.findIndex(ex => ex.key === exercise.key);
	if (existingIndex >= 0) {
		customExercises[existingIndex] = exercise;
	} else {
		customExercises.push(exercise);
	}
	localStorage.setItem('custom-exercises', JSON.stringify(customExercises));
	// Update allExercises
	const index = allExercises.findIndex(ex => ex.key === exercise.key);
	if (index >= 0) {
		allExercises[index] = exercise;
	} else {
		allExercises.push(exercise);
	}
}

function deleteCustomExercise(exerciseKey) {
	const customExercises = getCustomExercises();
	const filtered = customExercises.filter(ex => ex.key !== exerciseKey);
	localStorage.setItem('custom-exercises', JSON.stringify(filtered));
	// Remove from allExercises
	allExercises = allExercises.filter(ex => ex.key !== exerciseKey);
}

function loadStreak() {
	// Calculate streak from actual workouts
	const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
	const streak = calculateStreak(workouts);
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
			
			// Check if file input is disabled (no credits)
			if (fileInput.disabled) {
				addAIDetectChatMessage('bot', 'You are out of your monthly credits', null);
				return;
			}
			
			// Check credits before starting
			const creditsInfo = await getUserCredits();
			if (creditsInfo.credits_remaining <= 0) {
				addAIDetectChatMessage('bot', 'You are out of your monthly credits', null);
				updateAIDetectButtons();
				return;
			}
			
			// Show credits message - subtract 1 because we're about to use one
			const creditsAfterUse = Math.max(0, creditsInfo.credits_remaining - 1);
			showCreditsMessage(creditsAfterUse);
			
			// Show loading message
			const loadingId = addAIDetectChatMessage('bot', 'Even nadenken...', null, true);
			
			try {
				// Get auth token for request
				const session = await supabaseClient.auth.getSession();
				const headers = {};
				if (session.data.session) {
					headers['Authorization'] = `Bearer ${session.data.session.access_token}`;
				}
				
				// Send to backend - use new OpenAI Vision endpoint
				const formData = new FormData();
				formData.append('image', file);
				const apiUrl = getApiUrl('/api/recognize-exercise');
				console.log('[AI Detect] Sending to:', apiUrl);
				console.log('[AI Detect] File:', file.name, file.type, file.size);
				
				const res = await fetch(apiUrl, {
					method: 'POST',
					headers: headers,
					body: formData
				});
				
				console.log('[AI Detect] Response status:', res.status, res.statusText);
				
				if (!res.ok) {
					if (res.status === 403) {
						const errorData = await res.json();
						if (errorData.error === 'no_credits') {
							addAIDetectChatMessage('bot', 'You are out of your monthly credits', null);
							updateAIDetectButtons();
							return;
						}
					}
					const errorText = await res.text();
					console.error('[AI Detect] Error response:', errorText);
					throw new Error(`Server error: ${res.status} ${res.statusText}`);
				}
				
				const data = await res.json();
				console.log('[AI Detect] Response data:', data);
				
				// Update credits display if provided
				if (data.credits_remaining !== undefined) {
					showCreditsMessage(data.credits_remaining);
				}
				
				// Remove loading message
				const loadingEl = document.querySelector(`[data-message-id="${loadingId}"]`);
				if (loadingEl) loadingEl.remove();
				
				// Handle /api/recognize-exercise response
				if (data.exercise) {
					const exerciseName = data.exercise;
					
					// Check if it's unknown
					if (exerciseName.toLowerCase() === 'unknown exercise' || exerciseName.toLowerCase().includes('unknown')) {
					addAIDetectChatMessage('bot', 'Sorry, ik kon de oefening niet goed identificeren. Kun je een duidelijkere foto maken?', null);
					} else {
						// Format exercise name for display (capitalize first letter of each word)
						const displayName = exerciseName.split(' ').map(word => 
							word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
						).join(' ');
						
						addAIDetectChatMessage('bot', `Ik denk dat dit een **${displayName}** is!`, null);
						
						// Try to find matching exercise in the exercise list
						const matchingExercise = findExerciseByName(exerciseName);
						
						if (matchingExercise) {
							// Add a button to add this exercise to the workout
							setTimeout(() => {
								const messagesContainer = document.getElementById('ai-detect-chat-messages');
								if (messagesContainer) {
									const selectBtn = document.createElement('button');
									selectBtn.className = 'ai-detect-chat-select-btn';
									selectBtn.textContent = `✓ ${matchingExercise.display} toevoegen`;
									selectBtn.onclick = () => {
										// Close chat modal
										closeAIDetectChat();
										// Close exercise selector if open
										const selector = document.getElementById('exercise-selector');
										if (selector) selector.classList.add('hidden');
										document.body.classList.remove('selector-open');
										// Add exercise to workout
										addExerciseToWorkout(matchingExercise);
									};
									messagesContainer.appendChild(selectBtn);
								}
							}, 500);
						} else {
							// Exercise not found in list, but still show the detected name
							addAIDetectChatMessage('bot', `Let op: "${displayName}" staat niet in de oefeningenlijst. Je kunt handmatig een oefening selecteren.`, null);
						}
					}
				} else {
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
	messageDiv.className = 'ai-detect-chat-message ai-detect-chat-message-' + role;
	messageDiv.setAttribute('data-message-id', messageId);
	
	if (role === 'user' && file) {
		// User message with image
		const reader = new FileReader();
		reader.onload = function(e) {
			messageDiv.innerHTML = '<div class="ai-detect-chat-avatar">👤</div><div class="ai-detect-chat-content"><img src="' + e.target.result + '" alt="Uploaded photo" class="ai-detect-chat-image" /></div>';
		};
		reader.readAsDataURL(file);
	} else if (role === 'bot') {
		// Bot message - simple text display
		const displayText = text || '';
		const textContent = isLoading ? '<span class="ai-detect-chat-loading">' + displayText + '</span>' : displayText;
		messageDiv.innerHTML = '<div class="ai-detect-chat-avatar">🤖</div><div class="ai-detect-chat-text">' + textContent + '</div>';
	} else {
		// User text message (no file)
		messageDiv.innerHTML = '<div class="ai-detect-chat-avatar">👤</div><div class="ai-detect-chat-text">' + (text || '') + '</div>';
	}
	
	messagesContainer.appendChild(messageDiv);
	messagesContainer.scrollTop = messagesContainer.scrollHeight;
	
	return messageId;
}

// Make exercise selector accessible from workout builder
// ========== WORKOUT HEATMAP ==========
let currentHeatmapWeekStart = getWeekStart(new Date()); // Monday of current week
let currentHeatmapMonth = new Date(); // Current month for monthly heatmap
currentHeatmapMonth.setDate(1); // First day of month
currentHeatmapMonth.setHours(0, 0, 0, 0);

function getWeekStart(date) {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	const day = d.getDay();
	const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
	const weekStart = new Date(d.setDate(diff));
	weekStart.setHours(0, 0, 0, 0);
	return weekStart;
}

function formatWeekLabel(weekStart) {
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 6);
	
	const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
		'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	
	const startMonth = monthNames[weekStart.getMonth()];
	const endMonth = monthNames[weekEnd.getMonth()];
	
	if (weekStart.getMonth() === weekEnd.getMonth()) {
		return `${weekStart.getDate()}-${weekEnd.getDate()} ${startMonth}`;
	} else {
		return `${weekStart.getDate()} ${startMonth} - ${weekEnd.getDate()} ${endMonth}`;
	}
}

function renderWorkoutHeatmap(workouts) {
	const heatmapContainer = document.getElementById('progress-heatmap');
	
	if (!heatmapContainer) return;
	
	// Count sets per day for the current week
	const setsByDay = {};
	// Ensure weekStart is normalized
	const weekStart = new Date(currentHeatmapWeekStart);
	weekStart.setHours(0, 0, 0, 0);
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 6);
	weekEnd.setHours(23, 59, 59, 999); // End of Sunday
	
	workouts.forEach(workout => {
		if (!workout.date && !workout.originalDate) return;
		
		// Get date string (YYYY-MM-DD)
		let dateStr = workout.originalDate || workout.date;
		if (dateStr && dateStr.length > 10) {
			dateStr = dateStr.slice(0, 10);
		}
		
		if (!dateStr) return;
		
		const workoutDate = new Date(dateStr + 'T12:00:00');
		workoutDate.setHours(0, 0, 0, 0);
		
		// Only count sets in workouts from the current week
		if (workoutDate >= weekStart && workoutDate <= weekEnd) {
			const dayKey = dateStr;
			
			// Count total sets across all exercises in this workout
			let totalSets = 0;
			if (workout.exercises && Array.isArray(workout.exercises)) {
				workout.exercises.forEach(exercise => {
					if (exercise.sets && Array.isArray(exercise.sets)) {
						// Count sets that have at least weight or reps filled in
						exercise.sets.forEach(set => {
							if ((set.weight && set.weight !== '' && set.weight !== '0') || 
							    (set.reps && set.reps !== '' && set.reps !== '0')) {
								totalSets++;
							}
						});
					}
				});
			}
			
			if (totalSets > 0) {
				setsByDay[dayKey] = (setsByDay[dayKey] || 0) + totalSets;
			}
		}
	});
	
	// Clear container
	heatmapContainer.innerHTML = '';
	
	// Get today's date for comparison
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	
	// Add cells for each day of the week (Monday to Sunday)
	const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
	const fullDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
	
	for (let i = 0; i < 7; i++) {
		const currentDay = new Date(weekStart);
		currentDay.setDate(currentDay.getDate() + i);
		currentDay.setHours(0, 0, 0, 0);
		
		const year = currentDay.getFullYear();
		const month = String(currentDay.getMonth() + 1).padStart(2, '0');
		const day = String(currentDay.getDate()).padStart(2, '0');
		const dateStr = `${year}-${month}-${day}`;
		const setCount = setsByDay[dateStr] || 0;
		
		// Check if this is today
		const isToday = currentDay.getTime() === today.getTime();
		const isPast = currentDay < today;
		const isFuture = currentDay > today;
		
		const dayCell = document.createElement('div');
		dayCell.className = 'heatmap-day-week';
		dayCell.dataset.day = day;
		dayCell.dataset.date = dateStr;
		dayCell.dataset.count = setCount;
		
		// Simple: purple if has sets, grey otherwise
		if (setCount > 0) {
			dayCell.classList.add('has-sets');
		}
		
		// Add today class for styling
		if (isToday) {
			dayCell.classList.add('today');
		}
		
		if (isPast) {
			dayCell.classList.add('past');
		}
		if (isFuture) {
			dayCell.classList.add('future');
		}
		
		// Create day label
		const dayLabel = document.createElement('div');
		dayLabel.className = 'heatmap-day-label';
		dayLabel.textContent = dayNames[i];
		
		// Create date label
		const dateLabel = document.createElement('div');
		dateLabel.className = 'heatmap-date-label';
		dateLabel.textContent = day;
		
		dayCell.appendChild(dayLabel);
		dayCell.appendChild(dateLabel);
		
		// Add tooltip
		if (setCount > 0) {
			dayCell.title = `${setCount} set${setCount > 1 ? 's' : ''} on ${fullDayNames[i]}`;
		} else {
			dayCell.title = `No sets on ${fullDayNames[i]}`;
		}
		
		heatmapContainer.appendChild(dayCell);
	}
}

function renderMonthlyHeatmap(workouts) {
	const heatmapContainer = document.getElementById('progress-heatmap-monthly');
	const monthLabel = document.getElementById('progress-heatmap-month-label');
	
	if (!heatmapContainer) return;
	
	// Get first and last day of current month
	const monthStart = new Date(currentHeatmapMonth);
	monthStart.setDate(1);
	monthStart.setHours(0, 0, 0, 0);
	
	const monthEnd = new Date(currentHeatmapMonth);
	// Calculate end of month safely
	const year = monthEnd.getFullYear();
	const month = monthEnd.getMonth();
	const lastDay = new Date(year, month + 1, 0).getDate();
	monthEnd.setDate(lastDay);
	monthEnd.setHours(23, 59, 59, 999);
	
	// Update month label
	if (monthLabel) {
		const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'];
		monthLabel.textContent = `${monthNames[monthStart.getMonth()]} ${monthStart.getFullYear()}`;
	}
	
	// Count sets per day for the current month
	const setsByDay = {};
	
	workouts.forEach(workout => {
		if (!workout.date && !workout.originalDate) return;
		
		// Get date string (YYYY-MM-DD)
		let dateStr = workout.originalDate || workout.date;
		if (dateStr && dateStr.length > 10) {
			dateStr = dateStr.slice(0, 10);
		}
		
		if (!dateStr) return;
		
		const workoutDate = new Date(dateStr + 'T12:00:00');
		workoutDate.setHours(0, 0, 0, 0);
		
		// Only count sets in workouts from the current month
		if (workoutDate >= monthStart && workoutDate <= monthEnd) {
			const dayKey = dateStr;
			
			// Count total sets across all exercises in this workout
			let totalSets = 0;
			if (workout.exercises && Array.isArray(workout.exercises)) {
				workout.exercises.forEach(exercise => {
					if (exercise.sets && Array.isArray(exercise.sets)) {
						// Count sets that have at least weight or reps filled in
						exercise.sets.forEach(set => {
							if ((set.weight && set.weight !== '' && set.weight !== '0') || 
							    (set.reps && set.reps !== '' && set.reps !== '0')) {
								totalSets++;
							}
						});
					}
				});
			}
			
			if (totalSets > 0) {
				setsByDay[dayKey] = (setsByDay[dayKey] || 0) + totalSets;
			}
		}
	});
	
	// Clear container
	heatmapContainer.innerHTML = '';
	
	// Get today's date for comparison
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	
	// Get first day of week for the first day of month (0 = Sunday, 1 = Monday, etc.)
	const firstDayOfMonth = monthStart.getDay();
	// Adjust to Monday = 0 (so Sunday = 6)
	const firstDayOfWeek = (firstDayOfMonth + 6) % 7;
	
	// Get number of days in month
	const daysInMonth = monthEnd.getDate();
	
	// Add empty cells for days before the first day of month
	for (let i = 0; i < firstDayOfWeek; i++) {
		const emptyCell = document.createElement('div');
		emptyCell.className = 'heatmap-day-month empty';
		heatmapContainer.appendChild(emptyCell);
	}
	
	// Add cells for each day of the month
	for (let day = 1; day <= daysInMonth; day++) {
		const currentDay = new Date(monthStart);
		currentDay.setDate(day);
		currentDay.setHours(0, 0, 0, 0);
		
		const year = currentDay.getFullYear();
		const month = String(currentDay.getMonth() + 1).padStart(2, '0');
		const dayStr = String(day).padStart(2, '0');
		const dateStr = `${year}-${month}-${dayStr}`;
		const setCount = setsByDay[dateStr] || 0;
		
		// Check if this is today
		const isToday = currentDay.getTime() === today.getTime();
		const isPast = currentDay < today;
		const isFuture = currentDay > today;
		
		const dayCell = document.createElement('div');
		dayCell.className = 'heatmap-day-month';
		dayCell.dataset.date = dateStr;
		dayCell.dataset.count = setCount;
		
		// Simple: purple if has sets, grey otherwise
		if (setCount > 0) {
			dayCell.classList.add('has-sets');
		}
		
		// Add today class for styling
		if (isToday) {
			dayCell.classList.add('today');
		}
		if (isPast) {
			dayCell.classList.add('past');
		}
		if (isFuture) {
			dayCell.classList.add('future');
		}
		
		// Create date label
		const dateLabel = document.createElement('div');
		dateLabel.className = 'heatmap-date-label-month';
		dateLabel.textContent = day;
		
		dayCell.appendChild(dateLabel);
		
		// Add tooltip
		if (setCount > 0) {
			const dateObj = new Date(dateStr);
			const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getDay()];
			dayCell.title = `${setCount} set${setCount > 1 ? 's' : ''} on ${dayName}, ${dateStr}`;
		} else {
			dayCell.title = `No sets on ${dateStr}`;
		}
		
		heatmapContainer.appendChild(dayCell);
	}
}

// Initialize monthly heatmap navigation
let monthlyHeatmapNavInitialized = false;
function initMonthlyHeatmapNavigation() {
	// Prevent multiple initializations
	if (monthlyHeatmapNavInitialized) return;
	monthlyHeatmapNavInitialized = true;
	
	const prevBtn = document.getElementById('progress-heatmap-prev-month');
	const nextBtn = document.getElementById('progress-heatmap-next-month');
	
	if (prevBtn) {
		prevBtn.addEventListener('click', () => {
			// Get current year and month
			const year = currentHeatmapMonth.getFullYear();
			const month = currentHeatmapMonth.getMonth();
			
			// Calculate previous month - simple subtraction
			let newYear = year;
			let newMonth = month - 1;
			
			// Handle year rollover
			if (newMonth < 0) {
				newMonth = 11;
				newYear = year - 1;
			}
			
			// Create new date object - always use day 1
			currentHeatmapMonth = new Date(newYear, newMonth, 1);
			currentHeatmapMonth.setHours(0, 0, 0, 0);
			
			console.log('Previous month clicked:', newYear, newMonth, currentHeatmapMonth);
			
			const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
			renderMonthlyHeatmap(workouts);
		});
	}
	
	if (nextBtn) {
		nextBtn.addEventListener('click', () => {
			// Get current year and month
			const year = currentHeatmapMonth.getFullYear();
			const month = currentHeatmapMonth.getMonth();
			
			// Calculate next month - simple addition
			let newYear = year;
			let newMonth = month + 1;
			
			// Handle year rollover
			if (newMonth > 11) {
				newMonth = 0;
				newYear = year + 1;
			}
			
			// Create new date object - always use day 1
			currentHeatmapMonth = new Date(newYear, newMonth, 1);
			currentHeatmapMonth.setHours(0, 0, 0, 0);
			
			console.log('Next month clicked:', newYear, newMonth, currentHeatmapMonth);
			
			const workouts = JSON.parse(localStorage.getItem('workouts') || '[]');
			renderMonthlyHeatmap(workouts);
		});
	}
}

// ========== EXERCISE NOTES ==========
// Get notes for an exercise by key
function getExerciseNotes(exerciseKey) {
	if (!exerciseKey) return '';
	const notesKey = `exercise-notes-${exerciseKey}`;
	return localStorage.getItem(notesKey) || '';
}

// Save notes for an exercise by key
function saveExerciseNotesToStorage(exerciseKey, notes) {
	if (!exerciseKey) return;
	const notesKey = `exercise-notes-${exerciseKey}`;
	if (notes && notes.trim()) {
		localStorage.setItem(notesKey, notes.trim());
	} else {
		localStorage.removeItem(notesKey);
	}
}

function openExerciseNotesModal(exerciseKey, exerciseIndex) {
	// Create modal if it doesn't exist
	let modal = document.getElementById('exercise-notes-modal');
	if (!modal) {
		modal = document.createElement('div');
		modal.id = 'exercise-notes-modal';
		modal.className = 'exercise-notes-modal hidden';
		modal.innerHTML = `
			<div class="exercise-notes-backdrop"></div>
			<div class="exercise-notes-container">
				<div class="exercise-notes-header">
					<h3 class="exercise-notes-title">Notes</h3>
					<button class="exercise-notes-close" aria-label="Close">×</button>
				</div>
				<div class="exercise-notes-content">
					<textarea id="exercise-notes-textarea" class="exercise-notes-textarea" placeholder="Add your notes here..."></textarea>
				</div>
				<div class="exercise-notes-footer">
					<button class="btn primary exercise-notes-save">Save</button>
				</div>
			</div>
		`;
		document.body.appendChild(modal);
		
		// Close on X button only (no backdrop click)
		const closeBtn = modal.querySelector('.exercise-notes-close');
		closeBtn.addEventListener('click', () => {
			closeExerciseNotesModal();
		});
	}
	
	// Set current exercise key and index BEFORE setting up listener
	modal.dataset.exerciseKey = exerciseKey;
	modal.dataset.exerciseIndex = exerciseIndex;
	
	// Remove old save button listener and add new one to ensure it uses current values
	const saveBtn = modal.querySelector('.exercise-notes-save');
	// Clone button to remove old listeners
	const newSaveBtn = saveBtn.cloneNode(true);
	saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
	// Add new listener that reads from modal.dataset
	newSaveBtn.addEventListener('click', () => {
		const currentKey = modal.dataset.exerciseKey || '';
		const currentIndex = parseInt(modal.dataset.exerciseIndex) || 0;
		saveExerciseNotes(currentKey, currentIndex);
	});
	
	// Load existing notes from localStorage
	const textarea = modal.querySelector('#exercise-notes-textarea');
	textarea.value = getExerciseNotes(exerciseKey);
	
	// Show modal
	modal.classList.remove('hidden');
	
	// Focus textarea
	setTimeout(() => {
		textarea.focus();
	}, 100);
}

function closeExerciseNotesModal() {
	const modal = document.getElementById('exercise-notes-modal');
	if (modal) {
		modal.classList.add('hidden');
	}
}

function saveExerciseNotes(exerciseKey, exerciseIndex) {
	const modal = document.getElementById('exercise-notes-modal');
	if (!modal) return;
	
	// Get values from modal dataset if not provided (fallback)
	if (!exerciseKey) {
		exerciseKey = modal.dataset.exerciseKey || '';
	}
	if (exerciseIndex === undefined || exerciseIndex === null) {
		exerciseIndex = parseInt(modal.dataset.exerciseIndex) || 0;
	}
	
	const textarea = modal.querySelector('#exercise-notes-textarea');
	if (!textarea) return;
	
	const notes = textarea.value.trim();
	
	// Save to localStorage (linked to exercise key, not workout)
	saveExerciseNotesToStorage(exerciseKey, notes);
	
	// Also update current workout exercise for immediate display
	if (currentWorkout && currentWorkout.exercises && currentWorkout.exercises[exerciseIndex] !== undefined) {
		currentWorkout.exercises[exerciseIndex].notes = notes;
		saveWorkoutDraft();
		renderWorkoutList();
	}
	
	closeExerciseNotesModal();
}

window.openExerciseSelector = openExerciseSelector;
window.addExerciseToWorkout = addExerciseToWorkout;

