from __future__ import annotations

import os
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
from collections import defaultdict
from difflib import get_close_matches
from werkzeug.security import generate_password_hash, check_password_hash

# Load environment variables from .env file (for local development)
try:
	from dotenv import load_dotenv
	load_dotenv()
except ImportError:
	# python-dotenv not installed, continue without it
	pass

from flask import Flask, jsonify, render_template, request, send_from_directory, redirect, url_for, flash
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_mail import Mail, Message
from flask_cors import CORS
import secrets

try:
	from supabase import create_client, Client
	SUPABASE_AVAILABLE = True
except Exception:
	SUPABASE_AVAILABLE = False
	Client = None

try:
	from ultralytics import YOLO  # type: ignore
except Exception:
	YOLO = None  # type: ignore

try:
	from groq import Groq  # type: ignore
	GROQ_AVAILABLE = True
except Exception:
	GROQ_AVAILABLE = False

APP_ROOT = Path(__file__).resolve().parent
MODEL_PATH = APP_ROOT / "best.pt"
MODEL_PATH_1 = APP_ROOT / "best1.pt"
MODEL_PATH_2 = APP_ROOT / "best2.pt"
MODEL_PATH_3 = APP_ROOT / "best3.pt"
MODEL_PATH_4 = APP_ROOT / "best4.pt"
DATABASE_PATH = APP_ROOT / "gymvision.db"
IMAGES_PATHS = [APP_ROOT / "images"]
PARENT_IMAGES_PATH = APP_ROOT.parent / "images"
if PARENT_IMAGES_PATH.exists():
	IMAGES_PATHS.append(PARENT_IMAGES_PATH)

IMAGE_FILE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")
IMAGE_BASENAMES = []
for directory in IMAGES_PATHS:
	if directory.exists():
		for file in directory.iterdir():
			if file.suffix.lower() in IMAGE_FILE_EXTENSIONS:
				IMAGE_BASENAMES.append(file.stem.lower())
IMAGE_BASENAMES = sorted(set(IMAGE_BASENAMES))

def normalize_label(text: str) -> str:
	return "".join(ch if ch.isalnum() else "_" for ch in (text or "").lower()).strip("_")

MODEL_LABELS: Dict[str, List[str]] = {
	"best": [
		"Hack Squat",
		"Hip Thrust",
		"Leg Extension",
		"Leg Press",
		"Lying Leg Curl",
		"V Squat",
	],
	"best1": [
		"Chest Press Machine",
		"Lat Pull Down",
		"Seated Cable Rows",
		"Arm Curl Machine",
		"Chest Fly Machine",
		"Chinning Dipping",
		"Lateral Raises Machine",
		"Leg Extension",
		"Leg Press",
		"Reg Curl Machine",
		"Seated Dip Machine",
		"Shoulder Press Machine",
		"Smith Machine",
	],
	"best2": [
		"Back Extension Machine",
		"Hip Abductor Machine",
		"Seated Leg Curl Machine",
		"T-Bar Row",
	],
	"best3": [
		"Barbell",
		"Bench",
		"Biceps Curl",
		"Chest Fly Machine",
		"Chest Press Machine",
		"Dumbbell",
		"Elliptical",
		"Functional Trainer",
		"Incline Bench Press",
		"Lat Pull Down Machine",
		"Lateral Raises Machine",
		"Leg Curl Machine",
		"Leg Extension Machine",
		"Leg Press Machine",
		"Preacher Curl",
		"Seated Dip Machine",
		"Seated Row Machine",
		"Shoulder Press Machine",
		"Smith Machine",
		"Stability Ball",
		"Stationary Bike",
		"Stepmill",
		"Treadmill",
	],
	"best4": [
		"Bench Press",
		"Lat Pulldown",
		"Leg Press",
	],
}

LABEL_MODEL_PRIORITY: Dict[str, List[str]] = {}
for model_name, labels in MODEL_LABELS.items():
	for label_name in labels:
		key = normalize_label(label_name)
		LABEL_MODEL_PRIORITY.setdefault(key, [])
		if model_name not in LABEL_MODEL_PRIORITY[key]:
			LABEL_MODEL_PRIORITY[key].append(model_name)

DEFAULT_MODEL_PRIORITY = ["best", "best3", "best4", "best1", "best2"]
MODEL_PRIORITY_MARGIN = 0.05

app = Flask(
	__name__,
	template_folder=str(APP_ROOT / "templates"),
	static_folder=str(APP_ROOT / "static"),
)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production-2024")  # Change in production!

# Enable CORS for all routes (needed for Capacitor/iOS app)
# Allow all origins for Capacitor apps (capacitor://localhost, file://, etc.)
CORS(app, resources={
	r"/api/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]},
	r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}
})

# Flask-Mail setup
app.config['MAIL_SERVER'] = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT'] = int(os.environ.get('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = os.environ.get('MAIL_USE_TLS', 'true').lower() in ['true', 'on', '1']
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME', '')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD', '')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_DEFAULT_SENDER', 'noreply@gymvision.ai')

mail = Mail(app)

# Flask-Login setup
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"
login_manager.login_message = "Please log in to access the app."

# Allowed muscle names (lowercase)
ALLOWED_MUSCLES = {
	"back", "chest", "shoulders", "biceps", "triceps", "quads", "hamstrings", "calves", "abs", "glutes",
}

# Synonym mapping (lowercase) -> allowed name
MUSCLE_SYNONYMS: Dict[str, str] = {
	"lats": "back",
	"lat": "back",
	"rear delts": "shoulders",
	"delts": "shoulders",
	"core": "abs",
	"bovenste borst": "chest",
	"onderste borst": "chest",
}


def normalize_muscles(muscles: List[str]) -> List[str]:
	seen = set()
	result: List[str] = []
	for m in muscles:
		key = (m or "").strip().lower()
		key = MUSCLE_SYNONYMS.get(key, key)
		if key in ALLOWED_MUSCLES and key not in seen:
			seen.add(key)
			# Title-case for display
			result.append(key.capitalize())
	return result

