// ======================
// 🔥 SUPABASE INIT
// ======================
// Supabase config is injected from backend via window.SUPABASE_URL and window.SUPABASE_ANON_KEY
// These are loaded from environment variables on the server side

// Backend API URL - set this to your deployed Flask backend URL (e.g., https://your-app.onrender.com)
// Leave empty for local development (will use relative paths)
// IMPORTANT: For Capacitor, you MUST set this to your deployed backend URL
const BACKEND_URL = window.BACKEND_URL || ''; // Set this in index.html for Capacitor

// Helper function to get full API URL
function getApiUrl(path) {
	// Remove leading slash if present
	const cleanPath = path.startsWith('/') ? path.slice(1) : path;
	// In Capacitor, use BACKEND_URL if set, otherwise try relative (won't work but shows error)
	if (BACKEND_URL) {
		return `${BACKEND_URL}/${cleanPath}`;
	}
	// For local development, use relative path
	return `/${cleanPath}`;
}

let supabaseClient = null;

async function initSupabase() {
	if (!supabaseClient) {
		try {
			if (typeof window.createClient === 'undefined' || window.createClient === null) {
				// Wait for Supabase library to load (retry up to 3 times)
				for (let i = 0; i < 3; i++) {
					await new Promise(resolve => setTimeout(resolve, 200));
					if (typeof window.createClient !== 'undefined' && window.createClient !== null) {
						break;
					}
				}
				if (typeof window.createClient === 'undefined' || window.createClient === null) {
					console.error('Supabase createClient not loaded after retries');
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
		} catch (error) {
			console.error('Error initializing Supabase:', error);
			return null;
		}
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

// ========== CLIENT-SIDE NAVIGATION (SPA) ==========
// Map of content IDs to their corresponding tab names
const CONTENT_MAP = {
	'login': 'login-content',
	'register': 'register-content',
	'workouts': 'workouts-content',
	'workout-builder': 'workout-builder-content',
	'progress': 'progress-content',
	'settings': 'settings-content',
	'vision': 'vision-content',
	'home': 'home-content'
};

// Update navbar visibility based on active screen
function updateNavbarVisibility(activeScreen) {
	const navbar = document.querySelector('.navbar');
	if (!navbar) return;
	
	// Hide navbar on login/register
	if (activeScreen === 'login' || activeScreen === 'register') {
		navbar.style.display = 'none';
	} else {
		navbar.style.display = 'flex';
	}
}

// Show a specific content screen and hide all others
function showScreen(screenName) {
	// Hide all content divs
	const allContent = document.querySelectorAll('.content');
	allContent.forEach(content => {
		content.classList.add('hidden');
	});
	
	// Show the requested content
	const contentId = CONTENT_MAP[screenName] || CONTENT_MAP['workouts'];
	const contentEl = document.getElementById(contentId);
	if (contentEl) {
		contentEl.classList.remove('hidden');
	}
	
	// Update navbar visibility
	updateNavbarVisibility(screenName);
	
	// Reset login state when showing login screen
	if (screenName === 'login') {
		resetLoginState();
	}
	
	// Load settings stats when navigating to settings
	if (screenName === 'settings') {
		loadSettings();
	}
	
	// Update active tab button (only for main nav tabs: workouts, progress, settings)
	if (screenName !== 'login' && screenName !== 'register') {
		const navbar = document.getElementById('main-navbar');
		if (navbar) {
			const navButtons = navbar.querySelectorAll('.nav-btn');
			navButtons.forEach(btn => {
				const tab = btn.getAttribute('data-tab');
				if (tab === screenName) {
					btn.classList.add('active');
				} else {
					btn.classList.remove('active');
				}
			});
		}
	}
	
	// Update currentTab for tab navigation
	if (screenName !== 'login' && screenName !== 'register') {
		currentTab = screenName;
	}
}

function createDefaultSets(count = DEFAULT_SET_COUNT) {
	return Array.from({ length: count }, () => ({ weight: '', reps: '' }));
}

async function getLastExerciseData(exerciseKey) {
	const user = await getCurrentUser();
	if (!user) return null;
	
	try {
	// Find the most recent workout that contains this exercise
		const { data: workouts, error } = await supabaseClient
			.from('workouts')
			.select('*')
			.eq('user_id', user.id)
			.order('date', { ascending: false });
		
		if (error) {
			console.error("Supabase error loading workouts for exercise data:", error);
			return null;
		}
		if (!workouts || workouts.length === 0) return null;
	
	// Find the first workout that has this exercise
		for (const workout of workouts) {
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
	} catch (error) {
		console.error('Error getting last exercise data:', error);
	return null;
	}
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

// Helper function to get current user from Supabase
async function getCurrentUser() {
	if (!supabaseClient) {
		await initSupabase();
	}
	if (!supabaseClient) return null;
	
	const { data: { user }, error } = await supabaseClient.auth.getUser();
	if (error) {
		console.error("Supabase error getting user:", error);
		return null;
	}
	if (!user) {
		console.error("No user found in auth.getUser()");
		return null;
	}
	
	// Verify user exists in public.users table (create if needed)
	try {
		const { data: userRecord, error: userError } = await supabaseClient
			.from('users')
			.select('id')
			.eq('id', user.id)
			.single();
		
		if (userError && userError.code === 'PGRST116') {
			// User doesn't exist in public.users, create it
			const { error: insertError } = await supabaseClient
				.from('users')
				.insert({
					id: user.id,
					email: user.email
				});
			
			if (insertError) {
				console.error("Error creating user record:", insertError);
				// Continue anyway - the trigger should handle it
			}
		} else if (userError) {
			console.error("Error checking user record:", userError);
		}
	} catch (e) {
		console.error("Error verifying user record:", e);
		// Continue anyway
	}
	
	return user;
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
	
	// Initialize login/register forms (always available)
	initLoginForm();
	initRegisterForm();
	
	// Add event listeners for login/register switching
	const showRegisterLink = document.getElementById('show-register-link');
	const showLoginLink = document.getElementById('show-login-link');
	if (showRegisterLink) {
		showRegisterLink.addEventListener('click', (e) => {
			e.preventDefault();
			showScreen('register');
		});
	}
	if (showLoginLink) {
		showLoginLink.addEventListener('click', (e) => {
			e.preventDefault();
			showScreen('login');
		});
	}
	
	// Check authentication state
	const { data: { session } } = supabaseClient ? await supabaseClient.auth.getSession() : { data: { session: null } };
	
	if (!session) {
		// Not logged in - show login screen
		showScreen('login');
		return;
	}
	
	// Logged in - show main app
	showScreen('workouts');
	
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
// Reset login form state
function resetLoginState() {
	const emailInput = document.querySelector("#login-email");
	const passwordInput = document.querySelector("#login-password");
	const errorEl = document.getElementById('login-error-message');
	const submitBtn = document.getElementById('login-submit-btn');
	
	// Clear input values
	if (emailInput) emailInput.value = '';
	if (passwordInput) passwordInput.value = '';
	
	// Hide error messages
	if (errorEl) {
		errorEl.classList.remove('show');
		errorEl.textContent = '';
	}
	
	// Reset button state
	if (submitBtn) {
		submitBtn.disabled = false;
		submitBtn.textContent = 'Sign In';
	}
	
	// Reset auth loading state
	authLoading = false;
}

function initLoginForm() {
	const form = document.getElementById('login-form');
	if (!form) return;
	
	const errorEl = document.getElementById('login-error-message');
	const submitBtn = document.getElementById('login-submit-btn');
	
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		
		if (submitBtn) {
			submitBtn.disabled = true;
			submitBtn.textContent = 'Signing in...';
		}
		if (errorEl) errorEl.classList.remove('show');
		
		const email = document.querySelector("#login-email")?.value;
		const password = document.querySelector("#login-password")?.value;
		
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
		
		try {
		const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
		
		if (error) {
				// Login failed - show error and reset button
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
				// Initialize app features now that user is logged in
			initLogout();
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
			}
			
			// Show workouts screen (main app) after successful login
			showScreen('workouts');
		} catch (err) {
			// Catch any unexpected errors
			console.error('Login error:', err);
			const errorMessage = err.message || 'An unexpected error occurred. Please try again.';
			
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
		}
	});
}

// ======================
// 🆕 REGISTER LOGIC
// ======================
function initRegisterForm() {
	const form = document.getElementById('register-form');
	if (!form) return;
	
	const errorEl = document.getElementById('register-error-message');
	const submitBtn = document.getElementById('register-submit-btn');
	
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
		
		// Registration successful - ensure user exists in public.users table
		// The trigger should automatically create it, but we'll verify and create if needed
		try {
			// Wait a moment for the trigger to complete
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			const { data: { user }, error: getUserError } = await supabaseClient.auth.getUser();
			
			if (getUserError) {
				console.error("Error getting user after signup:", getUserError);
				// Still show success - the account was created
				alert('Account created! Please log in.');
				showScreen('login');
				return;
			}
			
			if (!user) {
				console.error("No user returned after signup");
				alert('Account created! Please log in.');
				showScreen('login');
				return;
			}
			
			// Check if user exists in public.users, create if not
			const { data: userRecord, error: userError } = await supabaseClient
				.from('users')
				.select('id')
				.eq('id', user.id)
				.single();
			
			if (userError && userError.code === 'PGRST116') {
				// User doesn't exist in public.users, create it
				// This should be allowed by the INSERT policy
				console.log("User not found in public.users, creating...");
				const { data: insertData, error: insertError } = await supabaseClient
					.from('users')
					.insert({
						id: user.id,
						email: user.email
					})
					.select();
				
					if (insertError) {
						console.error("Database error saving new user:", insertError);
						console.error("Error code:", insertError.code);
						console.error("Error message:", insertError.message);
						console.error("Error details:", insertError.details);
						console.error("Error hint:", insertError.hint);
						console.error("Full error object:", insertError);
						console.error("Full error JSON:", JSON.stringify(insertError, null, 2));
						
						// Unique constraint violation - user might already exist (trigger worked!)
						if (insertError.code === '23505') {
							console.log("User already exists (likely created by trigger) - this is OK, continuing...");
							// Don't show error, just continue - trigger worked!
						} else {
							// Show FULL error details in UI for debugging
							let errorMsg = `ERROR ${insertError.code || 'UNKNOWN'}: ${insertError.message || 'No message'}`;
							if (insertError.details) {
								errorMsg += `\nDetails: ${insertError.details}`;
							}
							if (insertError.hint) {
								errorMsg += `\nHint: ${insertError.hint}`;
							}
							
							// More specific error message based on code
							if (insertError.code === '42501') {
								errorMsg = 'ERROR 42501: Permission denied.\n\nINSERT policy may not be set correctly.\n\nCheck Supabase: Authentication > Policies > users table\n\nRun COMPLETE_USER_SETUP.sql again.';
							} else if (insertError.code === '23503') {
								errorMsg = 'ERROR 23503: Foreign key constraint failed.\n\nUser may not exist in auth.users.\n\nThis should not happen - contact support.';
							}
							
							// ALWAYS show the error with full details
							if (errorEl) {
								errorEl.textContent = errorMsg;
								errorEl.classList.add('show');
								errorEl.style.whiteSpace = 'pre-wrap'; // Allow line breaks
								errorEl.style.maxHeight = '200px';
								errorEl.style.overflow = 'auto';
							} else {
								alert(errorMsg);
							}
							if (submitBtn) {
								submitBtn.disabled = false;
								submitBtn.textContent = 'Sign Up';
							}
							return;
						}
					} else {
						console.log("Successfully created user in public.users:", insertData);
					}
			} else if (userError && userError.code !== 'PGRST116') {
				// Some other error occurred
				console.error("Error checking user record:", userError);
				console.error("Error code:", userError.code);
				console.error("Error message:", userError.message);
			} else {
				console.log("User already exists in public.users - trigger worked!");
			}
		} catch (err) {
			console.error("Unexpected error creating user record:", err);
			console.error("Error stack:", err.stack);
			// The trigger should have created the user, so this might be OK
			// But we'll still show an error to be safe
			if (errorEl) {
				errorEl.textContent = 'Account created, but there was an issue. Please try logging in.';
				errorEl.classList.add('show');
			} else {
				alert('Account created, but there was an issue. Please try logging in.');
			}
			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.textContent = 'Sign Up';
			}
			// Still redirect to login - the account was created in auth.users
			setTimeout(() => {
				showScreen('login');
			}, 2000);
			return;
		}
		
		// Registration successful
		alert('Account created! Please log in.');
		showScreen('login');
	});
}

// ======================
// 🔒 PUBLIC ROUTES (DEPRECATED - Now using SPA)
// ======================
function isPublicPage() {
	// In SPA mode, we don't use pathname-based routing
	// This function is kept for backwards compatibility but always returns false
	return false;
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
			showScreen('login');
			return false;
		}
		
		const { data: { session }, error } = await supabaseClient.auth.getSession();
		
		if (error) {
			console.error('Session check error:', error);
			authCheckComplete = false;
			showScreen('login');
			return false;
		}
		
		if (!session) {
			// Not logged in, show login screen
			authCheckComplete = false;
			showScreen('login');
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
		showScreen('login'); // This will hide the navbar via updateNavbarVisibility()
	} catch (e) {
		console.error('Logout failed:', e);
		showScreen('login'); // This will hide the navbar via updateNavbarVisibility()
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
		// Use showScreen for consistent navigation
		showScreen(tab);
		
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
	const classifyBtn = document.getElementById('classify');
	const camera = document.getElementById('camera');
	const snapshot = document.getElementById('snapshot');
	const manualPreview = document.getElementById('manual-preview');
	
	// Helper function to process a photo file (used by both file input and Capacitor Camera)
	async function processPhotoFile(file) {
		if (!file) return;
		
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
				// Store the actual file for classification
				window.lastUploadFile = file;
				// Show the preview image in the dotted square
				if (manualPreview) {
					manualPreview.src = img.src;
					manualPreview.classList.remove('hidden');
				}
				if (camera) camera.classList.add('hidden');
				if (snapshot) snapshot.classList.add('hidden');
				classifyBtn.disabled = false;
			};
			img.src = event.target.result;
		};
		reader.readAsDataURL(file);
	}
	
	// SIMPLE CAMERA HANDLING - Works on iOS via Capacitor
	const isCapacitor = typeof window !== 'undefined' && window.Capacitor;
	
	if (fileInput) {
		const fileInputLabel = fileInput.closest('label');
		
		if (fileInputLabel) {
			fileInputLabel.addEventListener('click', async (e) => {
				// Always prevent default to handle manually
				e.preventDefault();
				e.stopPropagation();
				
				// On iOS/Capacitor, use Camera plugin
				if (isCapacitor) {
					try {
						// Get Camera plugin
						const { Camera } = await import('@capacitor/camera');
						
						const image = await Camera.getPhoto({
							quality: 90,
							allowEditing: false,
							resultType: 'base64',
							source: 'CAMERA'
						});
						
					if (image && image.base64String) {
						console.log('📸 Got camera image, base64 length:', image.base64String.length);
						
						// Convert to File
						const byteCharacters = atob(image.base64String);
						const byteNumbers = new Array(byteCharacters.length);
						for (let i = 0; i < byteCharacters.length; i++) {
							byteNumbers[i] = byteCharacters.charCodeAt(i);
						}
						const byteArray = new Uint8Array(byteNumbers);
						const blob = new Blob([byteArray], { type: 'image/jpeg' });
						const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
						
						console.log('📸 Created file:', file.name, 'size:', file.size, 'bytes', 'type:', file.type);
						
						if (file.size === 0) {
							alert('Error: Photo file is empty. Please try again.');
							return;
						}
						
						// Store file
						window.lastUploadFile = file;
						
						// Process and show preview
						await processPhotoFile(file);
					}
					} catch (error) {
						// If camera fails, fallback to file input
						if (!error.message || (!error.message.includes('cancel') && !error.message.includes('User cancelled'))) {
							fileInput.click();
						}
					}
				} else {
					// Web: use file input
					fileInput.click();
				}
			});
		}
		
		// Also handle file input change (for web fallback)
		fileInput.addEventListener('change', (e) => {
			const file = e.target.files[0];
			if (file) {
				window.lastUploadFile = file;
				processPhotoFile(file);
			}
		});
	}
	
	if (classifyBtn) {
		classifyBtn.addEventListener('click', async () => {
			// Get file - MUST exist
			const file = window.lastUploadFile || fileInput?.files[0];
			
			if (!file) {
				alert('Please take a photo first!');
				return;
			}
			
			// Verify file is not empty
			if (file.size === 0) {
				alert('Error: Photo file is empty. Please take a new photo.');
				return;
			}
			
			console.log('📤 Sending image to backend:', file.name, 'size:', file.size, 'bytes', 'type:', file.type);
			
			classifyBtn.disabled = true;
			classifyBtn.textContent = 'Detecting...';
			
			try {
				// First check backend health
				const healthUrl = getApiUrl('/health');
				let healthOk = false;
				try {
					const healthRes = await fetch(healthUrl);
					if (healthRes.ok) {
						const health = await healthRes.json();
						console.log('✅ Health check:', health);
						if (health.models_loaded > 0) {
							healthOk = true;
						} else {
							alert('Backend has no AI models loaded. Please check server.');
							return;
						}
					} else {
						console.warn('⚠️ Health check failed:', healthRes.status);
					}
				} catch (e) {
					console.warn('⚠️ Health check error (continuing anyway):', e);
					// Health check failed, continue anyway
				}
				
				// Send to backend
				const formData = new FormData();
				formData.append('image', file);
				
				console.log('📤 FormData created, sending POST to:', getApiUrl('/predict'));
				
				const apiUrl = getApiUrl('/predict');
				console.log('📤 Sending POST request to:', apiUrl);
				console.log('📤 File details:', {
					name: file.name,
					size: file.size,
					type: file.type,
					lastModified: file.lastModified
				});
				
				const res = await fetch(apiUrl, {
					method: 'POST',
					body: formData
				});
				
				console.log('📥 Response status:', res.status, res.statusText);
				console.log('📥 Response headers:', Object.fromEntries(res.headers.entries()));
				
				if (!res.ok) {
					const errorText = await res.text().catch(() => 'Unknown error');
					console.error('❌ Backend error:', res.status, errorText);
					
					// Try to parse as JSON for better error message
					let errorData = null;
					try {
						errorData = JSON.parse(errorText);
					} catch (e) {
						// Not JSON, use text as is
					}
					
					const errorMessage = errorData?.error || errorText || 'Unknown error';
					
					if (res.status === 422) {
						// NO_PREDICTION - show modal
						console.error('❌ No prediction from AI models:', errorMessage);
						showAIDetectErrorModal('We couldn\'t detect an exercise from this photo. Please try a clearer photo with a visible exercise machine. Error: ' + errorMessage);
					} else if (res.status === 400) {
						alert('Bad Request: ' + errorMessage + '\n\nThis usually means the image file is corrupted or empty.');
						showAIDetectErrorModal();
					} else if (res.status === 500) {
						alert('Server error (500): ' + errorMessage + '\n\nThe AI models may not be working. Check Render logs.');
						showAIDetectErrorModal();
					} else {
						alert('Server error (' + res.status + '): ' + errorMessage);
						showAIDetectErrorModal();
					}
					return;
				}
				
				const data = await res.json();
				console.log('✅ Backend response:', data);
				
				if (data.success === false || data.error === 'NO_PREDICTION') {
					// No prediction - show modal
					console.error('❌ No prediction from backend:', data);
					showAIDetectErrorModal('We couldn\'t detect an exercise from this photo. Please try a clearer photo with a visible exercise machine.');
				} else if (data.error) {
					alert('Error: ' + data.error);
					showAIDetectErrorModal();
				} else {
					// SUCCESS - Show results
					if (window.lastUploadPreview) {
						data._previewImage = window.lastUploadPreview;
					}
					displayPrediction(data);
					saveRecentScan(data);
				}
			} catch (e) {
				console.error('Fetch error:', e);
				alert('Network error: ' + (e.message || 'Could not connect to server. Check your internet.'));
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

	// AI detect inside selector
	if (aiDetectBtn && fileInput) {
		aiDetectBtn.addEventListener('click', () => {
			fileInput.click();
		});
		fileInput.addEventListener('change', async (e) => {
			const file = e.target.files[0];
			if (!file) return;
			await classifyForExerciseSelector(file, predictionsContainer, selector);
			// reset value so the same file can be chosen again if needed
			fileInput.value = '';
		});
	}
	
	// Muscle filters - clear container first to prevent duplicates
	const muscles = ['All', 'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'];
	if (musclesContainer) {
		// Clear existing buttons to prevent duplicates
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
		
		// If exercises haven't loaded yet, wait for them
		if (!allExercises || allExercises.length === 0) {
			loadExercises().then(() => {
				filterExercises(query, muscle);
			});
			return;
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
		const res = await fetch('/predict', {
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
	const selector = document.getElementById('exercise-selector');
	if (selector) {
		selector.classList.remove('hidden');
		document.body.classList.add('selector-open');
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
		// Ensure exercises are loaded before showing
		if (!allExercises || allExercises.length === 0) {
			loadExercises().then(() => {
		const filterFn = window.filterExercisesForSelector;
		if (typeof filterFn === 'function') {
			filterFn('', null);
				}
			});
		} else {
			const filterFn = window.filterExercisesForSelector;
			if (typeof filterFn === 'function') {
				filterFn('', null);
			}
		}
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
		const lastSets = await getLastExerciseData(exerciseData.key || exerciseData.display);
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
		addBtn.onclick = () => {
			openExerciseSelector();
		};
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

async function saveWorkout() {
	if (!currentWorkout) return;
	
	const user = await getCurrentUser();
	if (!user) {
		console.error('User not authenticated');
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
	
	// Convert date to YYYY-MM-DD format for date column
	const workoutDate = editingWorkoutId 
		? (currentWorkout.date ? new Date(currentWorkout.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
		: new Date().toISOString().split('T')[0];
	
	// Calculate total volume from exercises
	let totalVolume = null;
	if (currentWorkout.exercises && Array.isArray(currentWorkout.exercises)) {
		totalVolume = currentWorkout.exercises.reduce((sum, ex) => {
			if (ex.sets && Array.isArray(ex.sets)) {
				const exerciseVolume = ex.sets.reduce((setSum, set) => {
					const weight = parseFloat(set.weight) || 0;
					const reps = parseFloat(set.reps) || 0;
					return setSum + (weight * reps);
				}, 0);
				return sum + exerciseVolume;
			}
			return sum;
		}, 0);
	}
	
	try {
	if (editingWorkoutId) {
			// Update existing workout
			const { data, error } = await supabaseClient
				.from('workouts')
				.update({
					name: currentWorkout.name,
					exercises: currentWorkout.exercises, // Keep exercises JSONB for backward compatibility
					duration: duration,
					date: workoutDate,
					total_volume: totalVolume
				})
				.eq('id', editingWorkoutId)
				.eq('user_id', user.id)
				.select()
				.single();
			
			if (error) {
				console.error("Supabase error updating workout:", error);
				console.error("Error code:", error.code);
				console.error("Error message:", error.message);
				console.error("Error details:", error.details);
				console.error("Error hint:", error.hint);
				throw error;
		}
	} else {
			// Insert new workout
			// Don't specify id - let Supabase generate UUID automatically
			const { data, error } = await supabaseClient
				.from('workouts')
				.insert({
					user_id: user.id,
					date: workoutDate,
					name: currentWorkout.name,
					exercises: currentWorkout.exercises, // Keep exercises JSONB for backward compatibility
					duration: duration,
					total_volume: totalVolume
				})
				.select()
				.single();
			
			if (error) {
				console.error("Supabase error inserting workout:", error);
				console.error("Error code:", error.code);
				console.error("Error message:", error.message);
				console.error("Error details:", error.details);
				console.error("Error hint:", error.hint);
				throw error;
			}
			
			// Update currentWorkout with the generated ID
			if (data && data.id) {
				currentWorkout.id = data.id;
			}
		}
	
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
	
		loadWorkouts();
	switchTab('workouts');
	} catch (error) {
		console.error('Error saving workout:', error);
		// Log full error details for debugging
		if (error) {
			console.error('Full error details:', JSON.stringify(error, null, 2));
			console.error('Error message:', error.message);
			console.error('Error code:', error.code);
			console.error('Error details:', error.details);
			console.error('Error hint:', error.hint);
		}
		alert('Failed to save workout. Please try again.');
	}
}

async function loadWorkouts(prefetchedWorkouts = null) {
	const user = await getCurrentUser();
	if (!user) {
		console.error('User not authenticated');
		return;
	}
	
	let workouts = [];
	
	if (prefetchedWorkouts) {
		workouts = prefetchedWorkouts;
	} else {
		try {
			const { data, error } = await supabaseClient
				.from('workouts')
				.select('*')
				.eq('user_id', user.id)
				.order('date', { ascending: false }); // Sort by date (most recent first)
			
			if (error) {
				console.error("Supabase error loading workouts:", error);
				workouts = [];
			} else {
				workouts = data || [];
			}
		} catch (error) {
			console.error('Error loading workouts:', error);
			workouts = [];
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
		
		// Sort workouts by date (most recent first), then by id as fallback for same date
		// This ensures most recently saved workouts appear first
		// If multiple workouts on same date, newer ones (higher id) appear first
		const sorted = [...workouts].sort((a, b) => {
			// First sort by date (most recent first)
			const dateA = typeof a.date === 'string' ? new Date(a.date) : new Date(a.date);
			const dateB = typeof b.date === 'string' ? new Date(b.date) : new Date(b.date);
			const dateDiff = dateB.getTime() - dateA.getTime();
			
			if (dateDiff !== 0) {
				return dateDiff; // Different dates - sort by date (newest first)
			}
			
			// Same date - try to use inserted_at if available, otherwise use id as fallback
			if (a.inserted_at && b.inserted_at) {
				const insertedA = new Date(a.inserted_at);
				const insertedB = new Date(b.inserted_at);
				return insertedB.getTime() - insertedA.getTime(); // Most recent inserted_at first
			}
			
			// No inserted_at - just keep date order (already sorted by date descending)
			return 0;
		});
		
		sorted.forEach(workout => {
			const li = document.createElement('li');
			// Handle date string (YYYY-MM-DD) or Date object
			const dateStr = typeof workout.date === 'string' ? workout.date : workout.date.toISOString().split('T')[0];
			const date = new Date(dateStr);
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
		// Convert absolute paths to relative for Capacitor
		if (exercise.image.startsWith('/images/')) {
			return [`static/images/${exercise.image.replace('/images/', '')}`];
		}
		return [exercise.image];
	}
	const candidates = [];
	const seen = new Set();
	const addPath = (path) => {
		if (path && !seen.has(path)) {
			seen.add(path);
			candidates.push(path);
		}
	};
	const addBase = (base) => {
		if (!base) return;
		// Use relative paths for Capacitor
		addPath(`static/images/${base}.jpg`);
		addPath(`static/images/${base}.png`);
		addPath(`static/images/${base}.jpeg`);
		// Also try absolute paths for web compatibility
		addPath(`/images/${base}.jpg`);
		addPath(`/images/${base}.png`);
		addPath(`/images/${base}.jpeg`);
	};
	
	// Special case: use specific images for generic predictions
	const label = (exercise.display || exercise.key || '').toString().toLowerCase().trim();
	if (label === 'smith machine') {
		addPath('static/images/smithmachine.jpg');
		addPath('/images/smithmachine.jpg');
	}
	if (label === 'dumbbell') {
		addPath('static/images/dumbbell.jpg');
		addPath('/images/dumbbell.jpg');
	}
	if (label === 'chinning dipping' || label === 'leg raise tower') {
		addPath('static/images/chinningdipping.jpg');
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

async function deleteWorkout(id) {
	const user = await getCurrentUser();
	if (!user) {
		console.error('User not authenticated');
		return;
	}
	
	try {
		const { error } = await supabaseClient
			.from('workouts')
			.delete()
			.eq('id', id)
			.eq('user_id', user.id);
		
		if (error) {
			console.error("Supabase error deleting workout:", error);
			throw error;
		}
		
	loadWorkouts();
	} catch (error) {
		console.error('Error deleting workout:', error);
		alert('Failed to delete workout. Please try again.');
	}
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
		progressForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const weight = document.getElementById('progress-weight')?.value;
			const dateInputValue = document.getElementById('progress-date')?.value;
			if (weight && dateInputValue) {
				const user = await getCurrentUser();
				if (!user) {
					console.error('User not authenticated');
					return;
				}
				
				// Use the selected date so you can backfill specific days
				const dayKey = dateInputValue; // YYYY-MM-DD from input[type=date]
				const now = new Date(`${dayKey}T12:00:00`);
				const value = parseFloat(weight);
				
				try {
					// Use date only (YYYY-MM-DD) format for date column
					const dateOnly = dayKey; // Already in YYYY-MM-DD format from input
					
					// Check if entry exists for this day and user
					// Use .maybeSingle() instead of .single() to avoid errors when no entry exists
					const { data: existing, error: checkError } = await supabaseClient
						.from('weights')
						.select('id')
						.eq('user_id', user.id)
						.eq('date', dateOnly)
						.maybeSingle();
					
					// If exists, update; otherwise insert
					// This ensures max 1 entry per day per user
					if (existing && !checkError) {
						console.log('Updating existing weight entry for date:', dateOnly);
						const { error: updateError } = await supabaseClient
							.from('weights')
							.update({
								weight: value,
								date: dateOnly
							})
							.eq('id', existing.id)
							.eq('user_id', user.id);
						
						if (updateError) {
							console.error("Supabase error updating weight:", updateError);
							throw updateError;
						}
					} else {
						// Insert new weight log entry only if none exists for this date
						console.log('Inserting new weight entry for date:', dateOnly);
						const { error: insertError } = await supabaseClient
							.from('weights')
							.insert({
								user_id: user.id,
								date: dateOnly,
					weight: value
				});
						
						if (insertError) {
							console.error("Supabase error inserting weight:", insertError);
							// If insert fails due to duplicate, try update instead
							if (insertError.code === '23505' || insertError.message.includes('duplicate')) {
								console.log('Duplicate detected, attempting update instead');
								// Try to find and update existing entry
								const { data: existingEntry } = await supabaseClient
									.from('weights')
									.select('id')
									.eq('user_id', user.id)
									.eq('date', dateOnly)
									.maybeSingle();
								
								if (existingEntry) {
									const { error: updateError } = await supabaseClient
										.from('weights')
										.update({ weight: value })
										.eq('id', existingEntry.id)
										.eq('user_id', user.id);
									
									if (updateError) {
										throw updateError;
									}
								} else {
									throw insertError;
								}
							} else {
								throw insertError;
							}
						}
					}
					
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
				} catch (error) {
					console.error('Error saving progress:', error);
					alert('Failed to save weight. Please try again.');
				}
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
	const user = await getCurrentUser();
	if (!user) {
		console.error('User not authenticated');
		return;
	}
	
	try {
		// Load weight logs (progress)
		const { data: progressData, error: progressError } = await supabaseClient
			.from('weights')
			.select('*')
			.eq('user_id', user.id)
			.order('date', { ascending: true });
		
		if (progressError) {
			console.error("Supabase error loading weights:", progressError);
			throw progressError;
		}
		
		// Normalize progress data
		// Date is already in YYYY-MM-DD format from database
		const progress = (progressData || []).map(p => {
			const dateStr = p.date ? (typeof p.date === 'string' ? p.date : p.date.toISOString().split('T')[0]) : '';
			return {
				date: dateStr,
				dayKey: dateStr,
				weight: p.weight
			};
		});
		
		// Load workouts
		const { data: workoutsData, error: workoutsError } = await supabaseClient
			.from('workouts')
			.select('*')
			.eq('user_id', user.id)
			.order('date', { ascending: false });
		
		if (workoutsError) {
			console.error("Supabase error loading workouts for progress:", workoutsError);
			throw workoutsError;
		}
		const workouts = workoutsData || [];
		
	renderWeightChart(progress);
	await renderMuscleFocus(workouts);
	updateExerciseInsightsOptions(workouts);
	renderPRTimeline(workouts);
	renderProgressiveOverloadTracker(workouts);
	} catch (error) {
		console.error('Error loading progress:', error);
		// Fallback to empty data
		renderWeightChart([]);
		await renderMuscleFocus([]);
		updateExerciseInsightsOptions([]);
		renderPRTimeline([]);
		renderProgressiveOverloadTracker([]);
	}
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
	
	// Keep all data points - each date should be a separate entry
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

	// Smooth curved line using bezier curves for natural flow
	ctx.strokeStyle = '#7c5cff';
	ctx.lineWidth = 2.5;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.beginPath();
	
	if (points.length === 1) {
		// Single point - just draw a dot
		const x = padX + (scaleX * 0);
		const y = valueToY(points[0].y);
		ctx.moveTo(x, y);
		ctx.lineTo(x, y);
	} else if (points.length === 2) {
		// Two points - simple line
		const x1 = padX + (scaleX * 0);
		const y1 = valueToY(points[0].y);
		const x2 = padX + (scaleX * 1);
		const y2 = valueToY(points[1].y);
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
	} else {
		// Multiple points - use smooth bezier curves
	points.forEach((p, i) => {
		const x = padX + (scaleX * i);
		const y = valueToY(p.y);
			
			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				const prevX = padX + (scaleX * (i - 1));
				const prevY = valueToY(points[i - 1].y);
				
				// Calculate smooth control points for bezier curve
				// Use the midpoint as control point, but adjust for smoother curves
				const cpX1 = prevX + (x - prevX) * 0.5;
				const cpY1 = prevY;
				const cpX2 = prevX + (x - prevX) * 0.5;
				const cpY2 = y;
				
				// Use bezier curve for smooth transitions
				ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, x, y);
			}
		});
	}
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
	// Store hover points and chart dimensions on canvas for interactive tooltip
	canvas.__weightPoints = hoverPoints;
	canvas.__progressData = progress;
	canvas.__chartDimensions = { padX, padY, w, h };

	// Attach hover listeners once
	if (!canvas.__hoverBound) {
		let hoveredPoint = null;
		
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
				if (hoveredPoint) {
					// Redraw chart without hover line
					hoveredPoint = null;
					if (canvas.__progressData) {
						renderWeightChart(canvas.__progressData);
					}
				}
				tooltip.style.display = 'none';
				return;
			}
			
			// Only redraw if hovering a different point
			if (!hoveredPoint || hoveredPoint.cx !== nearest.cx) {
				hoveredPoint = nearest;
				
				// Redraw chart with hover line
				if (canvas.__progressData) {
					renderWeightChart(canvas.__progressData);
					
					// Draw hover effects on top
					const ctx = canvas.getContext('2d');
					const dims = canvas.__chartDimensions;
					const hoverX = nearest.cx;
					
					// Draw vertical dashed line from top to bottom
					ctx.strokeStyle = 'rgba(124, 92, 255, 0.5)';
					ctx.lineWidth = 1.5;
					ctx.setLineDash([4, 4]);
					ctx.beginPath();
					ctx.moveTo(hoverX, dims.padY);
					ctx.lineTo(hoverX, dims.padY + dims.h);
					ctx.stroke();
					ctx.setLineDash([]);
					
					// Draw highlighted point with white center and purple border
					ctx.fillStyle = '#fff';
					ctx.beginPath();
					ctx.arc(nearest.cx, nearest.cy, 5, 0, Math.PI * 2);
					ctx.fill();
					
					ctx.strokeStyle = '#7c5cff';
					ctx.lineWidth = 2.5;
					ctx.beginPath();
					ctx.arc(nearest.cx, nearest.cy, 5, 0, Math.PI * 2);
					ctx.stroke();
					
					// Draw small circle at intersection with x-axis
					ctx.fillStyle = 'rgba(124, 92, 255, 0.7)';
					ctx.beginPath();
					ctx.arc(hoverX, dims.padY + dims.h, 3, 0, Math.PI * 2);
					ctx.fill();
				}
			}
			
			const dateStr = nearest.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			tooltip.innerHTML = `<div style="font-size: 12px; opacity: 0.9;">${dateStr}</div><div style="color: #fff; font-weight: 600; margin-top: 4px; font-size: 14px;">${nearest.weight} kg</div>`;
			tooltip.style.display = 'block';
			
			// Position tooltip above the chart, always visible
			const canvasRect = canvas.getBoundingClientRect();
			const wrapper = canvas.parentElement; // progress-chart-wrapper
			const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : canvasRect;
			
			// Force tooltip to render to get accurate dimensions
			tooltip.style.visibility = 'hidden';
			tooltip.style.display = 'block';
			const tooltipRect = tooltip.getBoundingClientRect();
			tooltip.style.visibility = 'visible';
			
			// Center horizontally on the hovered point (relative to wrapper)
			let left = nearest.cx - (tooltipRect.width / 2);
			
			// Keep tooltip within wrapper bounds with padding
			const padding = 8;
			if (left < padding) left = padding;
			if (left + tooltipRect.width > wrapperRect.width - padding) {
				left = wrapperRect.width - tooltipRect.width - padding;
			}
			
			// Always position at top of chart area (above the chart)
			const top = 8;
			
			tooltip.style.left = `${left}px`;
			tooltip.style.top = `${top}px`;
			tooltip.style.transform = 'none'; // Remove any transform from CSS
		});
		canvas.addEventListener('mouseleave', () => {
			if (tooltip) tooltip.style.display = 'none';
			if (hoveredPoint) {
				hoveredPoint = null;
				if (canvas.__progressData) {
					renderWeightChart(canvas.__progressData);
				}
			}
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
				// Update in Supabase
				const user = await getCurrentUser();
				if (user) {
					const { data: workoutData, error: fetchError } = await supabaseClient
						.from('workouts')
						.select('exercises')
						.eq('id', workout.id)
						.eq('user_id', user.id)
						.single();
					
					if (fetchError) {
						console.error("Supabase error fetching workout for muscle update:", fetchError);
					} else if (workoutData) {
						const exercises = workoutData.exercises || [];
						const exIndex = exercises.findIndex(e => 
						(e.key || e.display) === (exercise.key || exercise.display)
					);
					if (exIndex >= 0) {
							exercises[exIndex].muscles = data.muscles;
							const { error: updateError } = await supabaseClient
								.from('workouts')
								.update({ exercises })
								.eq('id', workout.id)
								.eq('user_id', user.id);
							
							if (updateError) {
								console.error("Supabase error updating exercise muscles:", updateError);
							}
						}
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
		// Handle date string (YYYY-MM-DD) or Date object
		const dateStr = typeof workout.date === 'string' ? workout.date : workout.date.toISOString().split('T')[0];
		const workoutDate = new Date(dateStr);
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
		// Handle date string (YYYY-MM-DD) or Date object
		const dateStr = typeof workout.date === 'string' ? workout.date : workout.date.toISOString().split('T')[0];
		const workoutDate = new Date(dateStr);
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
		
		// Load statistics
		await loadSettingsStats();
	} catch (e) {
		console.error('Failed to load settings:', e);
	}
}

async function loadSettingsStats() {
	try {
		const user = await getCurrentUser();
		if (!user) return;
		
		// Load streak
		const streak = await loadStreak();
		const streakEl = document.getElementById('settings-stat-streak');
		if (streakEl) streakEl.textContent = streak || '0';
		
		// Load workouts count
		const { data: workouts, error: workoutsError } = await supabaseClient
			.from('workouts')
			.select('id')
			.eq('user_id', user.id);
		
		const workoutsCount = workouts && !workoutsError ? workouts.length : 0;
		const workoutsEl = document.getElementById('settings-stat-workouts');
		if (workoutsEl) workoutsEl.textContent = workoutsCount.toString();
		
		// Calculate total workout hours
		// Sum all workout durations and convert to hours (rounded to 1 decimal)
		let totalHours = 0;
		if (workouts && workouts.length > 0) {
			const { data: allWorkouts, error: allWorkoutsError } = await supabaseClient
				.from('workouts')
				.select('duration')
				.eq('user_id', user.id);
			
			if (!allWorkoutsError && allWorkouts) {
				// Sum all durations (duration is stored in milliseconds in the database)
				let totalMilliseconds = 0;
				for (const workout of allWorkouts) {
					if (workout.duration && typeof workout.duration === 'number') {
						totalMilliseconds += workout.duration;
					}
				}
				
				// Convert milliseconds to hours and round to 1 decimal place
				// Example: 20 min (1200000 ms) + 70 min (4200000 ms) = 5400000 ms = 1.5 hours
				const totalMinutes = totalMilliseconds / (1000 * 60); // Convert ms to minutes
				totalHours = Math.round((totalMinutes / 60) * 10) / 10; // Convert to hours, round to 1 decimal
			}
		}
		
		const hoursEl = document.getElementById('settings-stat-hours');
		if (hoursEl) hoursEl.textContent = totalHours.toString();
		
	} catch (e) {
		console.error('Failed to load settings stats:', e);
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
				
				// Check if user specified a number of exercises - if so, skip quick workout and use AI
				const msgLower = message.toLowerCase();
				const hasSpecificCount = /\d+\s*(exercise|oefening)/i.test(message) || 
					/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\s+(exercise|oefening)/i.test(message);
				
				// INSTANT: Try to generate quick workout first (works for muscle groups, exercises, etc.)
				// But skip if user specified a specific number of exercises
				const quickWorkout = hasSpecificCount ? null : generateQuickWorkout(message);
				
				// Check if this is a workout request (keywords OR if quick workout was generated OR muscle groups mentioned)
				const workoutKeywords = ["workout", "make", "create", "maak", "train", "push", "pull", "legs", "oefeningen", "exercises"];
				const muscleGroups = ["chest", "shoulder", "back", "bicep", "tricep", "leg", "quad", "hamstring", "glute", "calf", "abs", "core", "borst"];
				const hasMuscleGroup = muscleGroups.some(muscle => msgLower.includes(muscle));
				const isWorkoutRequest = quickWorkout !== null || 
					workoutKeywords.some(keyword => msgLower.includes(keyword)) ||
					hasMuscleGroup;
				
				if (isWorkoutRequest) {
					// INSTANT: Use quick workout if available
					if (quickWorkout) {
						// Remove loading message and show instant workout
						if (loadingElement) loadingElement.remove();
						applyWorkoutFromVision(quickWorkout);
						switchTab('workouts');
						setTimeout(() => {
							showScreen('workout-builder');
						}, 100);
						addChatMessage(`✓ Created "${quickWorkout.name}" with ${quickWorkout.exercises.length} exercises!`, 'bot');
						
						sendBtn.disabled = false;
						return;
					}
					
					// If muscle group mentioned but no quick workout, try to generate one
					if (hasMuscleGroup && !quickWorkout) {
						// Try to create a quick workout based on muscle group
						let fallbackWorkout = null;
						if (msgLower.includes('chest') || msgLower.includes('borst')) {
							fallbackWorkout = {
								name: 'Chest Workout',
								exercises: [
									{ key: 'bench_press', display: 'Bench Press' },
									{ key: 'incline_bench_press', display: 'Incline Bench Press' },
									{ key: 'dumbbell_fly', display: 'Dumbbell Fly' },
									{ key: 'cable_crossover', display: 'Cable Crossover' },
									{ key: 'pec_deck_machine', display: 'Pec Deck Machine' }
								]
							};
						} else if (msgLower.includes('shoulder')) {
							fallbackWorkout = {
								name: 'Shoulders Workout',
								exercises: [
									{ key: 'shoulder_press_machine', display: 'Shoulder Press Machine' },
									{ key: 'lateral_raise_machine', display: 'Lateral Raise Machine' },
									{ key: 'front_raise', display: 'Front Raise' },
									{ key: 'rear_delt_fly', display: 'Rear Delt Fly' },
									{ key: 'cable_face_pull', display: 'Cable Face Pull' }
								]
							};
						} else if (msgLower.includes('back')) {
							fallbackWorkout = {
								name: 'Back Workout',
								exercises: [
									{ key: 'lat_pulldown', display: 'Lat Pulldown' },
									{ key: 'seated_row', display: 'Seated Row' },
									{ key: 'one_arm_dumbbell_row', display: 'One Arm Dumbbell Row' },
									{ key: 'bent_over_row', display: 'Bent Over Row' },
									{ key: 'deadlift', display: 'Deadlift' }
								]
							};
						} else if (msgLower.includes('bicep')) {
							fallbackWorkout = {
								name: 'Biceps Workout',
								exercises: [
									{ key: 'barbell_curl', display: 'Barbell Curl' },
									{ key: 'dumbbell_curl', display: 'Dumbbell Curl' },
									{ key: 'hammer_curl', display: 'Hammer Curl' },
									{ key: 'preacher_curl', display: 'Preacher Curl' },
									{ key: 'cable_curl', display: 'Cable Curl' }
								]
							};
						} else if (msgLower.includes('tricep')) {
							fallbackWorkout = {
								name: 'Triceps Workout',
								exercises: [
									{ key: 'tricep_pushdown', display: 'Tricep Pushdown' },
									{ key: 'overhead_tricep_extension', display: 'Overhead Tricep Extension' },
									{ key: 'dips', display: 'Dips' }
								]
							};
						} else if (msgLower.includes('leg') || msgLower.includes('quad') || msgLower.includes('hamstring') || msgLower.includes('glute') || msgLower.includes('calf')) {
							fallbackWorkout = {
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
						
						if (fallbackWorkout) {
							if (loadingElement) loadingElement.remove();
							applyWorkoutFromVision(fallbackWorkout);
							switchTab('workouts');
							setTimeout(() => {
								showScreen('workout-builder');
							}, 100);
							addChatMessage(`✓ Created "${fallbackWorkout.name}" with ${fallbackWorkout.exercises.length} exercises!`, 'bot');
							sendBtn.disabled = false;
							return;
						}
					}
					
					// Fallback: Use the new vision-workout endpoint
					try {
						const apiUrl = getApiUrl('api/vision-workout');
						console.log('Calling vision-workout API:', apiUrl);
						console.log('BACKEND_URL:', BACKEND_URL);
						console.log('Request payload:', { message, workoutContext });
						
						if (!BACKEND_URL) {
							throw new Error('BACKEND_URL is not configured. Please set it in index.html');
						}
						
						// Create abort controller for timeout (60 seconds for Render cold start)
						const controller = new AbortController();
						const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
						
						// Start request immediately without blocking - update message while waiting - instant feedback
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
						
						const res = await fetch(apiUrl, {
					method: 'POST',
							headers: { 
								'Content-Type': 'application/json',
								'Accept': 'application/json'
							},
					body: JSON.stringify({ 
						message,
						workoutContext: workoutContext
							}),
							mode: 'cors', // Explicitly enable CORS
							credentials: 'omit', // Don't send cookies
							signal: controller.signal
				});
						
						clearInterval(updateInterval);
						clearTimeout(timeoutId);
						
						console.log('Response status:', res.status, res.statusText);
					
					// Remove loading message
					if (loadingElement) {
						loadingElement.remove();
					}
					
					if (!res.ok) {
							const errorText = await res.text();
							console.error('API error response:', errorText);
							let errorData;
							try {
								errorData = JSON.parse(errorText);
							} catch {
								errorData = { error: `Server error (${res.status}): ${errorText.substring(0, 100)}` };
							}
							// If muscle group was mentioned, try fallback workout
							if (hasMuscleGroup) {
								const fallbackWorkout = generateQuickWorkout(message);
								if (fallbackWorkout) {
									applyWorkoutFromVision(fallbackWorkout);
									switchTab('workouts');
									setTimeout(() => {
										showScreen('workout-builder');
									}, 100);
									addChatMessage(`✓ Created "${fallbackWorkout.name}" with ${fallbackWorkout.exercises.length} exercises!`, 'bot');
									sendBtn.disabled = false;
									return;
								}
							}
						addChatMessage(`Error: ${errorData.error || 'Failed to generate workout'}`, 'bot');
							sendBtn.disabled = false;
						return;
					}
				
				const data = await res.json();
						console.log('Workout data received:', data);
						
				if (data.error) {
					// If muscle group was mentioned, try fallback workout
					if (hasMuscleGroup) {
						const fallbackWorkout = generateQuickWorkout(message);
						if (fallbackWorkout) {
							applyWorkoutFromVision(fallbackWorkout);
							switchTab('workouts');
							setTimeout(() => {
								showScreen('workout-builder');
							}, 100);
							addChatMessage(`✓ Created "${fallbackWorkout.name}" with ${fallbackWorkout.exercises.length} exercises!`, 'bot');
							sendBtn.disabled = false;
							return;
						}
					}
					addChatMessage(`Error: ${data.error}`, 'bot');
							sendBtn.disabled = false;
							return;
					} else if (data.workout && data.workout.exercises && data.workout.exercises.length > 0) {
						// Successfully generated workout - apply it and switch to workout builder
							console.log('Applying workout from Vision:', data.workout);
							applyWorkoutFromVision(data.workout);
							
							// Show success message
						addChatMessage(`✓ Created "${data.workout.name}" with ${data.workout.exercises.length} exercises!`, 'bot');
							
							// Switch to workouts tab first, then navigate to workout builder
							switchTab('workouts');
							
							// Small delay to ensure tab switch completes, then show workout builder
							setTimeout(() => {
								showScreen('workout-builder');
								// Update navbar to show workouts as active (since workout-builder is a sub-screen)
								document.querySelectorAll('.nav-btn').forEach(btn => {
									btn.classList.remove('active');
								});
								const workoutsBtn = document.querySelector('.nav-btn[data-tab="workouts"]');
								if (workoutsBtn) workoutsBtn.classList.add('active');
							}, 150);
						} else {
						// If muscle group was mentioned, try fallback workout
						if (hasMuscleGroup) {
							const fallbackWorkout = generateQuickWorkout(message);
							if (fallbackWorkout) {
								applyWorkoutFromVision(fallbackWorkout);
								switchTab('workouts');
								setTimeout(() => {
									showScreen('workout-builder');
								}, 100);
								addChatMessage(`✓ Created "${fallbackWorkout.name}" with ${fallbackWorkout.exercises.length} exercises!`, 'bot');
								sendBtn.disabled = false;
								return;
							}
						}
						addChatMessage('No workout was generated. Please try again with a clearer request.', 'bot');
							sendBtn.disabled = false;
						}
						// Re-enable send button after successful workout generation
						if (data.workout && data.workout.exercises && data.workout.exercises.length > 0) {
							sendBtn.disabled = false;
						}
					} catch (apiError) {
						// Remove loading message
						if (loadingElement) {
							loadingElement.remove();
						}
						console.error('Vision workout API error:', apiError);
						console.error('Error name:', apiError?.name);
						console.error('Error message:', apiError?.message);
						console.error('Error stack:', apiError?.stack);
						
						let errorMsg = 'Failed to get response. Please try again.';
						if (!BACKEND_URL) {
							errorMsg = 'Backend server not configured. Please set BACKEND_URL in index.html to your deployed Flask backend URL (e.g., https://your-app.onrender.com).';
						} else if (apiError?.name === 'AbortError' || apiError?.message?.includes('timeout')) {
							errorMsg = `Request timed out. The backend server may be starting up (this can take up to 50 seconds on free tier). Please try again in a moment.`;
						} else if (apiError?.name === 'TypeError') {
							if (apiError?.message?.includes('Load failed') || apiError?.message?.includes('fetch') || apiError?.message?.includes('Failed to fetch')) {
								errorMsg = `Cannot connect to backend server. The server may be starting up (free tier takes ~50 seconds). Please wait a moment and try again.`;
							} else {
								errorMsg = `Network error: ${apiError?.message || 'Unknown error'}`;
							}
						} else if (apiError?.message) {
							errorMsg = `Error: ${apiError.message}`;
						}
						addChatMessage(errorMsg, 'bot');
						sendBtn.disabled = false;
						return;
					}
				} else {
					// Regular chat message - use the chat endpoint
					const res = await fetch(getApiUrl('chat'), {
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
					} else {
						addChatMessage(data.reply, 'bot');
					}
				}
			} catch (e) {
				console.error('Request failed:', e);
				// Remove loading message
				if (loadingElement) {
					loadingElement.remove();
				}
				// Show more helpful error message
				let errorMsg = 'Failed to get response. Please try again.';
				if (!BACKEND_URL) {
					errorMsg = 'Backend server not configured. Please set BACKEND_URL in index.html to your deployed Flask backend URL (e.g., https://your-app.onrender.com).';
				} else if (e.message && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError'))) {
					errorMsg = `Cannot connect to backend server at ${BACKEND_URL}. Please check if the server is running and accessible.`;
				}
				addChatMessage(errorMsg, 'bot');
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
		
		// Get video URL from button data attribute
		let videoUrl = btn.dataset.video;
		
		// If no video URL, try to get it from hardcoded exercises first, then backend
		if (!videoUrl) {
			const exerciseKey = btn.dataset.exercise;
			if (!exerciseKey) {
				alert('Exercise information not available.');
			return;
		}
		
			// First, check hardcoded exercises (for Capacitor)
			const hardcodedExercise = HARDCODED_EXERCISES.find(ex => {
				const key = normalizeExerciseKey(ex.key);
				const targetKey = normalizeExerciseKey(exerciseKey);
				return key === targetKey;
			});
			
			if (hardcodedExercise?.video) {
				videoUrl = hardcodedExercise.video;
				btn.dataset.video = videoUrl; // Cache for next time
			} else if (BACKEND_URL) {
				// Only try backend if BACKEND_URL is configured
			btn.disabled = true;
			try {
				const data = await fetchExerciseInfoByKey(exerciseKey);
				if (data?.video) {
					videoUrl = data.video;
						btn.dataset.video = videoUrl; // Cache for next time
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
			} else {
				alert('No video available for this exercise yet.');
				return;
			}
		}
		
		// Extract video ID and create watch URL
		let watchUrl = null;
		
		if (videoUrl) {
			if (videoUrl.includes('youtube.com/embed/')) {
				// Extract video ID from embed URL
				const match = videoUrl.match(/embed\/([^"&?\/\s]+)/);
				if (match && match[1]) {
					watchUrl = `https://www.youtube.com/watch?v=${match[1]}`;
				}
			} else if (videoUrl.includes('youtube.com/watch')) {
				// Already a watch URL
				watchUrl = videoUrl;
			} else if (videoUrl.includes('youtu.be/')) {
				// Short YouTube URL
				const match = videoUrl.match(/youtu\.be\/([^"&?\/\s]+)/);
				if (match && match[1]) {
					watchUrl = `https://www.youtube.com/watch?v=${match[1]}`;
				}
		} else {
				// Try to extract video ID from various YouTube URL formats
				const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
				const match = videoUrl.match(youtubeRegex);
				if (match && match[1]) {
					watchUrl = `https://www.youtube.com/watch?v=${match[1]}`;
				}
			}
		}
		
		// Open directly in YouTube app/browser
		if (watchUrl) {
			// Try to open in YouTube app first, then fallback to browser
			if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
				window.Capacitor.Plugins.Browser.open({ url: watchUrl });
			} else {
				window.open(watchUrl, '_blank');
			}
		} else {
			alert('No video available for this exercise.');
		}
	});
}

async function fetchExerciseInfoByKey(exerciseKey) {
	const apiUrl = getApiUrl('/exercise-info');
	const body = JSON.stringify({ exercise: exerciseKey });
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
// Hardcoded exercises list for Capacitor (when Flask server is not available)
const HARDCODED_EXERCISES = [
	// Chest
	{"key": "bench_press", "display": "Bench Press", "muscles": ["Chest", "Triceps", "Shoulders"], "image": "static/images/benchpress.jpg", "video": "https://www.youtube.com/embed/ejI1Nlsul9k"},
	{"key": "incline_bench_press", "display": "Incline Bench Press", "muscles": ["Chest", "Shoulders", "Triceps"], "image": "static/images/inclinebenchpress.jpg", "video": "https://www.youtube.com/embed/lJ2o89kcnxY"},
	{"key": "decline_bench_press", "display": "Decline Bench Press", "muscles": ["Chest", "Triceps", "Shoulders"], "image": "static/images/declinebenchpress.jpg", "video": "https://www.youtube.com/embed/iVh4B5bJ5OI"},
	{"key": "dumbbell_bench_press", "display": "Dumbbell Bench Press", "muscles": ["Chest", "Triceps", "Shoulders"], "image": "static/images/dumbbellbenchpress.png", "video": "https://www.youtube.com/embed/YQ2s_Y7g5Qk"},
	{"key": "dumbbell_fly", "display": "Dumbbell Fly", "muscles": ["Chest", "Shoulders"], "image": "static/images/dumbbellfly.jpg", "video": "https://www.youtube.com/embed/JFm8KbhjibM"},
	{"key": "cable_crossover", "display": "Cable Crossover", "muscles": ["Chest", "Shoulders", "Biceps"], "image": "static/images/cablecrossover.jpg", "video": "https://www.youtube.com/embed/hhruLxo9yZU"},
	{"key": "pec_deck_machine", "display": "Pec Deck Machine", "muscles": ["Chest", "Shoulders"], "image": "static/images/pecdeckmachine.jpg", "video": "https://www.youtube.com/embed/FDay9wFe5uE"},
	{"key": "chest_press_machine", "display": "Chest Press Machine", "muscles": ["Chest", "Triceps", "Shoulders"], "image": "static/images/chestpressmachine.jpg", "video": "https://www.youtube.com/embed/65npK4Ijz1c"},
	{"key": "push_up", "display": "Push-Up", "muscles": ["Chest", "Triceps", "Shoulders"], "image": "static/images/pushup.jpg", "video": "https://www.youtube.com/embed/WDIpL0pjun0"},
	{"key": "incline_dumbbell_press", "display": "Incline Dumbbell Press", "muscles": ["Chest", "Shoulders", "Triceps"], "image": "static/images/inclinedumbbellpress.jpg", "video": "https://www.youtube.com/embed/jMQA3XtJSgo"},
	{"key": "decline_dumbbell_press", "display": "Decline Dumbbell Press", "muscles": ["Chest", "Triceps", "Shoulders"], "image": "static/images/declinedumbbellpress.jpg", "video": "https://www.youtube.com/embed/2B6WxyLaIrE"},
	// Back
	{"key": "pull_up", "display": "Pull-Up", "muscles": ["Back", "Biceps", "Shoulders"], "image": "static/images/pullup.jpg", "video": "https://www.youtube.com/embed/eGo4IYlbE5g"},
	{"key": "chin_up", "display": "Chin-Up", "muscles": ["Biceps", "Back", "Shoulders"], "image": "static/images/chinup.jpg", "video": "https://www.youtube.com/embed/8mryJ3w2S78"},
	{"key": "lat_pulldown", "display": "Lat Pulldown", "muscles": ["Back", "Biceps", "Shoulders"], "image": "static/images/latpulldown.jpg", "video": "https://www.youtube.com/embed/JGeRYIZdojU"},
	{"key": "wide_grip_pulldown", "display": "Wide Grip Pulldown", "muscles": ["Back", "Biceps", "Shoulders"], "image": "static/images/widegrippulldown.jpg", "video": "https://www.youtube.com/embed/YCKPD4BSD2E"},
	{"key": "close_grip_pulldown", "display": "Close Grip Pulldown", "muscles": ["Back", "Biceps", "Shoulders"], "image": "static/images/closegrippulldown.jpg", "video": "https://www.youtube.com/embed/IjoFCmLX7z0"},
	{"key": "straight_arm_pulldown", "display": "Straight Arm Pulldown", "muscles": ["Back", "Shoulders"], "image": "static/images/straightarmpulldown.jpg", "video": "https://www.youtube.com/embed/G9uNaXGTJ4w"},
	{"key": "seated_row", "display": "Seated Row", "muscles": ["Back", "Biceps"], "image": "static/images/seatedrow.jpg", "video": "https://www.youtube.com/embed/UCXxvVItLoM"},
	{"key": "t_bar_row", "display": "T-Bar Row", "muscles": ["Back", "Biceps"], "image": "static/images/tbarrow.jpg", "video": "https://www.youtube.com/embed/yPis7nlbqdY"},
	{"key": "bent_over_row", "display": "Bent Over Row", "muscles": ["Back", "Biceps"], "image": "static/images/bentoverrow.jpg", "video": "https://www.youtube.com/embed/6FZHJGzMFEc"},
	{"key": "one_arm_dumbbell_row", "display": "One Arm Dumbbell Row", "muscles": ["Back", "Biceps"], "image": "static/images/onearmdumbbellrow.jpg", "video": "https://www.youtube.com/embed/DMo3HJoawrU"},
	{"key": "chest_supported_row", "display": "Chest Supported Row", "muscles": ["Back", "Biceps"], "image": "static/images/chestsupportedrow.jpg", "video": "https://www.youtube.com/embed/tZUYS7X50so"},
	{"key": "lat_pullover_machine", "display": "Lat Pullover Machine", "muscles": ["Back", "Chest"], "image": "static/images/latpullovermachine.jpg", "video": "https://www.youtube.com/embed/oxpAl14EYyc"},
	{"key": "deadlift", "display": "Deadlift", "muscles": ["Back", "Glutes", "Hamstrings"], "image": "static/images/deadlift.jpg", "video": "https://www.youtube.com/embed/AweC3UaM14o"},
	{"key": "romanian_deadlift", "display": "Romanian Deadlift", "muscles": ["Hamstrings", "Glutes", "Back"], "image": "static/images/romaniandeadlift.jpg", "video": "https://www.youtube.com/embed/bT5OOBgY4bc"},
	{"key": "sumo_deadlift", "display": "Sumo Deadlift", "muscles": ["Glutes", "Hamstrings", "Back"], "image": "static/images/sumodeadlift.jpg", "video": "https://www.youtube.com/embed/pfSMst14EFk"},
	// Shoulders
	{"key": "shoulder_press_machine", "display": "Shoulder Press Machine", "muscles": ["Shoulders", "Triceps"], "image": "static/images/shoulderpressmachine.jpg", "video": "https://www.youtube.com/embed/WvLMauqrnK8"},
	{"key": "overhead_press", "display": "Overhead Press", "muscles": ["Shoulders", "Triceps"], "image": "static/images/overheadpress.jpg", "video": "https://www.youtube.com/embed/G2qpTG1Eh40"},
	{"key": "arnold_press", "display": "Arnold Press", "muscles": ["Shoulders", "Triceps"], "image": "static/images/arnoldpress.jpg", "video": "https://www.youtube.com/embed/jeJttN2EWCo"},
	{"key": "dumbbell_shoulder_press", "display": "Dumbbell Shoulder Press", "muscles": ["Shoulders", "Triceps"], "image": "static/images/dumbbellshoulderpress.jpg", "video": "https://www.youtube.com/embed/HzIiNhHhhtA"},
	{"key": "front_raise", "display": "Front Raise", "muscles": ["Shoulders"], "image": "static/images/frontraise.jpg", "video": "https://www.youtube.com/embed/hRJ6tR5-if0"},
	{"key": "lateral_raise", "display": "Lateral Raise", "muscles": ["Shoulders"], "image": "static/images/lateralraise.jpg", "video": "https://www.youtube.com/embed/OuG1smZTsQQ"},
	{"key": "lateral_raise_machine", "display": "Lateral Raise Machine", "muscles": ["Shoulders"], "image": "static/images/lateralraisemachine.jpg", "video": "https://www.youtube.com/embed/xMEs3zEzS8s"},
	{"key": "rear_delt_fly", "display": "Rear Delt Fly", "muscles": ["Shoulders", "Back"], "image": "static/images/reardeltfly.jpg", "video": "https://www.youtube.com/embed/nlkF7_2O_Lw"},
	{"key": "reverse_pec_deck", "display": "Reverse Pec Deck", "muscles": ["Shoulders", "Back"], "image": "static/images/reversepecdeck.jpg", "video": "https://www.youtube.com/embed/jw7oFFBnwCU"},
	{"key": "upright_row", "display": "Upright Row", "muscles": ["Shoulders", "Triceps"], "image": "static/images/uprightrow.jpg", "video": "https://www.youtube.com/embed/um3VVzqunPU"},
	{"key": "cable_face_pull", "display": "Cable Face Pull", "muscles": ["Shoulders", "Back"], "image": "static/images/cablefacepull.jpg", "video": "https://www.youtube.com/embed/0Po47vvj9g4"},
	// Biceps
	{"key": "barbell_curl", "display": "Barbell Curl", "muscles": ["Biceps"], "image": "static/images/barbellcurl.jpg", "video": "https://www.youtube.com/embed/N5x5M1x1Gd0"},
	{"key": "dumbbell_curl", "display": "Dumbbell Curl", "muscles": ["Biceps"], "image": "static/images/dumbbellcurl.jpg", "video": "https://www.youtube.com/embed/6DeLZ6cbgWQ"},
	{"key": "alternating_dumbbell_curl", "display": "Alternating Dumbbell Curl", "muscles": ["Biceps"], "image": "static/images/alternatingdumbbellcurl.jpg", "video": "https://www.youtube.com/embed/o2Tma5Cek48"},
	{"key": "hammer_curl", "display": "Hammer Curl", "muscles": ["Biceps"], "image": "static/images/hammercurl.jpg", "video": "https://www.youtube.com/embed/fM0TQLoesLs"},
	{"key": "preacher_curl", "display": "Preacher Curl", "muscles": ["Biceps"], "image": "static/images/preachercurl.jpg", "video": "https://www.youtube.com/embed/Ja6ZlIDONac"},
	{"key": "cable_curl", "display": "Cable Curl", "muscles": ["Biceps"], "image": "static/images/cablecurl.jpg", "video": "https://www.youtube.com/embed/F3Y03RnVY8Y"},
	{"key": "incline_dumbbell_curl", "display": "Incline Dumbbell Curl", "muscles": ["Biceps"], "image": "static/images/inclinedumbbellcurl.jpg", "video": "https://www.youtube.com/embed/aG7CXiKxepw"},
	{"key": "ez_bar_curl", "display": "EZ Bar Curl", "muscles": ["Biceps"], "image": "static/images/ezbarcurl.jpg", "video": "https://www.youtube.com/embed/-gSM-kqNlUw"},
	{"key": "reverse_curl", "display": "Reverse Curl", "muscles": ["Biceps"], "image": "static/images/reversecurl.jpg", "video": "https://www.youtube.com/embed/hUA-fIpM7nA"},
	{"key": "spider_curl", "display": "Spider Curl", "muscles": ["Biceps"], "image": "static/images/spidercurl.jpg", "video": "https://www.youtube.com/embed/ke2shAeQ0O8"},
	// Triceps
	{"key": "tricep_pushdown", "display": "Tricep Pushdown", "muscles": ["Triceps", "Shoulders"], "image": "static/images/triceppushdown.jpg", "video": "https://www.youtube.com/embed/6Fzep104f0s"},
	{"key": "overhead_tricep_extension", "display": "Overhead Tricep Extension", "muscles": ["Triceps", "Shoulders"], "image": "static/images/overheadtricepextension.jpg", "video": "https://www.youtube.com/embed/a9oPnZReIRE"},
	{"key": "cable_overhead_extension", "display": "Cable Overhead Extension", "muscles": ["Triceps", "Shoulders"], "image": "static/images/cableoverheadextension.jpg", "video": "https://www.youtube.com/embed/ns-RGsbzqok"},
	{"key": "close_grip_bench_press", "display": "Close Grip Bench Press", "muscles": ["Triceps", "Chest"], "image": "static/images/closegripbenchpress.jpg", "video": "https://www.youtube.com/embed/FiQUzPtS90E"},
	{"key": "dips", "display": "Dips", "muscles": ["Triceps", "Chest", "Shoulders"], "image": "static/images/dips.jpg", "video": "https://www.youtube.com/embed/oA8Sxv2WeOs"},
	{"key": "seated_dip_machine", "display": "Seated Dip Machine", "muscles": ["Triceps", "Chest"], "image": "static/images/seateddipmachine.jpg", "video": "https://www.youtube.com/embed/Zg0tT27iYuY"},
	{"key": "skull_crusher", "display": "Skull Crusher", "muscles": ["Triceps", "Shoulders"], "image": "static/images/skullcrusher.jpg", "video": "https://www.youtube.com/embed/l3rHYPtMUo8"},
	{"key": "rope_pushdown", "display": "Rope Pushdown", "muscles": ["Triceps", "Shoulders"], "image": "static/images/ropepushdown.jpg", "video": "https://www.youtube.com/embed/-xa-6cQaZKY"},
	{"key": "single_arm_cable_pushdown", "display": "Single Arm Cable Pushdown", "muscles": ["Triceps"], "image": "static/images/singlearmcablepushdown.jpg", "video": "https://www.youtube.com/embed/Cp_bShvMY4c"},
	{"key": "diamond_push_up", "display": "Diamond Push-Up", "muscles": ["Triceps", "Chest", "Shoulders"], "image": "static/images/diamondpushup.jpg", "video": "https://www.youtube.com/embed/K8bKxVcwjrk"},
	// Quads
	{"key": "squat", "display": "Squat", "muscles": ["Quads", "Glutes", "Hamstrings"], "image": "static/images/squat.jpg", "video": "https://www.youtube.com/embed/rrJIyZGlK8c"},
	{"key": "hack_squat", "display": "Hack Squat", "muscles": ["Quads", "Glutes", "Hamstrings"], "image": "static/images/hacksquat.jpg", "video": "https://www.youtube.com/embed/rYgNArpwE7E"},
	{"key": "leg_press", "display": "Leg Press", "muscles": ["Quads", "Glutes", "Hamstrings"], "image": "static/images/legpress.jpg", "video": "https://www.youtube.com/embed/yZmx_Ac3880"},
	{"key": "leg_extension", "display": "Leg Extension", "muscles": ["Quads"], "image": "static/images/legextension.jpg", "video": "https://www.youtube.com/embed/m0FOpMEgero"},
	{"key": "bulgarian_split_squat", "display": "Bulgarian Split Squat", "muscles": ["Quads", "Glutes"], "image": "static/images/bulgariansplitsquat.jpg", "video": "https://www.youtube.com/embed/vgn7bSXkgkA"},
	{"key": "smith_machine_squat", "display": "Smith Machine Squat", "muscles": ["Quads", "Glutes", "Hamstrings"], "image": "static/images/smithmachinesquat.jpg", "video": "https://www.youtube.com/embed/-eO_VydErV0"},
	{"key": "v_squat", "display": "V Squat", "muscles": ["Quads", "Glutes", "Hamstrings"], "image": "static/images/vsquat.jpg", "video": "https://www.youtube.com/embed/u2n1vqVDYE4"},
	{"key": "smith_machine_bench_press", "display": "Smith Machine Bench Press", "muscles": ["Chest", "Triceps", "Shoulders"], "image": "static/images/smithmachinebenchpress.jpg", "video": "https://www.youtube.com/embed/O5viuEPDXKY"},
	{"key": "smith_machine_incline_bench_press", "display": "Smith Machine Incline Bench Press", "muscles": ["Chest", "Shoulders", "Triceps"], "image": "static/images/smithmachineinclinebenchpress.jpg", "video": "https://www.youtube.com/embed/8urE8Z8AMQ4"},
	{"key": "smith_machine_decline_bench_press", "display": "Smith Machine Decline Bench Press", "muscles": ["Chest", "Triceps", "Shoulders"], "image": "static/images/smithmachinedeclinebenchpress.jpg", "video": "https://www.youtube.com/embed/R1Cwq8rJ_bI"},
	{"key": "smith_machine_shoulder_press", "display": "Smith Machine Shoulder Press", "muscles": ["Shoulders", "Triceps"], "image": "static/images/smithmachineshoulderpress.jpg", "video": "https://www.youtube.com/embed/OLqZDUUD2b0"},
	{"key": "goblet_squat", "display": "Goblet Squat", "muscles": ["Quads", "Glutes", "Hamstrings"], "image": "static/images/gobletsquat.jpg", "video": "https://www.youtube.com/embed/pEGfGwp6IEA"},
	// Hamstrings
	{"key": "lying_leg_curl", "display": "Lying Leg Curl", "muscles": ["Hamstrings", "Glutes"], "image": "static/images/lyinglegcurl.jpg", "video": "https://www.youtube.com/embed/SbSNUXPRkc8"},
	{"key": "seated_leg_curl_machine", "display": "Seated Leg Curl Machine", "muscles": ["Hamstrings", "Glutes"], "image": "static/images/seatedlegcurlmachine.jpg", "video": "https://www.youtube.com/embed/Orxowest56U"},
	{"key": "good_morning", "display": "Good Morning", "muscles": ["Hamstrings", "Glutes", "Back"], "image": "static/images/goodmorning.jpg", "video": "https://www.youtube.com/embed/dEJ0FTm-CEk"},
	// Glutes
	{"key": "hip_thrust", "display": "Hip Thrust", "muscles": ["Glutes", "Hamstrings"], "image": "static/images/hipthrust.jpg", "video": "https://www.youtube.com/embed/pUdIL5x0fWg"},
	{"key": "cable_kickback", "display": "Cable Kickback", "muscles": ["Glutes", "Hamstrings"], "image": "static/images/cablekickback.jpg", "video": "https://www.youtube.com/embed/zjVK1sOqFdw"},
	{"key": "abductor_machine", "display": "Abductor Machine", "muscles": ["Glutes"], "image": "static/images/abductormachine.jpg", "video": "https://www.youtube.com/embed/G_8LItOiZ0Q"},
	{"key": "adductor_machine", "display": "Adductor Machine", "muscles": ["Glutes"], "image": "static/images/adductormachine.jpg", "video": "https://www.youtube.com/embed/CjAVezAggkI"},
	// Calves
	{"key": "standing_calf_raise", "display": "Standing Calf Raise", "muscles": ["Calves"], "image": "static/images/standingcalfraise.jpg", "video": "https://www.youtube.com/embed/g_E7_q1z2bo"},
	{"key": "seated_calf_raise", "display": "Seated Calf Raise", "muscles": ["Calves"], "image": "static/images/seatedcalfraise.jpg", "video": "https://www.youtube.com/embed/2Q-HQ3mnePg"},
	{"key": "leg_press_calf_raise", "display": "Leg Press Calf Raise", "muscles": ["Calves"], "image": "static/images/legpresscalfraise.jpg", "video": "https://www.youtube.com/embed/KxEYX_cuesM"},
	{"key": "donkey_calf_raise", "display": "Donkey Calf Raise", "muscles": ["Calves"], "image": "static/images/donkeycalfraise.jpg", "video": "https://www.youtube.com/embed/r30EoMPSNns"},
	// Abs
	{"key": "crunch", "display": "Crunch", "muscles": ["Abs"], "image": "static/images/crunch.jpg", "video": "https://www.youtube.com/embed/NnVhqMQRvmM"},
	{"key": "cable_crunch", "display": "Cable Crunch", "muscles": ["Abs"], "image": "static/images/cablecrunch.jpg", "video": "https://www.youtube.com/embed/b9FJ4hIK3pI"},
	{"key": "decline_sit_up", "display": "Decline Sit-Up", "muscles": ["Abs"], "image": "static/images/declinesitup.jpg", "video": "https://www.youtube.com/embed/DAnTf16NcT0"},
	{"key": "hanging_leg_raise", "display": "Hanging Leg Raise", "muscles": ["Abs"], "image": "static/images/hanginglegraise.jpg", "video": "https://www.youtube.com/embed/7FwGZ8qY5OU"},
	{"key": "knee_raise", "display": "Knee Raise", "muscles": ["Abs"], "image": "static/images/kneeraise.jpg", "video": "https://www.youtube.com/embed/RD_A-Z15ER4"},
	{"key": "russian_twist", "display": "Russian Twist", "muscles": ["Abs", "Back"], "image": "static/images/russiantwist.jpg", "video": "https://www.youtube.com/embed/99T1EfpMwPA"},
	{"key": "rotary_torso_machine", "display": "Rotary Torso Machine", "muscles": ["Abs", "Back"], "image": "static/images/rotarytorsomachine.jpg", "video": "https://www.youtube.com/embed/h5naeryzGjE"}
];

async function loadExercises() {
	try {
		const res = await fetch('/exercises');
		if (res.ok) {
		const data = await res.json();
		allExercises = data.exercises || [];
		} else {
			throw new Error('Server not available');
		}
	} catch (e) {
		// In Capacitor, Flask server is not available - use hardcoded exercises
		console.log('Using hardcoded exercises (Capacitor mode)');
		allExercises = HARDCODED_EXERCISES;
	}
	
	// If exercise selector is open, refresh the display
	const selector = document.getElementById('exercise-selector');
	if (selector && !selector.classList.contains('hidden')) {
		const searchInput = document.getElementById('exercise-selector-search');
		const selectedMuscle = document.querySelector('#exercise-selector-muscles button.active')?.textContent || null;
		if (window.filterExercisesForSelector) {
			window.filterExercisesForSelector(searchInput?.value || '', selectedMuscle === 'All' ? null : selectedMuscle);
		}
	}
}

async function loadStreak() {
	const user = await getCurrentUser();
	if (!user) {
	document.querySelectorAll('.streak-count').forEach(el => {
			if (el) el.textContent = '0';
		});
		return 0;
	}
	
	try {
		// Get streak from workouts - count consecutive days with workouts
		const { data: workouts, error } = await supabaseClient
			.from('workouts')
			.select('date')
			.eq('user_id', user.id)
			.order('date', { ascending: false });
		
		if (error) {
			console.error("Supabase error loading workouts for streak:", error);
			throw error;
		}
		
		// Calculate streak from workout dates
		let streak = 0;
		if (workouts && workouts.length > 0) {
	const today = new Date();
			today.setHours(0, 0, 0, 0);
			let checkDate = new Date(today);
			
			for (const workout of workouts) {
				// Handle date string (YYYY-MM-DD) or Date object
				const dateStr = typeof workout.date === 'string' ? workout.date : workout.date.toISOString().split('T')[0];
				const workoutDate = new Date(dateStr);
				workoutDate.setHours(0, 0, 0, 0);
				
				if (workoutDate.getTime() === checkDate.getTime()) {
					streak++;
					checkDate.setDate(checkDate.getDate() - 1);
				} else if (workoutDate.getTime() < checkDate.getTime()) {
					break;
				}
			}
		}
		
		document.querySelectorAll('.streak-count').forEach(el => {
			if (el) el.textContent = streak;
		});
		
		return streak;
	} catch (error) {
		console.error('Error loading streak:', error);
		document.querySelectorAll('.streak-count').forEach(el => {
			if (el) el.textContent = '0';
		});
		return 0;
	}
}

async function updateStreak() {
	// Streak is automatically calculated from workouts, so just reload it
	await loadStreak();
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
function showAIDetectErrorModal(errorDetails) {
	console.error('❌ Showing AI Detect Error Modal', errorDetails);
	
	const modal = document.getElementById('ai-detect-error-modal');
	if (modal) {
		// Update error message if provided
		const errorMsg = modal.querySelector('.ai-detect-error-message');
		if (errorMsg && errorDetails) {
			errorMsg.textContent = errorDetails;
		}
		
		modal.classList.remove('hidden');
		
		// Close on backdrop click
		const backdrop = modal.querySelector('.ai-detect-error-backdrop');
		if (backdrop) {
			backdrop.onclick = () => {
				modal.classList.add('hidden');
			};
		}
		
		// Close on button click
		const tryAgainBtn = document.getElementById('ai-detect-error-try-again');
		if (tryAgainBtn) {
			tryAgainBtn.onclick = () => {
				modal.classList.add('hidden');
			};
		}
	} else {
		console.error('❌ AI Detect Error Modal not found in DOM!');
		// Fallback: show alert
		alert('AI Detection Error: ' + (errorDetails || 'Could not detect an exercise from this photo.'));
	}
}

// Make exercise selector accessible from workout builder
window.openExerciseSelector = openExerciseSelector;
window.addExerciseToWorkout = addExerciseToWorkout;

