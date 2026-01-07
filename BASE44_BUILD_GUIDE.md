# GymVision AI - Complete Build Guide for base44

## 📱 App Overview

**GymVision AI** is a fitness tracking mobile application that uses AI (YOLO computer vision models) to automatically detect gym exercises from photos. Users can take photos of gym equipment, and the app identifies the exercise, shows instructional videos, tracks workouts, and provides progress analytics.

### Key Features:
1. **AI Exercise Detection** - Take a photo, AI identifies the exercise with confidence score
2. **Workout Builder** - Create custom workouts with sets, reps, and weights
3. **Progress Tracking** - Track weight progression, muscle focus, PRs, and streaks
4. **AI Chat Assistant** - "Vision" chatbot for fitness advice and workout generation
5. **Exercise Library** - 90+ exercises with videos, images, and muscle group info
6. **User Authentication** - Email-based registration with verification

---

## 🏗️ Technical Architecture

### Backend (Flask/Python)
- **Framework**: Flask 3.0+
- **Database**: SQLite (gymvision.db)
- **Authentication**: Flask-Login with email verification
- **AI Models**: 5 YOLO models (best.pt, best1.pt, best2.pt, best3.pt, best4.pt)
- **AI Chat**: Groq API (Llama 3.3 70B)
- **Email**: Flask-Mail (Gmail SMTP)