MACHINE_METADATA: Dict[str, Dict[str, Any]] = {
	# Chest
	"bench_press": {"display": "Bench Press", "muscles": normalize_muscles(["Chest", "Triceps", "Shoulders"]), "video": "https://www.youtube.com/embed/ejI1Nlsul9k", "image": "https://strengthlevel.com/images/illustrations/bench-press.png"},
	"incline_bench_press": {"display": "Incline Bench Press", "muscles": normalize_muscles(["Chest", "Shoulders", "Triceps"]), "video": "https://www.youtube.com/embed/lJ2o89kcnxY", "image": "https://strengthlevel.com/images/illustrations/incline-bench-press.png"},
	"decline_bench_press": {"display": "Decline Bench Press", "muscles": normalize_muscles(["Chest", "Triceps", "Shoulders"]), "video": "https://www.youtube.com/embed/iVh4B5bJ5OI", "image": "https://strengthlevel.com/images/illustrations/decline-bench-press.png"},
"dumbbell_bench_press": {"display": "Dumbbell Bench Press", "muscles": normalize_muscles(["Chest", "Triceps", "Shoulders"]), "video": "https://www.youtube.com/embed/YQ2s_Y7g5Qk", "image": "https://strengthlevel.com/images/illustrations/dumbbell-bench-press.png"},
	"dumbbell_fly": {"display": "Dumbbell Fly", "muscles": normalize_muscles(["Chest", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/JFm8KbhjibM", "image": "https://strengthlevel.com/images/illustrations/dumbbell-fly.png"},
"cable_crossover": {"display": "Cable Crossover", "muscles": normalize_muscles(["Chest", "Shoulders", "Biceps"]), "video": "https://www.youtube.com/embed/hhruLxo9yZU", "image": "https://strengthlevel.com/images/illustrations/cable-crossover.png"},
"pec_deck_machine": {"display": "Pec Deck Machine", "muscles": normalize_muscles(["Chest", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/FDay9wFe5uE", "image": "https://strengthlevel.com/images/illustrations/pec-deck.png"},
"chest_press_machine": {"display": "Chest Press Machine", "muscles": normalize_muscles(["Chest", "Triceps", "Shoulders"]), "video": "https://www.youtube.com/embed/65npK4Ijz1c", "image": "https://strengthlevel.com/images/illustrations/chest-press.png"},
"push_up": {"display": "Push-Up", "muscles": normalize_muscles(["Chest", "Triceps", "Shoulders"]), "video": "https://www.youtube.com/embed/WDIpL0pjun0", "image": "https://strengthlevel.com/images/illustrations/push-up.png"},
"incline_dumbbell_press": {"display": "Incline Dumbbell Press", "muscles": normalize_muscles(["Chest", "Shoulders", "Triceps"]), "video": "https://www.youtube.com/embed/jMQA3XtJSgo", "image": "https://strengthlevel.com/images/illustrations/incline-dumbbell-press.png"},
"decline_dumbbell_press": {"display": "Decline Dumbbell Press", "muscles": normalize_muscles(["Chest", "Triceps", "Shoulders"]), "video": "https://www.youtube.com/embed/2B6WxyLaIrE", "image": "https://strengthlevel.com/images/illustrations/decline-dumbbell-press.png"},

	# Back
"pull_up": {"display": "Pull-Up", "muscles": normalize_muscles(["Back", "Biceps", "Shoulders"]), "video": "https://www.youtube.com/embed/eGo4IYlbE5g", "image": "https://strengthlevel.com/images/illustrations/pull-up.png"},
"chin_up": {"display": "Chin-Up", "muscles": normalize_muscles(["Biceps", "Back", "Shoulders"]), "video": "https://www.youtube.com/embed/8mryJ3w2S78", "image": "https://strengthlevel.com/images/illustrations/chin-up.png"},
	"lat_pulldown": {"display": "Lat Pulldown", "muscles": normalize_muscles(["Back", "Biceps", "Shoulders"]), "video": "https://www.youtube.com/embed/JGeRYIZdojU", "image": "https://strengthlevel.com/images/illustrations/lat-pulldown.png"},
"wide_grip_pulldown": {"display": "Wide Grip Pulldown", "muscles": normalize_muscles(["Back", "Biceps", "Shoulders"]), "video": "https://www.youtube.com/embed/YCKPD4BSD2E", "image": "https://strengthlevel.com/images/illustrations/wide-grip-pulldown.png"},
"close_grip_pulldown": {"display": "Close Grip Pulldown", "muscles": normalize_muscles(["Back", "Biceps", "Shoulders"]), "video": "https://www.youtube.com/embed/IjoFCmLX7z0", "image": "https://strengthlevel.com/images/illustrations/close-grip-pulldown.png"},
"straight_arm_pulldown": {"display": "Straight Arm Pulldown", "muscles": normalize_muscles(["Back", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/G9uNaXGTJ4w", "image": "https://strengthlevel.com/images/illustrations/straight-arm-pulldown.png"},
"seated_row": {"display": "Seated Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/UCXxvVItLoM", "image": "https://strengthlevel.com/images/illustrations/seated-row.png"},
	"t_bar_row": {"display": "T-Bar Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/yPis7nlbqdY", "image": "https://strengthlevel.com/images/illustrations/t-bar-row.png"},
	"bent_over_row": {"display": "Bent Over Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/6FZHJGzMFEc", "image": "https://strengthlevel.com/images/illustrations/bent-over-row.png"},
	"one_arm_dumbbell_row": {"display": "One Arm Dumbbell Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/DMo3HJoawrU", "image": "https://strengthlevel.com/images/illustrations/one-arm-dumbbell-row.png"},
	"chest_supported_row": {"display": "Chest Supported Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/tZUYS7X50so", "image": "https://strengthlevel.com/images/illustrations/chest-supported-row.png"},
	"lat_pullover_machine": {"display": "Lat Pullover Machine", "muscles": normalize_muscles(["Back", "Chest", "-"]), "video": "https://www.youtube.com/embed/oxpAl14EYyc", "image": "https://strengthlevel.com/images/illustrations/lat-pullover.png"},
	"deadlift": {"display": "Deadlift", "muscles": normalize_muscles(["Back", "Glutes", "Hamstrings"]), "video": "https://www.youtube.com/embed/AweC3UaM14o", "image": "https://strengthlevel.com/images/illustrations/deadlift.png"},
	"romanian_deadlift": {"display": "Romanian Deadlift", "muscles": normalize_muscles(["Hamstrings", "Glutes", "Back"]), "video": "https://www.youtube.com/embed/bT5OOBgY4bc", "image": "https://strengthlevel.com/images/illustrations/romanian-deadlift.png"},
	"sumo_deadlift": {"display": "Sumo Deadlift", "muscles": normalize_muscles(["Glutes", "Hamstrings", "Back"]), "video": "https://www.youtube.com/embed/pfSMst14EFk", "image": "https://strengthlevel.com/images/illustrations/sumo-deadlift.png"},

	# Shoulders
	"shoulder_press_machine": {"display": "Shoulder Press Machine", "muscles": normalize_muscles(["Shoulders", "Triceps", "-"]), "video": "https://www.youtube.com/embed/WvLMauqrnK8", "image": "https://strengthlevel.com/images/illustrations/shoulder-press.png"},
	"overhead_press": {"display": "Overhead Press", "muscles": normalize_muscles(["Shoulders", "Triceps", "-"]), "video": "https://www.youtube.com/embed/G2qpTG1Eh40", "image": "https://strengthlevel.com/images/illustrations/overhead-press.png"},
	"arnold_press": {"display": "Arnold Press", "muscles": normalize_muscles(["Shoulders", "Triceps", "-"]), "video": "https://www.youtube.com/embed/jeJttN2EWCo", "image": "https://strengthlevel.com/images/illustrations/arnold-press.png"},
	"dumbbell_shoulder_press": {"display": "Dumbbell Shoulder Press", "muscles": normalize_muscles(["Shoulders", "Triceps", "-"]), "video": "https://www.youtube.com/embed/HzIiNhHhhtA", "image": "https://strengthlevel.com/images/illustrations/dumbbell-shoulder-press.png"},
	"front_raise": {"display": "Front Raise", "muscles": normalize_muscles(["Shoulders", "-", "-"]), "video": "https://www.youtube.com/embed/hRJ6tR5-if0", "image": "https://strengthlevel.com/images/illustrations/front-raise.png"},
	"lateral_raise": {"display": "Lateral Raise", "muscles": normalize_muscles(["Shoulders", "-", "-"]), "video": "https://www.youtube.com/embed/OuG1smZTsQQ", "image": "https://strengthlevel.com/images/illustrations/lateral-raise.png"},
	"lateral_raise_machine": {"display": "Lateral Raise Machine", "muscles": normalize_muscles(["Shoulders", "-", "-"]), "video": "https://www.youtube.com/embed/xMEs3zEzS8s", "image": "https://strengthlevel.com/images/illustrations/cable-lateral-raise.png"},
	"rear_delt_fly": {"display": "Rear Delt Fly", "muscles": normalize_muscles(["Shoulders", "Back", "-"]), "video": "https://www.youtube.com/embed/nlkF7_2O_Lw", "image": "https://strengthlevel.com/images/illustrations/rear-delt-fly.png"},
	"reverse_pec_deck": {"display": "Reverse Pec Deck", "muscles": normalize_muscles(["Shoulders", "Back", "-"]), "video": "https://www.youtube.com/embed/jw7oFFBnwCU", "image": "https://strengthlevel.com/images/illustrations/reverse-pec-deck.png"},
	"upright_row": {"display": "Upright Row", "muscles": normalize_muscles(["Shoulders", "Triceps", "-"]), "video": "https://www.youtube.com/embed/um3VVzqunPU", "image": "https://strengthlevel.com/images/illustrations/upright-row.png"},
	"cable_face_pull": {"display": "Cable Face Pull", "muscles": normalize_muscles(["Shoulders", "Back", "-"]), "video": "https://www.youtube.com/embed/0Po47vvj9g4", "image": "https://strengthlevel.com/images/illustrations/face-pull.png"},

	# Biceps
	"barbell_curl": {"display": "Barbell Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/N5x5M1x1Gd0", "image": "https://strengthlevel.com/images/illustrations/barbell-curl.png"},
	"dumbbell_curl": {"display": "Dumbbell Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/6DeLZ6cbgWQ", "image": "https://strengthlevel.com/images/illustrations/dumbbell-curl.png"},
	"alternating_dumbbell_curl": {"display": "Alternating Dumbbell Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/o2Tma5Cek48", "image": "https://strengthlevel.com/images/illustrations/alternating-dumbbell-curl.png"},
	"hammer_curl": {"display": "Hammer Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/fM0TQLoesLs", "image": "https://strengthlevel.com/images/illustrations/hammer-curl.png"},
	"preacher_curl": {"display": "Preacher Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/Ja6ZlIDONac", "image": "https://strengthlevel.com/images/illustrations/preacher-curl.png"},
	"cable_curl": {"display": "Cable Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/F3Y03RnVY8Y", "image": "https://strengthlevel.com/images/illustrations/cable-curl.png"},
	"incline_dumbbell_curl": {"display": "Incline Dumbbell Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/aG7CXiKxepw", "image": "https://strengthlevel.com/images/illustrations/incline-dumbbell-curl.png"},
	"ez_bar_curl": {"display": "EZ Bar Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/-gSM-kqNlUw", "image": "https://strengthlevel.com/images/illustrations/ez-bar-curl.png"},
	"reverse_curl": {"display": "Reverse Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/hUA-fIpM7nA", "image": "https://strengthlevel.com/images/illustrations/reverse-curl.png"},
	"spider_curl": {"display": "Spider Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/ke2shAeQ0O8", "image": "https://strengthlevel.com/images/illustrations/spider-curl.png"},

	# Triceps
	"tricep_pushdown": {"display": "Tricep Pushdown", "muscles": normalize_muscles(["Triceps", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/6Fzep104f0s", "image": "https://strengthlevel.com/images/illustrations/tricep-pushdown.png"},
	"overhead_tricep_extension": {"display": "Overhead Tricep Extension", "muscles": normalize_muscles(["Triceps", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/a9oPnZReIRE", "image": "https://strengthlevel.com/images/illustrations/overhead-tricep-extension.png"},
	"cable_overhead_extension": {"display": "Cable Overhead Extension", "muscles": normalize_muscles(["Triceps", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/ns-RGsbzqok", "image": "https://strengthlevel.com/images/illustrations/cable-overhead-extension.png"},
	"close_grip_bench_press": {"display": "Close Grip Bench Press", "muscles": normalize_muscles(["Triceps", "Chest", "-"]), "video": "https://www.youtube.com/embed/FiQUzPtS90E", "image": "https://strengthlevel.com/images/illustrations/close-grip-bench-press.png"},
	"dips": {"display": "Dips", "muscles": normalize_muscles(["Triceps", "Chest", "Shoulders"]), "video": "https://www.youtube.com/embed/oA8Sxv2WeOs", "image": "https://strengthlevel.com/images/illustrations/dip.png"},
	"seated_dip_machine": {"display": "Seated Dip Machine", "muscles": normalize_muscles(["Triceps", "Chest", "-"]), "video": "https://www.youtube.com/embed/Zg0tT27iYuY", "image": "https://strengthlevel.com/images/illustrations/seated-dip.png"},
	"skull_crusher": {"display": "Skull Crusher", "muscles": normalize_muscles(["Triceps", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/l3rHYPtMUo8", "image": "https://strengthlevel.com/images/illustrations/skull-crusher.png"},
	"rope_pushdown": {"display": "Rope Pushdown", "muscles": normalize_muscles(["Triceps", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/-xa-6cQaZKY", "image": "https://strengthlevel.com/images/illustrations/rope-pushdown.png"},
	"single_arm_cable_pushdown": {"display": "Single Arm Cable Pushdown", "muscles": normalize_muscles(["Triceps", "-", "-"]), "video": "https://www.youtube.com/embed/Cp_bShvMY4c", "image": "https://strengthlevel.com/images/illustrations/single-arm-cable-pushdown.png"},
	"diamond_push_up": {"display": "Diamond Push-Up", "muscles": normalize_muscles(["Triceps", "Chest", "Shoulders"]), "video": "https://www.youtube.com/embed/K8bKxVcwjrk", "image": "https://strengthlevel.com/images/illustrations/diamond-push-up.png"},

	# Quads
	"squat": {"display": "Squat", "muscles": normalize_muscles(["Quads", "Glutes", "Hamstrings"]), "video": "https://www.youtube.com/embed/rrJIyZGlK8c", "image": "https://strengthlevel.com/images/illustrations/squat.png"},
	"hack_squat": {"display": "Hack Squat", "muscles": normalize_muscles(["Quads", "Glutes", "Hamstrings"]), "video": "https://www.youtube.com/embed/rYgNArpwE7E", "image": "https://strengthlevel.com/images/illustrations/hack-squat.png"},
	"leg_press": {"display": "Leg Press", "muscles": normalize_muscles(["Quads", "Glutes", "Hamstrings"]), "video": "https://www.youtube.com/embed/yZmx_Ac3880", "image": "https://strengthlevel.com/images/illustrations/leg-press.png"},
	"leg_extension": {"display": "Leg Extension", "muscles": normalize_muscles(["Quads", "-", "-"]), "video": "https://www.youtube.com/embed/m0FOpMEgero", "image": "https://strengthlevel.com/images/illustrations/leg-extension.png"},
	"bulgarian_split_squat": {"display": "Bulgarian Split Squat", "muscles": normalize_muscles(["Quads", "Glutes", "-"]), "video": "https://www.youtube.com/embed/vgn7bSXkgkA", "image": "https://strengthlevel.com/images/illustrations/bulgarian-split-squat.png"},
	"smith_machine_squat": {"display": "Smith Machine Squat", "muscles": normalize_muscles(["Quads", "Glutes", "Hamstrings"]), "video": "https://www.youtube.com/embed/-eO_VydErV0", "image": "https://strengthlevel.com/images/illustrations/smith-machine-squat.png"},
	"v_squat": {"display": "V Squat", "muscles": normalize_muscles(["Quads", "Glutes", "Hamstrings"]), "video": "https://www.youtube.com/embed/u2n1vqVDYE4", "image": "/images/vsquat.jpg"},
	"smith_machine_bench_press": {"display": "Smith Machine Bench Press", "muscles": normalize_muscles(["Chest", "Triceps", "Shoulders"]), "video": "https://www.youtube.com/embed/O5viuEPDXKY", "image": "https://strengthlevel.com/images/illustrations/bench-press.png"},
	"smith_machine_incline_bench_press": {"display": "Smith Machine Incline Bench Press", "muscles": normalize_muscles(["Chest", "Shoulders", "Triceps"]), "video": "https://www.youtube.com/embed/8urE8Z8AMQ4", "image": "https://strengthlevel.com/images/illustrations/incline-bench-press.png"},
	"smith_machine_decline_bench_press": {"display": "Smith Machine Decline Bench Press", "muscles": normalize_muscles(["Chest", "Triceps", "Shoulders"]), "video": "https://www.youtube.com/embed/R1Cwq8rJ_bI", "image": "https://strengthlevel.com/images/illustrations/decline-bench-press.png"},
	"smith_machine_shoulder_press": {"display": "Smith Machine Shoulder Press", "muscles": normalize_muscles(["Shoulders", "Triceps", "-"]), "video": "https://www.youtube.com/embed/OLqZDUUD2b0", "image": "https://strengthlevel.com/images/illustrations/machine-shoulder-press.png"},
	"goblet_squat": {"display": "Goblet Squat", "muscles": normalize_muscles(["Quads", "Glutes", "Hamstrings"]), "video": "https://www.youtube.com/embed/pEGfGwp6IEA", "image": "https://strengthlevel.com/images/illustrations/goblet-squat.png"},

	# Hamstrings
	"lying_leg_curl": {"display": "Lying Leg Curl", "muscles": normalize_muscles(["Hamstrings", "Glutes", "-"]), "video": "https://www.youtube.com/embed/SbSNUXPRkc8", "image": "https://strengthlevel.com/images/illustrations/lying-leg-curl.png"},
	"seated_leg_curl_machine": {"display": "Seated Leg Curl Machine", "muscles": normalize_muscles(["Hamstrings", "Glutes", "-"]), "video": "https://www.youtube.com/embed/Orxowest56U", "image": "https://strengthlevel.com/images/illustrations/seated-leg-curl.png"},
	"good_morning": {"display": "Good Morning", "muscles": normalize_muscles(["Hamstrings", "Glutes", "Back"]), "video": "https://www.youtube.com/embed/dEJ0FTm-CEk", "image": "https://strengthlevel.com/images/illustrations/good-morning.png"},

	# Glutes
	"hip_thrust": {"display": "Hip Thrust", "muscles": normalize_muscles(["Glutes", "Hamstrings", "-"]), "video": "https://www.youtube.com/embed/pUdIL5x0fWg", "image": "https://strengthlevel.com/images/illustrations/hip-thrust.png"},
	"cable_kickback": {"display": "Cable Kickback", "muscles": normalize_muscles(["Glutes", "Hamstrings", "-"]), "video": "https://www.youtube.com/embed/zjVK1sOqFdw", "image": "https://strengthlevel.com/images/illustrations/cable-kickback.png"},
	"abductor_machine": {"display": "Abductor Machine", "muscles": normalize_muscles(["Glutes", "-", "-"]), "video": "https://www.youtube.com/embed/G_8LItOiZ0Q", "image": "https://strengthlevel.com/images/illustrations/hip-abduction.png"},
	"adductor_machine": {"display": "Adductor Machine", "muscles": normalize_muscles(["Glutes", "-", "-"]), "video": "https://www.youtube.com/embed/CjAVezAggkI", "image": "https://strengthlevel.com/images/illustrations/hip-adduction.png"},

	# Calves
	"standing_calf_raise": {"display": "Standing Calf Raise", "muscles": normalize_muscles(["Calves", "-", "-"]), "video": "https://www.youtube.com/embed/g_E7_q1z2bo", "image": "https://strengthlevel.com/images/illustrations/standing-calf-raise.png"},
	"seated_calf_raise": {"display": "Seated Calf Raise", "muscles": normalize_muscles(["Calves", "-", "-"]), "video": "https://www.youtube.com/embed/2Q-HQ3mnePg", "image": "https://strengthlevel.com/images/illustrations/seated-calf-raise.png"},
	"leg_press_calf_raise": {"display": "Leg Press Calf Raise", "muscles": normalize_muscles(["Calves", "-", "-"]), "video": "https://www.youtube.com/embed/KxEYX_cuesM", "image": "https://strengthlevel.com/images/illustrations/leg-press-calf-raise.png"},
	"donkey_calf_raise": {"display": "Donkey Calf Raise", "muscles": normalize_muscles(["Calves", "-", "-"]), "video": "https://www.youtube.com/embed/r30EoMPSNns", "image": "https://strengthlevel.com/images/illustrations/donkey-calf-raise.png"},

	# Abs
	"crunch": {"display": "Crunch", "muscles": normalize_muscles(["Abs", "-", "-"]), "video": "https://www.youtube.com/embed/NnVhqMQRvmM", "image": "https://strengthlevel.com/images/illustrations/crunch.png"},
	"cable_crunch": {"display": "Cable Crunch", "muscles": normalize_muscles(["Abs", "-", "-"]), "video": "https://www.youtube.com/embed/b9FJ4hIK3pI", "image": "https://strengthlevel.com/images/illustrations/cable-crunch.png"},
	"decline_sit_up": {"display": "Decline Sit-Up", "muscles": normalize_muscles(["Abs", "-", "-"]), "video": "https://www.youtube.com/embed/DAnTf16NcT0", "image": "https://strengthlevel.com/images/illustrations/decline-sit-up.png"},
	"hanging_leg_raise": {"display": "Hanging Leg Raise", "muscles": normalize_muscles(["Abs", "-", "-"]), "video": "https://www.youtube.com/embed/7FwGZ8qY5OU", "image": "https://strengthlevel.com/images/illustrations/hanging-leg-raise.png"},
	"knee_raise": {"display": "Knee Raise", "muscles": normalize_muscles(["Abs", "-", "-"]), "video": "https://www.youtube.com/embed/RD_A-Z15ER4", "image": "https://strengthlevel.com/images/illustrations/knee-raise.png"},
	"russian_twist": {"display": "Russian Twist", "muscles": normalize_muscles(["Abs", "Back", "-"]), "video": "https://www.youtube.com/embed/99T1EfpMwPA", "image": "https://strengthlevel.com/images/illustrations/russian-twist.png"},
	"rotary_torso_machine": {"display": "Rotary Torso Machine", "muscles": normalize_muscles(["Abs", "Back", "-"]), "video": "https://www.youtube.com/embed/h5naeryzGjE", "image": "https://strengthlevel.com/images/illustrations/rotary-torso.png"},
	# Generic detections (for display purposes only)
	"chinning_dipping": {"display": "Chinning Dipping", "muscles": [], "video": "", "image": ""},
	"leg_raise_tower": {"display": "Leg Raise Tower", "muscles": [], "video": "", "image": ""},
	"smith_machine": {"display": "Smith Machine", "muscles": [], "video": "", "image": ""},
	"dumbbell": {"display": "Dumbbell", "muscles": [], "video": "", "image": ""},
}

# Map normalized model output labels to our canonical keys above
ALIASES: Dict[str, str] = {
	# Chest
	"bench_press": "bench_press",
	"flat_bench_press": "bench_press",
	"flat_bench_press_machine": "bench_press",
	"bench_machine": "bench_press",
	"flat_bench_machine": "bench_press",
	"incline_bench_press": "incline_bench_press",
	"decline_bench_press": "decline_bench_press",
	"dumbbell_bench_press": "dumbbell_bench_press",
	"dumbbell_fly": "dumbbell_fly",
	"chest_fly_machine": "pec_deck_machine",
	"chest_fly": "dumbbell_fly",
	"cable_crossover": "cable_crossover",
	"pec_deck": "pec_deck_machine",
	"chest_press": "chest_press_machine",
	"push_up": "push_up",
	"incline_dumbbell_press": "incline_dumbbell_press",
	"decline_dumbbell_press": "decline_dumbbell_press",

	# Back
	"lat_pulldown": "lat_pulldown",
	"lat_pulldown_machine": "lat_pulldown",
	"lat_pull_down": "lat_pulldown",
	"lat_pull_down_machine": "lat_pulldown",
	"wide_grip_pulldown": "wide_grip_pulldown",
	"close_grip_pulldown": "close_grip_pulldown",
	"straight_arm_pulldown": "straight_arm_pulldown",
	"pull_up": "pull_up",
	"chin_up": "chin_up",
	"seated_row": "seated_row",
	"t_bar_row": "t_bar_row",
	"bent_over_row": "bent_over_row",
	"one_arm_dumbbell_row": "one_arm_dumbbell_row",
	"chest_supported_row": "chest_supported_row",
	"lat_pullover_machine": "lat_pullover_machine",
	"deadlift": "deadlift",
	"romanian_deadlift": "romanian_deadlift",
	"sumo_deadlift": "sumo_deadlift",

	# Shoulders
	"shoulder_press_machine": "shoulder_press_machine",
	"shoulder_press": "shoulder_press_machine",
	"overhead_press": "overhead_press",
	"arnold_press": "arnold_press",
	"dumbbell_shoulder_press": "dumbbell_shoulder_press",
	"front_raise": "front_raise",
	"lateral_raise": "lateral_raise",
	"lateral_raises_machine": "lateral_raise_machine",
	"lateral_raise_machine": "lateral_raise_machine",
	"cable_lateral_raise": "lateral_raise_machine",
	"rear_delt_fly": "rear_delt_fly",
	"reverse_pec_deck": "reverse_pec_deck",
	"upright_row": "upright_row",
	"cable_face_pull": "cable_face_pull",

	# Biceps
	"arm_curl_machine": "preacher_curl",
	"bicep_curl_machine": "preacher_curl",
	"curl_machine": "preacher_curl",
	"barbell_curl": "barbell_curl",
	"dumbbell_curl": "dumbbell_curl",
	"alternating_dumbbell_curl": "alternating_dumbbell_curl",
	"hammer_curl": "hammer_curl",
	"machine_bicep_curl": "preacher_curl",
	"preacher_curl": "preacher_curl",
	"preacher_curl_machine": "preacher_curl",
	"cable_curl": "cable_curl",
	"incline_dumbbell_curl": "incline_dumbbell_curl",
	"ez_bar_curl": "ez_bar_curl",
	"reverse_curl": "reverse_curl",
	"spider_curl": "spider_curl",

	# Triceps
	"tricep_pushdown": "tricep_pushdown",
	"overhead_tricep_extension": "overhead_tricep_extension",
	"cable_overhead_extension": "cable_overhead_extension",
	"close_grip_bench_press": "close_grip_bench_press",
	"dips": "dips",
	"dip": "dips",
	"seated_dip_machine": "seated_dip_machine",
	"skull_crusher": "skull_crusher",
	"rope_pushdown": "rope_pushdown",
	"single_arm_cable_pushdown": "single_arm_cable_pushdown",
	"diamond_push_up": "diamond_push_up",

	# Quads
	"leg_press": "leg_press",
	"leg_press_machine": "leg_press",
	"squat": "squat",
	"hack_squat": "hack_squat",
	"leg_extension": "leg_extension",
	"leg_extension_machine": "leg_extension",
	"bulgarian_split_squat": "bulgarian_split_squat",
	"smith_machine": "smith_machine",
	"smith": "smith_machine",
	"chinning_dipping": "chinning_dipping",
	"leg_raise_tower": "leg_raise_tower",
	"dumbbell": "dumbbell",
	"smith_machine_squat": "smith_machine_squat",
	"smith_machine_bench_press": "smith_machine_bench_press",
	"smith_machine_flat_bench_press": "smith_machine_bench_press",
	"smith_machine_incline_bench_press": "smith_machine_incline_bench_press",
	"smith_machine_decline_bench_press": "smith_machine_decline_bench_press",
	"goblet_squat": "goblet_squat",

	# Hamstrings
	"lying_leg_curl": "lying_leg_curl",
	"reg_curl_machine": "lying_leg_curl",
	"lying_leg_curl_machine": "lying_leg_curl",
	"seated_leg_curl_machine": "seated_leg_curl_machine",
	"seated_leg_curl": "seated_leg_curl_machine",
	"good_morning": "good_morning",

	# Glutes
	"hip_thrust": "hip_thrust",
	"hip_thruster": "hip_thrust",
	"hip_truster": "hip_thrust",
	"cable_kickback": "cable_kickback",
	"hip_abductor_machine": "abductor_machine",
	"hip_abductor": "abductor_machine",
	"abductor_machine": "abductor_machine",
	"adductor_machine": "adductor_machine",

	# Calves
	"standing_calf_raise": "standing_calf_raise",
	"seated_calf_raise": "seated_calf_raise",
	"leg_press_calf_raise": "leg_press_calf_raise",
	"donkey_calf_raise": "donkey_calf_raise",

	# Abs
	"crunch": "crunch",
	"cable_crunch": "cable_crunch",
	"decline_sit_up": "decline_sit_up",
	"hanging_leg_raise": "hanging_leg_raise",
	"knee_raise": "knee_raise",
	"russian_twist": "russian_twist",
	"rotary_torso_machine": "rotary_torso_machine",
	"rotary_torso": "rotary_torso_machine",
	"torso_machine": "rotary_torso_machine",
	"torso_rotation_machine": "rotary_torso_machine",
}

for _key in MACHINE_METADATA.keys():
	ALIASES.setdefault(_key, _key)

# ========== AUTHENTICATION ==========

class User(UserMixin):
	"""User model for Flask-Login."""
	def __init__(self, user_id: int, email: str, username: str):
		self.id = user_id
		self.email = email
		self.username = username

	def get_id(self):
		return str(self.id)


def init_db():
	"""Initialize the database with users table."""
	conn = sqlite3.connect(str(DATABASE_PATH))
	cursor = conn.cursor()
	cursor.execute("""
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT UNIQUE NOT NULL,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			email_verified INTEGER DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	""")
	# Add email_verified column if it doesn't exist (for existing databases)
	try:
		cursor.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0")
	except sqlite3.OperationalError:
		pass  # Column already exists
	
	cursor.execute("""
		CREATE TABLE IF NOT EXISTS verification_codes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL,
			code TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			expires_at TIMESTAMP
		)
	""")
	conn.commit()
	conn.close()
	print("[INFO] Database initialized")


def get_db_connection():
	"""Get database connection."""
	conn = sqlite3.connect(str(DATABASE_PATH))
	conn.row_factory = sqlite3.Row
	return conn


def generate_verification_code() -> str:
	"""Generate a 6-digit verification code."""
	return ''.join([str(secrets.randbelow(10)) for _ in range(6)])


def send_verification_email(email: str, code: str) -> bool:
	"""Send verification code via email."""
	# Check if email is configured
	if not app.config.get('MAIL_USERNAME') or not app.config.get('MAIL_PASSWORD'):
		print(f"[WARNING] Email not configured. MAIL_USERNAME or MAIL_PASSWORD is empty.")
		print(f"[WARNING] Set environment variables: MAIL_USERNAME and MAIL_PASSWORD")
		return False
	
	try:
		msg = Message(
			subject='GymVision AI - Email Verification',
			recipients=[email],
			body=f'''Welcome to GymVision AI!

Please verify your email address by entering this code:

{code}

This code will expire in 10 minutes.

If you didn't create an account, please ignore this email.

Best regards,
GymVision AI Team''',
			html=f'''<html>
<body style="font-family: Arial, sans-serif; background-color: #0f0f10; color: #f5f6f7; padding: 20px;">
	<div style="max-width: 600px; margin: 0 auto; background-color: #1a1a1c; padding: 30px; border-radius: 12px;">
		<h1 style="color: #8b5cf6;">Welcome to GymVision AI!</h1>
		<p>Please verify your email address by entering this code:</p>
		<div style="background-color: #252528; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
			<h2 style="color: #8b5cf6; font-size: 32px; letter-spacing: 8px; margin: 0;">{code}</h2>
		</div>
		<p style="color: #888; font-size: 14px;">This code will expire in 10 minutes.</p>
		<p style="color: #888; font-size: 14px;">If you didn't create an account, please ignore this email.</p>
		<p style="margin-top: 30px; color: #888;">Best regards,<br>GymVision AI Team</p>
	</div>
</body>
</html>'''
		)
		mail.send(msg)
		print(f"[INFO] Verification email sent to {email}")
		return True
	except Exception as e:
		print(f"[ERROR] Failed to send verification email: {e}")
		import traceback
		traceback.print_exc()
		return False


@login_manager.user_loader
def load_user(user_id: str):
	"""Load user from database for Flask-Login."""
	conn = get_db_connection()
	user = conn.execute(
		"SELECT id, email, username FROM users WHERE id = ?", (user_id,)
	).fetchone()
	conn.close()
	if user:
		return User(user["id"], user["email"], user["username"])
	return None


# ========== ML MODELS ==========

_model = None
_model1 = None
_model2 = None
_model3 = None
_model4 = None


def get_models():
	global _model, _model1, _model2, _model3, _model4
	if any(m is None for m in (_model, _model1, _model2, _model3, _model4)):
		if YOLO is None:
			raise RuntimeError("Ultralytics not available. Install dependencies from requirements.txt")
		if MODEL_PATH.exists():
			_model = YOLO(str(MODEL_PATH))
		if MODEL_PATH_1.exists():
			_model1 = YOLO(str(MODEL_PATH_1))
		if MODEL_PATH_2.exists():
			_model2 = YOLO(str(MODEL_PATH_2))
		if MODEL_PATH_3.exists():
			_model3 = YOLO(str(MODEL_PATH_3))
		if MODEL_PATH_4.exists():
			_model4 = YOLO(str(MODEL_PATH_4))
		if all(m is None for m in (_model, _model1, _model2, _model3, _model4)):
			raise FileNotFoundError("No model files found. Check for best.pt, best1.pt, best2.pt, best3.pt or best4.pt")
	return _model, _model1, _model2, _model3, _model4


# ========== AUTHENTICATION ROUTES ==========

@app.route("/login", methods=["GET", "POST"])
def login():
	"""Login page and handler."""
	if request.method == "POST":
		data = request.get_json() or {}
		email = data.get("email", "").strip().lower()
		password = data.get("password", "")
		
		if not email or not password:
			return jsonify({"error": "Email and password are required"}), 400
		
		conn = get_db_connection()
		user = conn.execute(
			"SELECT id, email, username, password_hash, email_verified FROM users WHERE email = ?", (email,)
		).fetchone()
		conn.close()
		
		if user and check_password_hash(user["password_hash"], password):
			# Check if email is verified
			if not user["email_verified"]:
				return jsonify({
					"error": "Email not verified. Please verify your email first.",
					"needs_verification": True,
					"email": user["email"]
				}), 403
			
			user_obj = User(user["id"], user["email"], user["username"])
			login_user(user_obj, remember=True)
			return jsonify({"success": True, "message": "Logged in successfully"})
		else:
			return jsonify({"error": "Invalid email or password"}), 401
	
	# GET request - show login page
	if current_user.is_authenticated:
		return redirect(url_for("index"))
	# Load Supabase config from environment variables (safe to expose - these are public anon keys)
	# Ensure we always pass strings, never None
	supabase_url = os.getenv("SUPABASE_URL") or ""
	supabase_anon_key = os.getenv("SUPABASE_ANON_KEY") or ""
	return render_template("login.html", SUPABASE_URL=supabase_url, SUPABASE_ANON_KEY=supabase_anon_key)


@app.route("/register", methods=["GET", "POST"])
def register():
	"""Registration page and handler."""
	if request.method == "POST":
		data = request.get_json() or {}
		email = data.get("email", "").strip().lower()
		username = data.get("username", "").strip()
		password = data.get("password", "")
		
		if not email or not username or not password:
			return jsonify({"error": "Email, username, and password are required"}), 400
		
		if len(password) < 6:
			return jsonify({"error": "Password must be at least 6 characters"}), 400
		
		if len(username) < 3:
			return jsonify({"error": "Username must be at least 3 characters"}), 400
		
		conn = get_db_connection()
		try:
			# Check if email or username already exists
			existing = conn.execute(
				"SELECT id FROM users WHERE email = ? OR username = ?", (email, username)
			).fetchone()
			if existing:
				conn.close()
				return jsonify({"error": "Email or username already exists"}), 400
			
			# Create new user (not verified yet)
			password_hash = generate_password_hash(password)
			cursor = conn.execute(
				"INSERT INTO users (email, username, password_hash, email_verified) VALUES (?, ?, ?, 0)",
				(email, username, password_hash)
			)
			conn.commit()
			user_id = cursor.lastrowid
			
			# Generate and save verification code
			code = generate_verification_code()
			from datetime import timedelta
			expires_at = (datetime.now() + timedelta(minutes=10)).isoformat()
			conn.execute(
				"INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)",
				(email, code, expires_at)
			)
			conn.commit()
			conn.close()
			
			# Send verification email
			email_sent = send_verification_email(email, code)
			if email_sent:
				return jsonify({
					"success": True,
					"message": "Account created. Please check your email for verification code.",
					"email": email
				})
			else:
				# For development: return code in response if email fails
				# TODO: Remove this in production!
				print(f"[DEBUG] Email failed. Verification code for {email}: {code}")
				return jsonify({
					"success": True,
					"message": f"Account created. Email could not be sent. Your verification code is: {code}",
					"email": email,
					"code": code  # Only for development!
				})
		except sqlite3.IntegrityError:
			conn.close()
			return jsonify({"error": "Email or username already exists"}), 400
	
	# GET request - show register page
	if current_user.is_authenticated:
		return redirect(url_for("index"))
	# Load Supabase config from environment variables (safe to expose - these are public anon keys)
	# Ensure we always pass strings, never None
	supabase_url = os.getenv("SUPABASE_URL") or ""
	supabase_anon_key = os.getenv("SUPABASE_ANON_KEY") or ""
	return render_template("register.html", SUPABASE_URL=supabase_url, SUPABASE_ANON_KEY=supabase_anon_key)


@app.route("/verify", methods=["GET", "POST"])
def verify_email():
	"""Email verification page and handler."""
	if request.method == "POST":
		data = request.get_json() or {}
		email = data.get("email", "").strip().lower()
		code = data.get("code", "").strip()
		
		if not email or not code:
			return jsonify({"error": "Email and code are required"}), 400
		
		conn = get_db_connection()
		# Check if code is valid and not expired
		verification = conn.execute(
			"SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1",
			(email, code)
		).fetchone()
		
		if not verification:
			conn.close()
			return jsonify({"error": "Invalid or expired verification code"}), 400
		
		# Mark email as verified
		conn.execute(
			"UPDATE users SET email_verified = 1 WHERE email = ?",
			(email,)
		)
		# Delete used verification code
		conn.execute(
			"DELETE FROM verification_codes WHERE email = ? AND code = ?",
			(email, code)
		)
		conn.commit()
		
		# Get user and auto-login
		user = conn.execute(
			"SELECT id, email, username FROM users WHERE email = ?", (email,)
		).fetchone()
		conn.close()
		
		if user:
			user_obj = User(user["id"], user["email"], user["username"])
			login_user(user_obj, remember=True)
			return jsonify({"success": True, "message": "Email verified successfully"})
		else:
			return jsonify({"error": "User not found"}), 404
	
	# GET request - show verification page
	email = request.args.get("email", "")
	return render_template("verify.html", email=email)


@app.route("/resend-code", methods=["POST"])
def resend_verification_code():
	"""Resend verification code."""
	data = request.get_json() or {}
	email = data.get("email", "").strip().lower()
	
	if not email:
		return jsonify({"error": "Email is required"}), 400
	
	conn = get_db_connection()
	# Check if user exists and is not verified
	user = conn.execute(
		"SELECT id, email_verified FROM users WHERE email = ?", (email,)
	).fetchone()
	
	if not user:
		conn.close()
		return jsonify({"error": "User not found"}), 404
	
	if user["email_verified"]:
		conn.close()
		return jsonify({"error": "Email already verified"}), 400
	
	# Generate new code
	code = generate_verification_code()
	from datetime import timedelta
	expires_at = (datetime.now() + timedelta(minutes=10)).isoformat()
	conn.execute(
		"INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)",
		(email, code, expires_at)
	)
	conn.commit()
	conn.close()
	
	# Send email
	email_sent = send_verification_email(email, code)
	if email_sent:
		return jsonify({"success": True, "message": "Verification code sent to your email"})
	else:
		# For development: return code in response if email fails
		print(f"[DEBUG] Email failed. Verification code for {email}: {code}")
		return jsonify({
			"success": True,
			"message": f"Email could not be sent. Your verification code is: {code}",
			"code": code  # Only for development!
		})


@app.route("/logout", methods=["POST"])
@login_required
def logout():
	"""Logout handler."""
	logout_user()
	return jsonify({"success": True, "message": "Logged out successfully"})


@app.route("/check-auth", methods=["GET"])
def check_auth():
	"""Check if user is authenticated."""
	if current_user.is_authenticated:
		return jsonify({
			"authenticated": True,
			"user_id": str(current_user.id),  # Use user ID as unique identifier
			"username": current_user.username,
			"email": current_user.email
		})
	return jsonify({"authenticated": False})


@app.route("/user", methods=["GET"])
def get_user():
	"""Get current user from Supabase JWT token."""
	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500
	
	# Get Authorization header
	auth_header = request.headers.get("Authorization")
	if not auth_header or not auth_header.startswith("Bearer "):
		return jsonify({"error": "Missing or invalid Authorization header"}), 401
	
	# Extract access token
	access_token = auth_header.replace("Bearer ", "").strip()
	if not access_token:
		return jsonify({"error": "Missing access token"}), 401
	
	# Initialize Supabase client - load from environment variables only
	SUPABASE_URL = os.getenv("SUPABASE_URL")
	SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
	
	if not SUPABASE_URL or not SUPABASE_ANON_KEY:
		return jsonify({"error": "Supabase configuration missing. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables."}), 500
	
	try:
		supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
		user_response = supabase_client.auth.get_user(access_token)
		
		if user_response.user:
			return jsonify({
				"id": user_response.user.id,
				"email": user_response.user.email,
				"user_metadata": user_response.user.user_metadata or {},
				"authenticated": True
			})
		else:
			return jsonify({"error": "Invalid token"}), 401
	except Exception as e:
		print(f"Error verifying user: {e}")
		return jsonify({"error": "Failed to verify user", "details": str(e)}), 401


# ========== MAIN APP ROUTES ==========

@app.route("/")
def index():
	"""Main app page - authentication handled by frontend."""
	# Load Supabase config from environment variables (safe to expose - these are public anon keys)
	# Ensure we always pass strings, never None
	supabase_url = os.getenv("SUPABASE_URL") or ""
	supabase_anon_key = os.getenv("SUPABASE_ANON_KEY") or ""
	return render_template("index.html", SUPABASE_URL=supabase_url, SUPABASE_ANON_KEY=supabase_anon_key)


@app.route("/privacy")
def privacy():
	"""Privacy Policy page."""
	return render_template("privacy.html")


@app.route("/support")
def support():
	"""Support page."""
	return render_template("support.html")


@app.route("/logo.png")
def logo():
	# Prefer the new logo filename; fall back to the old one
	candidates = [
		"gymvision-removebg-preview.png",
		"GymVision_AI-removebg-preview.png",
	]
	for filename in candidates:
		path = APP_ROOT / filename
		if path.exists():
			return send_from_directory(str(APP_ROOT), filename)
	return ("", 204)


@app.route("/flame.png")
def flame():
    # Serve user-provided flame icon
    candidates = [
        "flame-removebg-preview.png",
    ]
    for filename in candidates:
        path = APP_ROOT / filename
        if path.exists():
            return send_from_directory(str(APP_ROOT), filename)
    return ("", 204)


@app.route("/loupe.png")
def loupe_icon():
	"""Serve the loupe icon used for the Explore tab."""
	path = APP_ROOT / "loupe.png"
	if path.exists():
		return send_from_directory(str(APP_ROOT), "loupe.png")
	return ("", 204)


def resolve_image_path(filename: str) -> Optional[Path]:
	for directory in IMAGES_PATHS:
		candidate = directory / filename
		if candidate.exists():
			return candidate
	return None


def _slugify_for_image(value: str) -> str:
	return "".join(ch for ch in (value or "").lower() if ch.isalnum())


def image_url_for_key(key: str, meta: Optional[Dict[str, Any]] = None) -> Optional[str]:
	if not key:
		return None
	meta = meta or MACHINE_METADATA.get(key, {})
	candidates: List[str] = []
	display_name = meta.get("display")
	if display_name:
		candidates.append(_slugify_for_image(display_name))
	candidates.append(_slugify_for_image(key.replace("_", " ")))
	candidates.append(_slugify_for_image(key))
	unique_candidates = []
	seen = set()
	for candidate in candidates:
		if candidate and candidate not in seen:
			seen.add(candidate)
			unique_candidates.append(candidate)
	for base in unique_candidates:
		for ext in IMAGE_FILE_EXTENSIONS:
			filename = f"{base}{ext}"
			if resolve_image_path(filename):
				return f"/images/{filename}"
	# Fallback to fuzzy match
	target = unique_candidates[0] if unique_candidates else _slugify_for_image(key)
	if target:
		match = next(iter(get_close_matches(target, IMAGE_BASENAMES, n=1, cutoff=0.87)), None)
		if match:
			for ext in IMAGE_FILE_EXTENSIONS:
				filename = f"{match}{ext}"
				if resolve_image_path(filename):
					return f"/images/{filename}"
	return None


@app.route("/images/<path:filename>")
def custom_image(filename: str):
    file_path = resolve_image_path(filename)
    if not file_path:
        return ("", 404)
    return send_from_directory(str(file_path.parent), file_path.name)


@app.route("/nav/<filename>")
def nav_icon(filename):
    # Serve nav icons: home.png, settings.png, dumbell.png, progress.png
    if filename in ["home.png", "settings.png", "dumbell.png", "progress.png"]:
        path = APP_ROOT / filename
        if path.exists():
            return send_from_directory(str(APP_ROOT), filename)
    return ("", 204)


def _serialize_prediction_choice(pred: Dict[str, Any]) -> Dict[str, Any]:
	key = pred["key"]
	label = pred.get("label")
	meta = MACHINE_METADATA.get(key, {
		"display": label or "Unknown",
		"muscles": [],
		"video": "",
	})
	# Use metadata display name if available, otherwise format the label nicely
	display_name = meta.get("display") or (label.replace("_", " ").title() if label else "Unknown")
	return {
		"key": key,
		"label": label,
		"display": display_name,
		"muscles": normalize_muscles(meta.get("muscles", [])),
		"video": meta.get("video", ""),
		"image": image_url_for_key(key, meta) or meta.get("image"),
		"confidence": pred.get("conf", 0.0),
	}


@app.route("/predict", methods=["POST"])
def predict():
	# Public endpoint - authentication handled by frontend via Supabase
	file = request.files.get("image")
	if not file:
		return jsonify({"error": "No image provided"}), 400

	tmp_dir = APP_ROOT / "tmp"
	tmp_dir.mkdir(exist_ok=True)
	tmp_path = tmp_dir / "upload.jpg"
	file.save(str(tmp_path))

	model, model1, model2, model3, model4 = get_models()
	
	# Get predictions from all models (best.pt, best1.pt, best2.pt, best3.pt, best4.pt)
	predictions = []
	
	# Helper function to get top predictions from a model
	def get_model_predictions(model_obj, model_name, max_predictions=3):
		model_preds = []
		try:
			results = model_obj.predict(source=str(tmp_path), verbose=False)
			best = results[0]
			
			if hasattr(best, "probs") and best.probs is not None:
				# Classification model - get top predictions
				probs = best.probs.data
				top_indices = probs.topk(min(max_predictions, len(best.names))).indices.tolist()
				top_confs = probs.topk(min(max_predictions, len(best.names))).values.tolist()
				
				for idx, conf in zip(top_indices, top_confs):
					label = best.names[int(idx)]
					norm = normalize_label(label)
					key = ALIASES.get(norm, norm)
					model_preds.append({"label": label, "conf": float(conf), "key": key, "source": model_name})
			elif len(best.boxes) > 0:  # type: ignore[attr-defined]
				# Detection model - get top predictions by confidence
				confidences = best.boxes.conf.tolist()  # type: ignore[attr-defined]
				classes = best.boxes.cls.tolist()  # type: ignore[attr-defined]
				
				# Combine and sort by confidence
				box_predictions = []
				for i, (conf, cls_idx) in enumerate(zip(confidences, classes)):
					label = best.names[int(cls_idx)]
					norm = normalize_label(label)
					key = ALIASES.get(norm, norm)
					box_predictions.append({"label": label, "conf": float(conf), "key": key, "source": model_name, "index": i})
				
				# Sort by confidence and get top unique keys
				box_predictions.sort(key=lambda x: x["conf"], reverse=True)
				seen_keys = set()
				for pred in box_predictions:
					if pred["key"] not in seen_keys:
						model_preds.append(pred)
						seen_keys.add(pred["key"])
						if len(model_preds) >= max_predictions:
							break
		except Exception as e:
			print(f"[ERROR] Model {model_name} prediction failed: {e}")
			import traceback
			traceback.print_exc()
		return model_preds
	
	# Get predictions from all available models
	if model:
		predictions.extend(get_model_predictions(model, "best"))
	if model1:
		predictions.extend(get_model_predictions(model1, "best1"))
	if model2:
		predictions.extend(get_model_predictions(model2, "best2"))
	if model3:
		predictions.extend(get_model_predictions(model3, "best3"))
	if model4:
		predictions.extend(get_model_predictions(model4, "best4"))
	
	if not predictions:
		try:
			os.remove(str(tmp_path))
		except Exception:
			pass
		return jsonify({"success": False, "error": "NO_PREDICTION"}), 422
	
	# Filter out unwanted predictions
	excluded_keys = {normalize_label("Kettlebells"), normalize_label("Assisted Chin Up-Dip")}
	predictions = [p for p in predictions if p.get("key") not in excluded_keys]
	
	if not predictions:
		try:
			os.remove(str(tmp_path))
		except Exception:
			pass
		return jsonify({"success": False, "error": "NO_PREDICTION"}), 422
	
	# Group predictions by key and select best from each model group
	grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
	for pred in predictions:
		grouped[pred["key"]].append(pred)
	
	# For each unique key, select the best prediction based on model priority
	label_candidates: List[Dict[str, Any]] = []
	for key, preds_for_label in grouped.items():
		sorted_preds = sorted(preds_for_label, key=lambda p: p["conf"], reverse=True)
		top_conf = sorted_preds[0]["conf"]
		priority = LABEL_MODEL_PRIORITY.get(key, DEFAULT_MODEL_PRIORITY)
		chosen = None
		for model_name in priority:
			candidate = next((p for p in sorted_preds if p["source"] == model_name), None)
			if candidate and candidate["conf"] >= top_conf - MODEL_PRIORITY_MARGIN:
				chosen = candidate
				break
		if chosen is None:
			chosen = sorted_preds[0]
		label_candidates.append(chosen)
	
	# Get top 3 predictions sorted by confidence
	sorted_predictions = sorted(label_candidates, key=lambda p: p["conf"], reverse=True)[:3]
	
	if not sorted_predictions:
		try:
			os.remove(str(tmp_path))
		except Exception:
			pass
		return jsonify({"success": False, "error": "NO_PREDICTION"}), 422

	selected = sorted_predictions[0]
	top_payloads = [_serialize_prediction_choice(pred) for pred in sorted_predictions]
	primary_payload = top_payloads[0]
	
	# Check if primary prediction is a generic exercise that needs refinements
	generic_refinements = {
		"smith_machine": [
			{"key": "smith_machine_bench_press", "display": "Smith Machine Bench Press"},
			{"key": "smith_machine_incline_bench_press", "display": "Smith Machine Incline Bench Press"},
			{"key": "smith_machine_decline_bench_press", "display": "Smith Machine Decline Bench Press"},
			{"key": "smith_machine_squat", "display": "Smith Machine Squat"},
			{"key": "smith_machine_shoulder_press", "display": "Smith Machine Shoulder Press"}
		],
		"leg_raise_tower": [
			{"key": "hanging_leg_raise", "display": "Hanging Leg Raise"},
			{"key": "knee_raise", "display": "Knee Raise"},
			{"key": "dips", "display": "Dips"},
			{"key": "pull_up", "display": "Pull-Up"},
			{"key": "chin_up", "display": "Chin-Up"}
		],
		"chinning_dipping": [
			{"key": "pull_up", "display": "Pull-Up"},
			{"key": "chin_up", "display": "Chin-Up"},
			{"key": "dips", "display": "Dips"},
			{"key": "hanging_leg_raise", "display": "Hanging Leg Raise"},
			{"key": "knee_raise", "display": "Knee Raise"}
		],
		"dumbbell": [
			{"key": "dumbbell_bench_press", "display": "Dumbbell Bench Press"},
			{"key": "incline_dumbbell_press", "display": "Incline Dumbbell Press"},
			{"key": "decline_dumbbell_press", "display": "Decline Dumbbell Press"},
			{"key": "dumbbell_fly", "display": "Dumbbell Fly"},
			{"key": "arnold_press", "display": "Arnold Press"},
			{"key": "lateral_raise", "display": "Lateral Raise"},
			{"key": "front_raise", "display": "Front Raise"},
			{"key": "one_arm_dumbbell_row", "display": "One Arm Dumbbell Row"},
			{"key": "chest_supported_row", "display": "Chest Supported Row"},
			{"key": "bulgarian_split_squat", "display": "Bulgarian Split Squat"},
			{"key": "alternating_dumbbell_curl", "display": "Alternating Dumbbell Curl"},
			{"key": "incline_dumbbell_curl", "display": "Incline Dumbbell Curl"},
			{"key": "reverse_curl", "display": "Reverse Curl"},
			{"key": "spider_curl", "display": "Spider Curl"},
			{"key": "overhead_tricep_extension", "display": "Overhead Tricep Extension"},
			{"key": "rear_delt_fly", "display": "Rear Delt Fly"}
		]
	}
	
	refinements = None
	if primary_payload["key"] in generic_refinements:
		refinements = [_serialize_prediction_choice({"key": ex["key"], "label": ex["display"], "conf": 0.0}) for ex in generic_refinements[primary_payload["key"]]]

	label = selected["label"]
	conf = selected["conf"]
	key = selected["key"]
	print(f"[DEBUG] Selected: {label} with {conf:.2%} confidence")
	
	# Cleanup temp file
	try:
		os.remove(str(tmp_path))
	except Exception:
		pass

	# Resolve metadata using normalized label and aliases
	response = {
		"success": True,
		"label": primary_payload["label"],
		"confidence": primary_payload["confidence"],
		"display": primary_payload["display"],
		"muscles": primary_payload["muscles"],
		"video": primary_payload["video"],
		"key": primary_payload["key"],
		"image": primary_payload.get("image"),
		"top_predictions": top_payloads,
	}
	
	# Add refinements if this is a generic exercise
	if refinements:
		response["refinements"] = refinements
	
	return jsonify(response)


@app.route("/favicon.ico")
def favicon():
	return ("", 204)


@app.route("/exercise-info", methods=["POST"])
def exercise_info():
	"""Get metadata for a manually selected exercise."""
	# Public endpoint - exercise metadata is not sensitive
	data = request.json
	exercise_key = data.get("exercise", "")
	
	# Normalize the key
	norm = normalize_label(exercise_key)
	key = ALIASES.get(norm, norm)
	
	# Get metadata
	meta = MACHINE_METADATA.get(key, {
		"display": exercise_key.replace("_", " ").title(),
		"muscles": [],
		"video": "",
	})
	
	muscles = normalize_muscles(meta.get("muscles", []))
	
	return jsonify({
		"display": meta["display"],
		"muscles": muscles,
		"video": meta["video"],
		"key": key,
		"image": image_url_for_key(key, meta) or meta.get("image"),
	})


@app.route("/exercises", methods=["GET"])
def exercises_list():
	"""Get list of all available exercises."""
	# Public endpoint - exercises are not sensitive data
	exercises = []
	for key, meta in MACHINE_METADATA.items():
		exercises.append({
			"key": key,
			"display": meta.get("display", key.replace("_", " ").title()),
			"muscles": meta.get("muscles", []),
			"image": image_url_for_key(key, meta) or meta.get("image"),
		})
	return jsonify({"exercises": exercises})


@app.route("/model-classes", methods=["GET"])
def model_classes():
	"""Get all classes that the models can predict."""
	# Public endpoint - model classes are not sensitive
	all_classes = set()
	try:
		model, model1, model2, model3, model4 = get_models()
		if model and hasattr(model, 'names'):
			all_classes.update(model.names.values())
		if model2 and hasattr(model2, 'names'):
			all_classes.update(model2.names.values())
		if model3 and hasattr(model3, 'names'):
			all_classes.update(model3.names.values())
	except Exception as e:
		return jsonify({"error": str(e)}), 500
	
	# Get classes in metadata
	metadata_classes = set(MACHINE_METADATA.keys())
	
	# Find missing classes
	missing = sorted(all_classes - metadata_classes)
	
	return jsonify({
		"all_model_classes": sorted(all_classes),
		"metadata_classes": sorted(metadata_classes),
		"missing_in_metadata": missing
	})


@app.route("/api/vision-workout", methods=["POST"])
def vision_workout():
	"""AI workout generation endpoint for Vision chat - uses Groq API."""
	if not GROQ_AVAILABLE:
		return jsonify({"error": "Groq API not available. Please install groq package."}), 500
	
	# Load API key from environment variable only
	GROQ_API_KEY = os.getenv("GROQ_API_KEY")
	if not GROQ_API_KEY:
		return jsonify({"error": "Groq API key not configured. Set GROQ_API_KEY environment variable."}), 500
	
	data = request.get_json()
	message = data.get("message", "").strip()
	workout_context = data.get("workoutContext")
	
	if not message:
		return jsonify({"error": "Message is required"}), 400
	
	# Build exercise list with keys for workout generation
	exercise_list = []
	exercise_map = {}
	for key, meta in MACHINE_METADATA.items():
		display_name = meta.get("display", key.replace("_", " ").title())
		muscles = meta.get("muscles", [])
		muscle_str = ", ".join([m for m in muscles if m and m != "-"])
		exercise_list.append(f"{display_name} (key: {key})" + (f" - targets: {muscle_str}" if muscle_str else ""))
		exercise_map[display_name.lower()] = key
		exercise_map[key] = key
	
	exercises_context = "\n".join(exercise_list[:150])
	
	context_info = ""
	if workout_context:
		current_exercises = ", ".join([ex.get("display", ex.get("key", "")) for ex in workout_context.get("exercises", [])])
		context_info = f"\n\nCurrent workout: {workout_context.get('name', 'Workout')}\nCurrent exercises: {current_exercises}\nThe user wants to MODIFY this workout."
	
	prompt = f"""Based on this user request: "{message}"
{context_info}

Generate a workout plan. Return ONLY a JSON object with this exact structure:
{{
  "name": "workout name",
  "exercises": [
    {{"key": "exercise_key", "display": "Exercise Name"}},
    ...
  ]
}}

Use exercise keys from this list (use the key exactly as shown):
{exercises_context}

CRITICAL RULES:
- Return ONLY valid JSON, no other text, no markdown, no code blocks
- Use exact exercise keys from the list (the part after "key: ")
- Give ONLY what the user asks for - if they ask for "just pushups", give ONLY pushups
- If user specifies exact exercises, use ONLY those exercises
- If user asks for a workout type (push/pull/legs) without specifics, then suggest 4-6 exercises
- If user says "no X" or "replace X with Y", adjust accordingly
- Do NOT add extra exercises if user asks for specific ones
- Match the muscle groups mentioned (push = chest/shoulders/triceps, pull = back/biceps, legs = quads/hamstrings/glutes)

Examples:
- User: "just pushups" → {{"name": "Pushup Workout", "exercises": [{{"key": "push_up", "display": "Push-Up"}}]}}
- User: "push workout" → {{"name": "Push Workout", "exercises": [{{"key": "bench_press", "display": "Bench Press"}}, {{"key": "incline_bench_press", "display": "Incline Bench Press"}}, {{"key": "shoulder_press_machine", "display": "Shoulder Press Machine"}}, {{"key": "tricep_pushdown", "display": "Tricep Pushdown"}}]}}
- User: "bench press and tricep pushdown" → {{"name": "Workout", "exercises": [{{"key": "bench_press", "display": "Bench Press"}}, {{"key": "tricep_pushdown", "display": "Tricep Pushdown"}}]}}
"""
	
	try:
		# Groq SDK handles Authorization header internally
		# API key is loaded from environment variable only
		client = Groq(api_key=GROQ_API_KEY)
		response = client.chat.completions.create(
			model="llama-3.3-70b-versatile",
			messages=[
				{"role": "system", "content": "You are a fitness expert. Return ONLY valid JSON, no explanations. Start your response with { and end with }."},
				{"role": "user", "content": prompt}
			],
			temperature=0.3,
			max_tokens=800
		)
		
		content = response.choices[0].message.content.strip()
		# Try to extract JSON from response (might have markdown code blocks)
		if "```" in content:
			# Extract JSON from code block
			start = content.find("```")
			if start != -1:
				start = content.find("\n", start) + 1
				end = content.find("```", start)
				if end != -1:
					content = content[start:end].strip()
		
		# Remove markdown code block markers if present
		if content.startswith("```json"):
			content = content[7:].strip()
		if content.startswith("```"):
			content = content[3:].strip()
		if content.endswith("```"):
			content = content[:-3].strip()
		
		# Parse JSON
		workout_json = json.loads(content)
		
		# Validate and clean up the workout
		if not workout_json.get("exercises"):
			return jsonify({"error": "No exercises generated in workout"}), 500
		
		exercise_list = workout_json.get("exercises", [])
		print(f"[DEBUG] Found {len(exercise_list)} exercises in workout JSON")
		
		# Validate exercises exist in metadata
		valid_exercises = []
		for ex in exercise_list:
			key = ex.get("key", "").lower()
			display = ex.get("display", "")
			
			# Try to find exercise by key
			meta_key = None
			for meta_key_candidate, meta in MACHINE_METADATA.items():
				if meta_key_candidate.lower() == key:
					meta_key = meta_key_candidate
					break
			
			# If not found by key, try by display name
			if not meta_key:
				for meta_key_candidate, meta in MACHINE_METADATA.items():
					if meta.get("display", "").lower() == display.lower():
						meta_key = meta_key_candidate
						break
			
			if meta_key:
				meta = MACHINE_METADATA[meta_key]
				valid_exercises.append({
					"key": meta_key,
					"display": meta.get("display", display)
				})
			else:
				print(f"[WARNING] Could not find exercise: key='{key}', display='{display}'")
		
		if not valid_exercises:
			return jsonify({"error": "No valid exercises found in workout"}), 500
		
		return jsonify({
			"workout": {
				"name": workout_json.get("name", "AI Workout"),
				"exercises": valid_exercises
			}
		})
	except json.JSONDecodeError as e:
		print(f"[ERROR] Failed to parse workout JSON: {e}")
		print(f"[DEBUG] Content was: {content[:500]}")
		return jsonify({"error": "Failed to parse workout response from AI"}), 500
	except Exception as e:
		print(f"[ERROR] Workout generation failed: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": f"Failed to generate workout: {str(e)}"}), 500


@app.route("/chat", methods=["POST"])
def chat():
	"""AI chatbot endpoint for fitness-related questions."""
	# Public endpoint - authentication handled by frontend via Supabase
	if not GROQ_AVAILABLE:
		return jsonify({"error": "Groq API not available. Please install groq package."}), 500
	
	# Load API key from environment variable only
	GROQ_API_KEY = os.getenv("GROQ_API_KEY")
	if not GROQ_API_KEY:
		return jsonify({"error": "Groq API key not configured. Set GROQ_API_KEY environment variable."}), 500
	
	data = request.get_json()
	message = data.get("message", "").strip()
	workout_context = data.get("workoutContext")
	
	if not message:
		return jsonify({"error": "Message is required"}), 400
	
	# Build context about available exercises
	exercise_list = []
	for key, meta in MACHINE_METADATA.items():
		display_name = meta.get("display", key.replace("_", " ").title())
		muscles = meta.get("muscles", [])
		muscle_str = ", ".join([m for m in muscles if m and m != "-"])
		exercise_list.append(f"- {display_name}" + (f" (targets: {muscle_str})" if muscle_str else ""))
	
	exercises_context = "\n".join(exercise_list[:100])  # Limit to first 100 exercises to avoid token limits
	
	context_note = ""
	if workout_context:
		current_exercises = ", ".join([ex.get("display", ex.get("key", "")) for ex in workout_context.get("exercises", [])])
		context_note = f"\n\nNOTE: The user is currently building a workout called '{workout_context.get('name', 'Workout')}' with these exercises: {current_exercises}. If they ask to modify, add, or remove exercises, you should generate a workout JSON response."
	
	system_prompt = f"""You are Vision, an AI fitness assistant for the GymVision AI app. Your role is to help users with fitness and gym-related questions.

IMPORTANT RULES:
1. ONLY answer questions related to fitness, exercise, gym, nutrition, health, and wellness
2. If asked about non-fitness topics (math, general knowledge, etc.), politely decline and redirect to fitness topics
3. You have access to the following exercises available in the app:
{exercises_context}

4. When recommending exercises, prioritize exercises from the list above
5. Be helpful, encouraging, and provide practical advice
6. Keep responses concise but informative
7. If asked about workout splits, provide practical recommendations based on training frequency
8. If asked about equipment limitations (e.g., "only have dumbbells"), suggest exercises that match the available equipment
9. If the user asks to create or modify a workout (e.g., "make a push workout", "add bench press", "remove overhead press"), you should generate a workout JSON response{context_note}

Remember: You are a fitness expert assistant. Stay focused on fitness topics only."""

	try:
		# Groq SDK handles Authorization header internally
		# API key is loaded from environment variable only
		client = Groq(api_key=GROQ_API_KEY)
		response = client.chat.completions.create(
			model="llama-3.3-70b-versatile",  # Updated to current Groq model
			messages=[
				{"role": "system", "content": system_prompt},
				{"role": "user", "content": message}
			],
			temperature=0.7,
			max_tokens=500
		)
		
		reply = response.choices[0].message.content
		
		# Check if the message is about creating or modifying a workout
		workout_keywords = ["workout maken", "maak workout", "create workout", "make workout", "push trainen", "pull trainen", "leg trainen", "geen", "niet", "vervang", "verander", "change", "replace", "remove", "add", "voeg toe", "doe", "wil", "train", "workout", "oefeningen", "exercises"]
		# More specific: if user explicitly asks for a workout
		explicit_workout_request = any(phrase in message.lower() for phrase in ["make a workout", "maak een workout", "create a workout", "workout voor", "workout for", "train vandaag", "train today"])
		is_workout_request = explicit_workout_request or any(keyword in message.lower() for keyword in workout_keywords)
		
		if is_workout_request:
			# Try to generate or modify workout
			try:
				workout_data = generate_workout_from_chat(message, reply, workout_context)
				if workout_data and workout_data.get("exercises"):
					print(f"[INFO] Workout generated successfully: {len(workout_data.get('exercises', []))} exercises")
					return jsonify({
						"reply": reply,
						"workout": workout_data
					})
				else:
					print(f"[WARNING] Workout generation returned no exercises")
			except Exception as e:
				print(f"[ERROR] Workout generation error: {e}")
				import traceback
				traceback.print_exc()
		
		return jsonify({"reply": reply})
	except Exception as e:
		print(f"[ERROR] Chat API error: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": f"Failed to get response: {str(e)}"}), 500


def generate_workout_from_chat(message: str, ai_reply: str, workout_context: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
	"""Generate a workout structure from chat message and AI reply."""
	if not GROQ_AVAILABLE:
		return None
	
	# Load API key from environment variable only
	GROQ_API_KEY = os.getenv("GROQ_API_KEY")
	if not GROQ_API_KEY:
		return None
	
	# Build exercise list with keys
	exercise_list = []
	exercise_map = {}
	for key, meta in MACHINE_METADATA.items():
		display_name = meta.get("display", key.replace("_", " ").title())
		muscles = meta.get("muscles", [])
		muscle_str = ", ".join([m for m in muscles if m and m != "-"])
		exercise_list.append(f"{display_name} (key: {key})" + (f" - targets: {muscle_str}" if muscle_str else ""))
		exercise_map[display_name.lower()] = key
		exercise_map[key] = key
	
	exercises_context = "\n".join(exercise_list[:150])
	
	context_info = ""
	if workout_context:
		current_exercises = ", ".join([ex.get("display", ex.get("key", "")) for ex in workout_context.get("exercises", [])])
		context_info = f"\n\nCurrent workout: {workout_context.get('name', 'Workout')}\nCurrent exercises: {current_exercises}\nThe user wants to MODIFY this workout."
	
	prompt = f"""Based on this user request: "{message}"

And this AI response: "{ai_reply}"
{context_info}

Generate a workout plan. Return ONLY a JSON object with this exact structure:
{{
  "name": "workout name",
  "exercises": [
    {{"key": "exercise_key", "display": "Exercise Name"}},
    ...
  ]
}}

Use exercise keys from this list (use the key exactly as shown):
{exercises_context}

CRITICAL RULES:
- Return ONLY valid JSON, no other text, no markdown, no code blocks
- Use exact exercise keys from the list (the part after "key: ")
- Give ONLY what the user asks for - if they ask for "just pushups", give ONLY pushups
- If user specifies exact exercises, use ONLY those exercises
- If user asks for a workout type (push/pull/legs) without specifics, then suggest 4-6 exercises
- If user says "no X" or "replace X with Y", adjust accordingly
- Do NOT add extra exercises if user asks for specific ones
- Match the muscle groups mentioned (push = chest/shoulders/triceps, pull = back/biceps, legs = quads/hamstrings/glutes)

Examples:
- User: "just pushups" → {{"name": "Pushup Workout", "exercises": [{{"key": "push_up", "display": "Push-Up"}}]}}
- User: "push workout" → {{"name": "Push Workout", "exercises": [{{"key": "bench_press", "display": "Bench Press"}}, {{"key": "incline_bench_press", "display": "Incline Bench Press"}}, {{"key": "shoulder_press_machine", "display": "Shoulder Press Machine"}}, {{"key": "tricep_pushdown", "display": "Tricep Pushdown"}}]}}
- User: "bench press and tricep pushdown" → {{"name": "Workout", "exercises": [{{"key": "bench_press", "display": "Bench Press"}}, {{"key": "tricep_pushdown", "display": "Tricep Pushdown"}}]}}
"""
	
	try:
		# Groq SDK handles Authorization header internally
		# API key is loaded from environment variable only
		client = Groq(api_key=GROQ_API_KEY)
		response = client.chat.completions.create(
			model="llama-3.3-70b-versatile",
			messages=[
				{"role": "system", "content": "You are a fitness expert. Return ONLY valid JSON, no explanations. Start your response with { and end with }."},
				{"role": "user", "content": prompt}
			],
			temperature=0.3,
			max_tokens=800
		)
		
		content = response.choices[0].message.content.strip()
		# Try to extract JSON from response (might have markdown code blocks)
		if "```" in content:
			# Extract JSON from code block
			start = content.find("```")
			if start != -1:
				start = content.find("\n", start) + 1
				end = content.find("```", start)
				if end != -1:
					content = content[start:end].strip()
		# Find first { and last }
		start_brace = content.find("{")
		end_brace = content.rfind("}")
		if start_brace != -1 and end_brace != -1 and end_brace > start_brace:
			content = content[start_brace:end_brace + 1]
		
		workout_json = json.loads(content)
		
		# Validate and clean up the workout
		exercises = []
		exercise_list = workout_json.get("exercises", [])
		print(f"[DEBUG] Found {len(exercise_list)} exercises in workout JSON")
		
		for ex in exercise_list:
			key = ex.get("key", "").lower().strip()
			display = ex.get("display", "")
			
			print(f"[DEBUG] Processing exercise: key='{key}', display='{display}'")
			
			# Find matching exercise
			if key in MACHINE_METADATA:
				exercises.append({
					"key": key,
					"display": MACHINE_METADATA[key].get("display", display),
					"muscles": MACHINE_METADATA[key].get("muscles", []),
					"sets": [{"weight": "", "reps": ""}, {"weight": "", "reps": ""}, {"weight": "", "reps": ""}]
				})
				print(f"[DEBUG] Found exercise by key: {key}")
			else:
				# Try to find by display name
				found = False
				for meta_key, meta in MACHINE_METADATA.items():
					if meta.get("display", "").lower() == display.lower() or meta_key.lower() == key:
						exercises.append({
							"key": meta_key,
							"display": meta.get("display", display),
							"muscles": meta.get("muscles", []),
							"sets": [{"weight": "", "reps": ""}, {"weight": "", "reps": ""}, {"weight": "", "reps": ""}]
						})
						print(f"[DEBUG] Found exercise by display name: {display} -> {meta_key}")
						found = True
						break
				if not found:
					print(f"[WARNING] Could not find exercise: key='{key}', display='{display}'")
		
		print(f"[DEBUG] Final exercises count: {len(exercises)}")
		if not exercises:
			print("[ERROR] No valid exercises found in workout")
			return None
		
		return {
			"name": workout_json.get("name", "AI Workout"),
			"exercises": exercises
		}
	except json.JSONDecodeError as e:
		print(f"[ERROR] Failed to parse workout JSON: {e}")
		print(f"[DEBUG] Content received: {content[:500] if 'content' in locals() else 'N/A'}")
		return None
	except Exception as e:
		print(f"[ERROR] Workout generation failed: {e}")
		import traceback
		traceback.print_exc()
		return None


if __name__ == "__main__":
	# Initialize database on startup
	init_db()
	# Use PORT environment variable for Render, default to 5000 for local development
	port = int(os.environ.get("PORT", 5000))
	app.run(host="0.0.0.0", port=port, debug=False)
