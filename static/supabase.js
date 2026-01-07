// Supabase Configuration
const SUPABASE_URL = 'https://gdpfxtlhlkzckfvsuhws.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eHk0ZZBkUPoK8_93vsrrfQ_MvTuwlj0';

// Create Supabase client
const supabase = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper functions voor workouts
const workoutService = {
	// Get all workouts for current user
	async getWorkouts() {
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) return [];

		const { data, error } = await supabase
			.from('workouts')
			.select('*')
			.eq('user_id', user.id)
			.order('date', { ascending: false });

		if (error) {
			console.error('Error fetching workouts:', error);
			return [];
		}

		return data || [];
	},

	// Save workout
	async saveWorkout(workout) {
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) {
			throw new Error('Not authenticated');
		}

		const workoutData = {
			user_id: user.id,
			name: workout.name,
			date: workout.date || new Date().toISOString(),
			exercises: workout.exercises || []
		};

		// Check if workout.id is a UUID (Supabase format) or number (local storage format)
		const isUUID = workout.id && typeof workout.id === 'string' && workout.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
		
		if (isUUID) {
			// Update existing workout (UUID format from Supabase)
			const { data, error } = await supabase
				.from('workouts')
				.update(workoutData)
				.eq('id', workout.id)
				.eq('user_id', user.id)
				.select()
				.single();

			if (error) throw error;
			return data;
		} else {
			// Create new workout
			const { data, error } = await supabase
				.from('workouts')
				.insert([workoutData])
				.select()
				.single();

			if (error) throw error;
			return data;
		}
	},

	// Delete workout
	async deleteWorkout(workoutId) {
		const { data: { user } } = await supabase.auth.getUser();
		if (!user) {
			throw new Error('Not authenticated');
		}

		const { error } = await supabase
			.from('workouts')
			.delete()
			.eq('id', workoutId)
			.eq('user_id', user.id);

		if (error) throw error;
	}
};

// Helper functions voor auth
const authService = {
	// Sign up
	async signUp(email, password, username) {
		const { data, error } = await supabase.auth.signUp({
			email,
			password,
			options: {
				data: {
					username: username || email.split('@')[0] // Use email prefix if no username
				},
				emailRedirectTo: undefined // Don't require email confirmation for native app
			}
		});

		if (error) {
			// Better error messages
			if (error.message.includes('already registered')) {
				throw new Error('This email is already registered. Please sign in instead.');
			}
			if (error.message.includes('Password')) {
				throw new Error('Password must be at least 6 characters.');
			}
			throw new Error(error.message || 'Registration failed');
		}
		return data;
	},

	// Sign in
	async signIn(email, password) {
		const { data, error } = await supabase.auth.signInWithPassword({
			email,
			password
		});

		if (error) {
			// Better error messages
			if (error.message.includes('Invalid login credentials')) {
				throw new Error('Invalid email or password.');
			}
			if (error.message.includes('Email not confirmed')) {
				throw new Error('Please check your email and confirm your account.');
			}
			throw new Error(error.message || 'Login failed');
		}
		return data;
	},

	// Sign out
	async signOut() {
		const { error } = await supabase.auth.signOut();
		if (error) throw error;
	},

	// Get current user
	async getCurrentUser() {
		const { data: { user } } = await supabase.auth.getUser();
		return user;
	},

	// Check if user is authenticated
	async isAuthenticated() {
		const user = await this.getCurrentUser();
		return !!user;
	}
};

// Make available globally
window.supabase = supabase;
window.workoutService = workoutService;
window.authService = authService;