### Frontend
- **Technology**: Vanilla JavaScript (no frameworks)
- **Styling**: Custom CSS with dark theme (#0f0f10)
- **Icons**: Custom PNG icons
- **Fonts**: Inter (Google Fonts)

### Key Endpoints:
- `POST /predict` - AI exercise detection (requires image upload)
- `POST /chat` - AI fitness assistant
- `GET /exercises` - List all exercises
- `POST /exercise-info` - Get exercise metadata
- `POST /login`, `/register`, `/verify` - Authentication
- `GET /check-auth` - Session check

---

## 📦 What to Provide base44

### 1. **Source Code Files** (Essential)
```
GV_AI/
├── app.py                    # Main Flask backend (1488 lines)
├── requirements.txt          # Python dependencies
├── static/
│   ├── index.html           # Main HTML (350+ lines)
│   ├── app.js              # Frontend JavaScript (3128 lines)
│   ├── styles.css          # All styling
│   ├── manifest.webmanifest # PWA manifest
│   └── [icon files]        # check.png, close.png, pencil.png, etc.
├── templates/
│   ├── index.html          # Main template
│   ├── login.html          # Login page
│   ├── register.html       # Registration page
│   └── verify.html         # Email verification page
└── www/                     # Alternative static files (if needed)
```

### 2. **AI Model Files** (Critical - Large files)
- `best.pt` - YOLO model for leg exercises
- `best1.pt` - YOLO model for machine exercises
- `best2.pt` - YOLO model for specific machines
- `best3.pt` - YOLO model for equipment detection
- `best4.pt` - YOLO model for bench/lat/leg press

**Note**: These are PyTorch model files (~50-200MB each). They MUST be included for AI detection to work.

### 3. **Exercise Images** (91 JPG files)
All exercise images are in `/images/` directory:
- `benchpress.jpg`, `squat.jpg`, `deadlift.jpg`, etc.
- See complete list in "Exercise Assets" section below

### 4. **Logo & Branding Assets**
- `gymvision-removebg-preview.png` or `GymVision_AI-removebg-preview.png` (logo)
- `flame-removebg-preview.png` (streak/flame icon)
- `loupe.png` (explore/search icon)
- Navigation icons: `dumbell.png`, `progress.png`, `settings.png`, `home.png`

### 5. **Screenshots for Reference** (Recommended)
Take screenshots of:
- Home screen (camera view with exercise detection)
- Workout builder screen
- Progress/analytics screen
- Exercise info modal with video
- Settings screen
- Login/register screens

### 6. **Environment Variables Needed**
```
SECRET_KEY=<random-secret-key-for-sessions>
GROQ_API_KEY=<your-groq-api-key>
MAIL_USERNAME=<gmail-address>
MAIL_PASSWORD=<gmail-app-password>
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=true
```

### 7. **Database Schema**
SQLite database (`gymvision.db`) with tables:
- `users` - id, email, username, password_hash, email_verified, created_at
- `verification_codes` - id, email, code, created_at, expires_at
- (Workout data stored in browser localStorage, not database)

---

## 🎯 Complete Exercise Database

### Exercise Metadata Structure
Each exercise has:
- **key**: Internal identifier (e.g., "bench_press")
- **display**: User-friendly name (e.g., "Bench Press")
- **muscles**: Array of 3 muscle groups [Primary, Secondary, Support]
- **video**: YouTube embed URL
- **image**: Local image path or external URL

### All 90+ Exercises with YouTube Links

#### CHEST EXERCISES (10)
1. **Bench Press**
   - Video: `https://www.youtube.com/embed/ejI1Nlsul9k`
   - Muscles: Chest, Triceps, Shoulders
   - Image: `benchpress.jpg`

2. **Incline Bench Press**
   - Video: `https://www.youtube.com/embed/lJ2o89kcnxY`
   - Muscles: Chest, Shoulders, Triceps
   - Image: `inclinebenchpress.jpg`

3. **Decline Bench Press**
   - Video: `https://www.youtube.com/embed/iVh4B5bJ5OI`
   - Muscles: Chest, Triceps, Shoulders
   - Image: `declinebenchpress.jpg`

4. **Dumbbell Bench Press**
   - Video: `https://www.youtube.com/embed/YQ2s_Y7g5Qk`
   - Muscles: Chest, Triceps, Shoulders
   - Image: `dumbbellbenchpress.png` (or local)

5. **Dumbbell Fly**
   - Video: `https://www.youtube.com/embed/JFm8KbhjibM`
   - Muscles: Chest, Shoulders
   - Image: `dumbbellfly.jpg`

6. **Cable Crossover**
   - Video: `https://www.youtube.com/embed/hhruLxo9yZU`
   - Muscles: Chest, Shoulders, Biceps
   - Image: `cablecrossover.jpg`

7. **Pec Deck Machine**
   - Video: `https://www.youtube.com/embed/FDay9wFe5uE`
   - Muscles: Chest, Shoulders
   - Image: `pecdeckmachine.jpg`

8. **Chest Press Machine**
   - Video: `https://www.youtube.com/embed/65npK4Ijz1c`
   - Muscles: Chest, Triceps, Shoulders
   - Image: `chestpressmachine.jpg`

9. **Push-Up**
   - Video: `https://www.youtube.com/embed/WDIpL0pjun0`
   - Muscles: Chest, Triceps, Shoulders
   - Image: `pushup.jpg`

10. **Incline Dumbbell Press**
    - Video: `https://www.youtube.com/embed/jMQA3XtJSgo`
    - Muscles: Chest, Shoulders, Triceps
    - Image: `inclinedumbbellpress.jpg`

#### BACK EXERCISES (13)
11. **Pull-Up**
    - Video: `https://www.youtube.com/embed/eGo4IYlbE5g`
    - Muscles: Back, Biceps, Shoulders
    - Image: `pullup.jpg`

12. **Chin-Up**
    - Video: `https://www.youtube.com/embed/8mryJ3w2S78`
    - Muscles: Biceps, Back, Shoulders
    - Image: `chinup.jpg`

13. **Lat Pulldown**
    - Video: `https://www.youtube.com/embed/JGeRYIZdojU`
    - Muscles: Back, Biceps, Shoulders
    - Image: `latpulldown.jpg`

14. **Wide Grip Pulldown**
    - Video: `https://www.youtube.com/embed/YCKPD4BSD2E`
    - Muscles: Back, Biceps, Shoulders
    - Image: `widegrippulldown.jpg`

15. **Close Grip Pulldown**
    - Video: `https://www.youtube.com/embed/IjoFCmLX7z0`
    - Muscles: Back, Biceps, Shoulders
    - Image: `closegrippulldown.jpg`

16. **Straight Arm Pulldown**
    - Video: `https://www.youtube.com/embed/G9uNaXGTJ4w`
    - Muscles: Back, Shoulders
    - Image: `straightarmpulldown.jpg`

17. **Seated Row**
    - Video: `https://www.youtube.com/embed/UCXxvVItLoM`
    - Muscles: Back, Biceps
    - Image: `seatedrow.jpg`

18. **T-Bar Row**
    - Video: `https://www.youtube.com/embed/yPis7nlbqdY`
    - Muscles: Back, Biceps
    - Image: `tbarrow.jpg`

19. **Bent Over Row**
    - Video: `https://www.youtube.com/embed/6FZHJGzMFEc`
    - Muscles: Back, Biceps
    - Image: `bentoverrow.jpg`

20. **One Arm Dumbbell Row**
    - Video: `https://www.youtube.com/embed/DMo3HJoawrU`
    - Muscles: Back, Biceps
    - Image: `onearmdumbbellrow.jpg`

21. **Chest Supported Row**
    - Video: `https://www.youtube.com/embed/tZUYS7X50so`
    - Muscles: Back, Biceps
    - Image: `chestsupportedrow.jpg`

22. **Lat Pullover Machine**
    - Video: `https://www.youtube.com/embed/oxpAl14EYyc`
    - Muscles: Back, Chest
    - Image: `latpullovermachine.jpg`

23. **Deadlift**
    - Video: `https://www.youtube.com/embed/AweC3UaM14o`
    - Muscles: Back, Glutes, Hamstrings
    - Image: `deadlift.jpg`

24. **Romanian Deadlift**
    - Video: `https://www.youtube.com/embed/bT5OOBgY4bc`
    - Muscles: Hamstrings, Glutes, Back
    - Image: `romaniandeadlift.jpg`

25. **Sumo Deadlift**
    - Video: `https://www.youtube.com/embed/pfSMst14EFk`
    - Muscles: Glutes, Hamstrings, Back
    - Image: `sumodeadlift.jpg`

#### SHOULDER EXERCISES (10)
26. **Shoulder Press Machine**
    - Video: `https://www.youtube.com/embed/WvLMauqrnK8`
    - Muscles: Shoulders, Triceps
    - Image: `shoulderpressmachine.jpg` or `machineshoulderpress.jpg`

27. **Overhead Press**
    - Video: `https://www.youtube.com/embed/G2qpTG1Eh40`
    - Muscles: Shoulders, Triceps
    - Image: `overheadpress.jpg`

28. **Arnold Press**
    - Video: `https://www.youtube.com/embed/jeJttN2EWCo`
    - Muscles: Shoulders, Triceps
    - Image: `arnoldpress.jpg`

29. **Dumbbell Shoulder Press**
    - Video: `https://www.youtube.com/embed/HzIiNhHhhtA`
    - Muscles: Shoulders, Triceps
    - Image: `dumbbellshoulderpress.jpg`

30. **Front Raise**
    - Video: `https://www.youtube.com/embed/hRJ6tR5-if0`
    - Muscles: Shoulders
    - Image: `frontraise.jpg`

31. **Lateral Raise**
    - Video: `https://www.youtube.com/embed/OuG1smZTsQQ`
    - Muscles: Shoulders
    - Image: `lateralraise.jpg`

32. **Lateral Raise Machine**
    - Video: `https://www.youtube.com/embed/xMEs3zEzS8s`
    - Muscles: Shoulders
    - Image: `lateralraisemachine.jpg` or `machinelateralraise.jpg`

33. **Rear Delt Fly**
    - Video: `https://www.youtube.com/embed/nlkF7_2O_Lw`
    - Muscles: Shoulders, Back
    - Image: `reardeltfly.jpg`

34. **Reverse Pec Deck**
    - Video: `https://www.youtube.com/embed/jw7oFFBnwCU`
    - Muscles: Shoulders, Back
    - Image: `reversepecdeck.jpg`

35. **Upright Row**
    - Video: `https://www.youtube.com/embed/um3VVzqunPU`
    - Muscles: Shoulders, Triceps
    - Image: `uprightrow.jpg`

36. **Cable Face Pull**
    - Video: `https://www.youtube.com/embed/0Po47vvj9g4`
    - Muscles: Shoulders, Back
    - Image: `cablefacepull.jpg`

#### BICEP EXERCISES (10)
37. **Barbell Curl**
    - Video: `https://www.youtube.com/embed/N5x5M1x1Gd0`
    - Muscles: Biceps
    - Image: `barbellcurl.jpg`

38. **Dumbbell Curl**
    - Video: `https://www.youtube.com/embed/6DeLZ6cbgWQ`
    - Muscles: Biceps
    - Image: `dumbbellcurl.jpg`

39. **Alternating Dumbbell Curl**
    - Video: `https://www.youtube.com/embed/o2Tma5Cek48`
    - Muscles: Biceps
    - Image: `alternatingdumbbellcurl.jpg`

40. **Hammer Curl**
    - Video: `https://www.youtube.com/embed/fM0TQLoesLs`
    - Muscles: Biceps
    - Image: `hammercurl.jpg`

41. **Preacher Curl**
    - Video: `https://www.youtube.com/embed/Ja6ZlIDONac`
    - Muscles: Biceps
    - Image: `preachercurl.jpg`

42. **Cable Curl**
    - Video: `https://www.youtube.com/embed/F3Y03RnVY8Y`
    - Muscles: Biceps
    - Image: `cablecurl.jpg`

43. **Incline Dumbbell Curl**
    - Video: `https://www.youtube.com/embed/aG7CXiKxepw`
    - Muscles: Biceps
    - Image: `inclinedumbbellcurl.jpg`

44. **EZ Bar Curl**
    - Video: `https://www.youtube.com/embed/-gSM-kqNlUw`
    - Muscles: Biceps
    - Image: `ezbarcurl.jpg`

45. **Reverse Curl**
    - Video: `https://www.youtube.com/embed/hUA-fIpM7nA`
    - Muscles: Biceps
    - Image: `reversecurl.jpg`

46. **Spider Curl**
    - Video: `https://www.youtube.com/embed/ke2shAeQ0O8`
    - Muscles: Biceps
    - Image: `spidercurl.jpg`

#### TRICEP EXERCISES (9)
47. **Tricep Pushdown**
    - Video: `https://www.youtube.com/embed/6Fzep104f0s`
    - Muscles: Triceps, Shoulders
    - Image: `triceppushdown.jpg`

48. **Overhead Tricep Extension**
    - Video: `https://www.youtube.com/embed/a9oPnZReIRE`
    - Muscles: Triceps, Shoulders
    - Image: `overheadtricepextension.jpg`

49. **Cable Overhead Extension**
    - Video: `https://www.youtube.com/embed/ns-RGsbzqok`
    - Muscles: Triceps, Shoulders
    - Image: `cableoverheadextension.jpg`

50. **Close Grip Bench Press**
    - Video: `https://www.youtube.com/embed/FiQUzPtS90E`
    - Muscles: Triceps, Chest
    - Image: `closegripbenchpress.jpg`

51. **Dips**
    - Video: `https://www.youtube.com/embed/oA8Sxv2WeOs`
    - Muscles: Triceps, Chest, Shoulders
    - Image: `dips.jpg`

52. **Seated Dip Machine**
    - Video: `https://www.youtube.com/embed/Zg0tT27iYuY`
    - Muscles: Triceps, Chest
    - Image: `seateddipmachine.jpg`

53. **Skull Crusher**
    - Video: `https://www.youtube.com/embed/l3rHYPtMUo8`
    - Muscles: Triceps, Shoulders
    - Image: `skullcrusher.jpg`

54. **Rope Pushdown**
    - Video: `https://www.youtube.com/embed/-xa-6cQaZKY`
    - Muscles: Triceps, Shoulders
    - Image: `ropepushdown.jpg`

55. **Single Arm Cable Pushdown**
    - Video: `https://www.youtube.com/embed/Cp_bShvMY4c`
    - Muscles: Triceps
    - Image: `singlearmcablepushdown.jpg`

56. **Diamond Push-Up**
    - Video: `https://www.youtube.com/embed/K8bKxVcwjrk`
    - Muscles: Triceps, Chest, Shoulders
    - Image: `diamondpushup.jpg`

#### QUAD EXERCISES (9)
57. **Squat**
    - Video: `https://www.youtube.com/embed/rrJIyZGlK8c`
    - Muscles: Quads, Glutes, Hamstrings
    - Image: `squat.jpg`

58. **Hack Squat**
    - Video: `https://www.youtube.com/embed/rYgNArpwE7E`
    - Muscles: Quads, Glutes, Hamstrings
    - Image: `hacksquat.jpg`

59. **Leg Press**
    - Video: `https://www.youtube.com/embed/yZmx_Ac3880`
    - Muscles: Quads, Glutes, Hamstrings
    - Image: `legpress.jpg`

60. **Leg Extension**
    - Video: `https://www.youtube.com/embed/m0FOpMEgero`
    - Muscles: Quads
    - Image: `legextension.jpg`

61. **Bulgarian Split Squat**
    - Video: `https://www.youtube.com/embed/vgn7bSXkgkA`
    - Muscles: Quads, Glutes
    - Image: `bulgariansplitsquat.jpg`

62. **Smith Machine Squat**
    - Video: `https://www.youtube.com/embed/-eO_VydErV0`
    - Muscles: Quads, Glutes, Hamstrings
    - Image: `smithmachinesquat.jpg`

63. **V Squat**
    - Video: `https://www.youtube.com/embed/u2n1vqVDYE4`
    - Muscles: Quads, Glutes, Hamstrings
    - Image: `vsquat.jpg`

64. **Goblet Squat**
    - Video: `https://www.youtube.com/embed/pEGfGwp6IEA`
    - Muscles: Quads, Glutes, Hamstrings
    - Image: `gobletsquat.jpg`

65. **Smith Machine Bench Press** (also chest)
    - Video: `https://www.youtube.com/embed/O5viuEPDXKY`
    - Muscles: Chest, Triceps, Shoulders
    - Image: `smithmachinebenchpress.jpg`

66. **Smith Machine Incline Bench Press**
    - Video: `https://www.youtube.com/embed/8urE8Z8AMQ4`
    - Muscles: Chest, Shoulders, Triceps
    - Image: `smithmachineinclinebenchpress.jpg`

67. **Smith Machine Decline Bench Press**
    - Video: `https://www.youtube.com/embed/R1Cwq8rJ_bI`
    - Muscles: Chest, Triceps, Shoulders
    - Image: `smithmachinedeclinebenchpress.jpg`

68. **Smith Machine Shoulder Press**
    - Video: `https://www.youtube.com/embed/OLqZDUUD2b0`
    - Muscles: Shoulders, Triceps
    - Image: `smithmachineshoulderpress.jpg`

#### HAMSTRING EXERCISES (3)
69. **Lying Leg Curl**
    - Video: `https://www.youtube.com/embed/SbSNUXPRkc8`
    - Muscles: Hamstrings, Glutes
    - Image: `lyinglegcurl.jpg`

70. **Seated Leg Curl Machine**
    - Video: `https://www.youtube.com/embed/Orxowest56U`
    - Muscles: Hamstrings, Glutes
    - Image: `seatedlegcurlmachine.jpg`

71. **Good Morning**
    - Video: `https://www.youtube.com/embed/dEJ0FTm-CEk`
    - Muscles: Hamstrings, Glutes, Back
    - Image: `goodmorning.jpg`

#### GLUTE EXERCISES (4)
72. **Hip Thrust**
    - Video: `https://www.youtube.com/embed/pUdIL5x0fWg`
    - Muscles: Glutes, Hamstrings
    - Image: `hipthrust.jpg`

73. **Cable Kickback**
    - Video: `https://www.youtube.com/embed/zjVK1sOqFdw`
    - Muscles: Glutes, Hamstrings
    - Image: `cablekickback.jpg`

74. **Abductor Machine**
    - Video: `https://www.youtube.com/embed/G_8LItOiZ0Q`
    - Muscles: Glutes
    - Image: `abductormachine.jpg`

75. **Adductor Machine**
    - Video: `https://www.youtube.com/embed/CjAVezAggkI`
    - Muscles: Glutes
    - Image: `adductormachine.jpg`

#### CALF EXERCISES (4)
76. **Standing Calf Raise**
    - Video: `https://www.youtube.com/embed/g_E7_q1z2bo`
    - Muscles: Calves
    - Image: `standingcalfraise.jpg`

77. **Seated Calf Raise**
    - Video: `https://www.youtube.com/embed/2Q-HQ3mnePg`
    - Muscles: Calves
    - Image: `seatedcalfraise.jpg`

78. **Leg Press Calf Raise**
    - Video: `https://www.youtube.com/embed/KxEYX_cuesM`
    - Muscles: Calves
    - Image: `legpresscalfraise.jpg`

79. **Donkey Calf Raise**
    - Video: `https://www.youtube.com/embed/r30EoMPSNns`
    - Muscles: Calves
    - Image: `donkeycalfraise.jpg`

#### AB EXERCISES (7)
80. **Crunch**
    - Video: `https://www.youtube.com/embed/NnVhqMQRvmM`
    - Muscles: Abs
    - Image: `crunch.jpg`

81. **Cable Crunch**
    - Video: `https://www.youtube.com/embed/b9FJ4hIK3pI`
    - Muscles: Abs
    - Image: `cablecrunch.jpg`

82. **Decline Sit-Up**
    - Video: `https://www.youtube.com/embed/DAnTf16NcT0`
    - Muscles: Abs
    - Image: `declinesitup.jpg`

83. **Hanging Leg Raise**
    - Video: `https://www.youtube.com/embed/7FwGZ8qY5OU`
    - Muscles: Abs
    - Image: `hanginglegraise.jpg`

84. **Knee Raise**
    - Video: `https://www.youtube.com/embed/RD_A-Z15ER4`
    - Muscles: Abs
    - Image: `kneeraise.jpg`

85. **Russian Twist**
    - Video: `https://www.youtube.com/embed/99T1EfpMwPA`
    - Muscles: Abs, Back
    - Image: `russiantwist.jpg`

86. **Rotary Torso Machine**
    - Video: `https://www.youtube.com/embed/h5naeryzGjE`
    - Muscles: Abs, Back
    - Image: `rotarytorsomachine.jpg`

#### GENERIC DETECTIONS (4 - no videos/images)
87. **Chinning Dipping** - Generic detection only
88. **Leg Raise Tower** - Generic detection only
89. **Smith Machine** - Generic detection only
90. **Dumbbell** - Generic detection only

---

## 🎨 UI/UX Details

### Color Scheme
- **Background**: `#0f0f10` (very dark gray/black)
- **Cards**: `#1a1a1c` (slightly lighter dark)
- **Text**: `#f5f6f7` (light gray/white)
- **Accent**: `#8b5cf6` (purple)
- **Theme Color**: `#0f0f10`

### Typography
- **Font Family**: Inter (Google Fonts)
- **Weights**: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

### Layout
- **Mobile-first design** - Optimized for phone screens
- **Bottom navigation** - 4 tabs: Home, Workouts, Progress, Settings
- **Card-based UI** - All content in rounded cards
- **Dark mode only** - No light mode

### Key UI Components
1. **Camera Interface** - Full-screen camera with capture button
2. **Confidence Ring** - Circular progress indicator showing AI confidence
3. **Exercise Selector** - Searchable dropdown with 90+ exercises
4. **Workout Builder** - Drag-and-drop exercise list with sets/reps/weight inputs
5. **Progress Charts** - Weight progression, muscle focus heatmap, PR timeline
6. **Video Modal** - YouTube embed for exercise instructions

---

## 🔧 Technical Requirements

### Python Dependencies
```
Flask>=3.0.0
flask-login>=0.6.3
flask-mail>=0.10.0
flask-cors>=4.0.0
werkzeug>=3.0.1
groq>=0.4.0
ultralytics>=8.0.0
```

### System Requirements
- Python 3.8+
- PyTorch (for YOLO models)
- CUDA (optional, for GPU acceleration)
- SQLite3
- Node.js (for Capacitor, if building native apps)

### File Structure Requirements
```
/
├── app.py
├── requirements.txt
├── best.pt, best1.pt, best2.pt, best3.pt, best4.pt
├── gymvision.db (created on first run)
├── static/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── manifest.webmanifest
│   └── [icons]
├── templates/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   └── verify.html
└── images/ (or parent/images/)
    └── [91 exercise images]
```

---

## 📸 Screenshots to Provide

Take screenshots of these screens for reference:

1. **Home Screen**
   - Camera view
   - Exercise detection result
   - Confidence ring
   - Recent scans list

2. **Workout Builder**
   - Empty workout
   - Workout with exercises
   - Exercise with sets/reps/weight
   - Exercise selector dropdown

3. **Progress Screen**
   - Weight progression chart
   - Muscle focus visualization
   - PR timeline
   - Progressive overload tracker

4. **Exercise Info Modal**
   - Exercise name
   - Muscle groups
   - YouTube video embed
   - Exercise image

5. **Settings Screen**
   - User info
   - Logout button
   - App info

6. **Authentication Screens**
   - Login page
   - Register page
   - Email verification page

---

## 🚀 Deployment Considerations

### Important Notes for base44:

1. **AI Models are Large** - The 5 .pt files total ~500MB-1GB. Ensure sufficient storage.

2. **Model Loading** - Models are loaded lazily on first prediction. First request may be slow.

3. **Database** - SQLite file is created automatically. Ensure write permissions.

4. **Image Paths** - Exercise images can be in `/images/` or parent `/images/` directory. Code handles both.

5. **CORS** - If deploying frontend separately, enable CORS for API endpoints.

6. **File Uploads** - `/predict` endpoint accepts multipart/form-data with image file.

7. **Session Management** - Uses Flask sessions. Ensure SECRET_KEY is set.

8. **Email Verification** - Requires SMTP access. Gmail app passwords recommended.

9. **Groq API** - AI chat requires Groq API key. Free tier available.

10. **Static Files** - Flask serves static files from `/static/` directory.

---

## 📋 Checklist for base44

- [ ] All source code files (app.py, HTML, JS, CSS)
- [ ] 5 YOLO model files (.pt)
- [ ] 91 exercise images (JPG files)
- [ ] Logo and branding assets
- [ ] Environment variables configuration
- [ ] Python dependencies installed
- [ ] Database initialized
- [ ] Email SMTP configured
- [ ] Groq API key set
- [ ] Static file serving configured
- [ ] Image directory accessible
- [ ] CORS enabled (if needed)
- [ ] File upload limits configured
- [ ] Session security configured

---

## 🎯 User Flow

1. **Registration** → Email verification → Login
2. **Home Screen** → Take photo → AI detects exercise → View exercise info
3. **Workout Builder** → Add exercises → Set sets/reps/weight → Save workout
4. **Track Workout** → Log sets → Save progress
5. **View Progress** → Charts show progression over time
6. **AI Chat** → Ask fitness questions → Get workout recommendations

---

## 💡 Key Features to Implement

1. **AI Detection** - Core feature, must work accurately
2. **Workout Tracking** - Essential for user retention
3. **Progress Visualization** - Motivates users
4. **Exercise Library** - Comprehensive database
5. **AI Assistant** - Unique selling point
6. **User Authentication** - Required for data persistence

---

## 📞 Support Information

If base44 has questions:
- All exercise data is in `app.py` in `MACHINE_METADATA` dictionary
- Image paths are resolved in `resolve_image_path()` function
- AI models use Ultralytics YOLO framework
- Frontend is vanilla JS - no build step required
- Backend is pure Flask - no special deployment needed

---

**End of Guide**

This document contains everything needed to rebuild GymVision AI. All code, assets, and configurations are documented above.

