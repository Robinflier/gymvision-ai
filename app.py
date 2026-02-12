from __future__ import annotations

import os
import json
import sqlite3
import time
import urllib.parse
import urllib.request
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional
from collections import defaultdict
from collections import OrderedDict
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
from flask_cors import CORS

try:
	from supabase import create_client, Client
	SUPABASE_AVAILABLE = True
except Exception:
	SUPABASE_AVAILABLE = False
	Client = None

# YOLO models no longer used - removed to save memory
YOLO = None

try:
	from groq import Groq  # type: ignore
	GROQ_AVAILABLE = True
except Exception:
	GROQ_AVAILABLE = False

try:
	from openai import OpenAI  # type: ignore
	OPENAI_AVAILABLE = True
except Exception:
	OPENAI_AVAILABLE = False

APP_ROOT = Path(__file__).resolve().parent
# Model paths removed - models no longer used to save memory
DATABASE_PATH = APP_ROOT / "gymvision.db"
IMAGES_PATHS = [APP_ROOT / "images"]
PARENT_IMAGES_PATH = APP_ROOT.parent / "images"
if PARENT_IMAGES_PATH.exists():
	IMAGES_PATHS.append(PARENT_IMAGES_PATH)
# Also check in www/static/images/ for Capacitor builds
WWW_IMAGES_PATH = APP_ROOT / "www" / "static" / "images"
if WWW_IMAGES_PATH.exists():
	IMAGES_PATHS.append(WWW_IMAGES_PATH)

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

# ========== ML MODELS ==========
# Models disabled to save memory - no longer using YOLO models
# All model loading code removed

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

# Flask-Mail removed - using Supabase for email verification

# Flask-Login setup
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"
login_manager.login_message = "Please log in to access the app."

# Allowed muscle names (lowercase)
ALLOWED_MUSCLES = {
	"back", "chest", "shoulders", "biceps", "triceps", "quads", "hamstrings", "calves", "abs", "glutes", "forearms", "cardio",
}

PROBLEM_REPORT_TYPES = {
	"broken": "Broken",
	"damaged": "Damaged",
	"not_placed_convenient": "Not placed convenient",
	"very_busy": "Very busy",
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


def normalize_problem_report_type(value: Optional[str]) -> Optional[str]:
	key = (value or "").strip().lower().replace(" ", "_")
	return PROBLEM_REPORT_TYPES.get(key)

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
	"lying_chest_press_machine": {"display": "Lying Chest Press Machine", "muscles": normalize_muscles(["Chest", "Triceps", "Shoulders"]), "video": "https://www.youtube.com/embed/2ONfXehJEIM", "image": "/images/lyingchestpressmachine.jpg"},
"push_up": {"display": "Push-Up", "muscles": normalize_muscles(["Chest", "Triceps", "Shoulders"]), "video": "https://www.youtube.com/embed/WDIpL0pjun0", "image": "https://strengthlevel.com/images/illustrations/push-up.png"},
"incline_dumbbell_press": {"display": "Incline Dumbbell Press", "muscles": normalize_muscles(["Chest", "Shoulders", "Triceps"]), "video": "https://www.youtube.com/embed/jMQA3XtJSgo", "image": "https://strengthlevel.com/images/illustrations/incline-dumbbell-press.png"},
	"decline_dumbbell_press": {"display": "Decline Dumbbell Press", "muscles": normalize_muscles(["Chest", "Triceps", "Shoulders"]), "video": "https://www.youtube.com/embed/2B6WxyLaIrE", "image": "https://strengthlevel.com/images/illustrations/decline-dumbbell-press.png"},
	"cable_fly": {"display": "Cable Fly", "muscles": normalize_muscles(["Chest", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/4mfLHnFL0Uw", "image": "/images/cablefly.jpg"},
	"incline_cable_fly": {"display": "Incline Cable Fly", "muscles": normalize_muscles(["Chest", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/GwpA8-VcEk8", "image": "/images/inclinecablefly.jpg"},

	# Back
	"pull_up": {"display": "Pull-Up", "muscles": normalize_muscles(["Back", "Biceps", "Shoulders"]), "video": "https://www.youtube.com/embed/eGo4IYlbE5g", "image": "https://strengthlevel.com/images/illustrations/pull-up.png"},
	"weighted_pull_up": {"display": "Weighted Pull-Up", "muscles": normalize_muscles(["Back", "Biceps", "Shoulders"]), "video": "https://www.youtube.com/embed/IfQ7UTu35SU", "image": "/images/weightedpullup.jpg"},
	"chin_up": {"display": "Chin-Up", "muscles": normalize_muscles(["Biceps", "Back", "Shoulders"]), "video": "https://www.youtube.com/embed/8mryJ3w2S78", "image": "https://strengthlevel.com/images/illustrations/chin-up.png"},
	"lat_pulldown": {"display": "Lat Pulldown", "muscles": normalize_muscles(["Back", "Biceps", "Shoulders"]), "video": "https://www.youtube.com/embed/JGeRYIZdojU", "image": "https://strengthlevel.com/images/illustrations/lat-pulldown.png"},
"wide_grip_pulldown": {"display": "Wide Grip Pulldown", "muscles": normalize_muscles(["Back", "Biceps", "Shoulders"]), "video": "https://www.youtube.com/embed/YCKPD4BSD2E", "image": "https://strengthlevel.com/images/illustrations/wide-grip-pulldown.png"},
	"close_grip_pulldown": {"display": "Close Grip Pulldown", "muscles": normalize_muscles(["Back", "Biceps", "Shoulders"]), "video": "https://www.youtube.com/embed/IjoFCmLX7z0", "image": "https://strengthlevel.com/images/illustrations/close-grip-pulldown.png"},
	"reverse_grip_pulldown": {"display": "Reverse Grip Pulldown", "muscles": normalize_muscles(["Back", "Biceps", "Shoulders"]), "video": "https://www.youtube.com/embed/scy-QV06nuA", "image": "/images/reversegrippulldown.jpg"},
	"straight_arm_pulldown": {"display": "Straight Arm Pulldown", "muscles": normalize_muscles(["Back", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/G9uNaXGTJ4w", "image": "https://strengthlevel.com/images/illustrations/straight-arm-pulldown.png"},
"seated_row": {"display": "Seated Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/UCXxvVItLoM", "image": "https://strengthlevel.com/images/illustrations/seated-row.png"},
	"seated_machine_row": {"display": "Seated Machine Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/TeFo51Q_Nsc", "image": "/images/seatedmachinerow.jpg"},
	"t_bar_row": {"display": "T-Bar Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/yPis7nlbqdY", "image": "https://strengthlevel.com/images/illustrations/t-bar-row.png"},
	"chest_supported_t_bar_row": {"display": "Chest Supported T-Bar Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/0UBRfiO4zDs", "image": "/images/chestsupportedtbarrow.jpg"},
	"bent_over_row": {"display": "Bent Over Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/6FZHJGzMFEc", "image": "https://strengthlevel.com/images/illustrations/bent-over-row.png"},
	"smith_machine_bent_over_row": {"display": "Smith Machine Bent Over Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/3QcJggd_L24", "image": "/images/smithmachinebentoverrow.jpg"},
	"one_arm_dumbbell_row": {"display": "One Arm Dumbbell Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/DMo3HJoawrU", "image": "https://strengthlevel.com/images/illustrations/one-arm-dumbbell-row.png"},
	"chest_supported_row": {"display": "Chest Supported Row", "muscles": normalize_muscles(["Back", "Biceps", "-"]), "video": "https://www.youtube.com/embed/tZUYS7X50so", "image": "https://strengthlevel.com/images/illustrations/chest-supported-row.png"},
	"lat_pullover_machine": {"display": "Lat Pullover Machine", "muscles": normalize_muscles(["Back", "Chest", "-"]), "video": "https://www.youtube.com/embed/oxpAl14EYyc", "image": "https://strengthlevel.com/images/illustrations/lat-pullover.png"},
	"deadlift": {"display": "Deadlift", "muscles": normalize_muscles(["Back", "Glutes", "Hamstrings"]), "video": "https://www.youtube.com/embed/AweC3UaM14o", "image": "https://strengthlevel.com/images/illustrations/deadlift.png"},
	"romanian_deadlift": {"display": "Romanian Deadlift", "muscles": normalize_muscles(["Hamstrings", "Glutes", "Back"]), "video": "https://www.youtube.com/embed/bT5OOBgY4bc", "image": "https://strengthlevel.com/images/illustrations/romanian-deadlift.png"},
	"sumo_deadlift": {"display": "Sumo Deadlift", "muscles": normalize_muscles(["Glutes", "Hamstrings", "Back"]), "video": "https://www.youtube.com/embed/pfSMst14EFk", "image": "https://strengthlevel.com/images/illustrations/sumo-deadlift.png"},
	"back_extension": {"display": "Back Extension", "muscles": normalize_muscles(["Back", "Glutes", "-"]), "video": "https://www.youtube.com/embed/z1JDvhlY1A0", "image": "/images/backextension.jpg"},

	# Shoulders
	"shoulder_press_machine": {"display": "Shoulder Press Machine", "muscles": normalize_muscles(["Shoulders", "Triceps", "-"]), "video": "https://www.youtube.com/embed/WvLMauqrnK8", "image": "https://strengthlevel.com/images/illustrations/shoulder-press.png"},
	"overhead_press": {"display": "Overhead Press", "muscles": normalize_muscles(["Shoulders", "Triceps", "-"]), "video": "https://www.youtube.com/embed/G2qpTG1Eh40", "image": "https://strengthlevel.com/images/illustrations/overhead-press.png"},
	"arnold_press": {"display": "Arnold Press", "muscles": normalize_muscles(["Shoulders", "Triceps", "-"]), "video": "https://www.youtube.com/embed/jeJttN2EWCo", "image": "https://strengthlevel.com/images/illustrations/arnold-press.png"},
	"dumbbell_shoulder_press": {"display": "Dumbbell Shoulder Press", "muscles": normalize_muscles(["Shoulders", "Triceps", "-"]), "video": "https://www.youtube.com/embed/HzIiNhHhhtA", "image": "https://strengthlevel.com/images/illustrations/dumbbell-shoulder-press.png"},
	"front_raise": {"display": "Front Raise", "muscles": normalize_muscles(["Shoulders", "-", "-"]), "video": "https://www.youtube.com/embed/hRJ6tR5-if0", "image": "https://strengthlevel.com/images/illustrations/front-raise.png"},
	"lateral_raise": {"display": "Lateral Raise", "muscles": normalize_muscles(["Shoulders", "-", "-"]), "video": "https://www.youtube.com/embed/OuG1smZTsQQ", "image": "https://strengthlevel.com/images/illustrations/lateral-raise.png"},
	"lateral_raise_machine": {"display": "Lateral Raise Machine", "muscles": normalize_muscles(["Shoulders", "-", "-"]), "video": "https://www.youtube.com/embed/xMEs3zEzS8s", "image": "/images/machinelateralraise.jpg"},
	"rear_delt_fly": {"display": "Rear Delt Fly", "muscles": normalize_muscles(["Shoulders", "Back", "-"]), "video": "https://www.youtube.com/embed/nlkF7_2O_Lw", "image": "https://strengthlevel.com/images/illustrations/rear-delt-fly.png"},
	"rear_delt_cable_fly": {"display": "Rear Delt Cable Fly", "muscles": normalize_muscles(["Shoulders", "Back", "-"]), "video": "https://www.youtube.com/embed/MbiyWYDItR4", "image": "/images/reardeltcablefly.jpg"},
	"reverse_pec_deck": {"display": "Reverse Pec Deck", "muscles": normalize_muscles(["Shoulders", "Back", "-"]), "video": "https://www.youtube.com/embed/jw7oFFBnwCU", "image": "https://strengthlevel.com/images/illustrations/reverse-pec-deck.png"},
	"upright_row": {"display": "Upright Row", "muscles": normalize_muscles(["Shoulders", "Triceps", "-"]), "video": "https://www.youtube.com/embed/um3VVzqunPU", "image": "https://strengthlevel.com/images/illustrations/upright-row.png"},
	"cable_face_pull": {"display": "Cable Face Pull", "muscles": normalize_muscles(["Shoulders", "Back", "-"]), "video": "https://www.youtube.com/embed/0Po47vvj9g4", "image": "https://strengthlevel.com/images/illustrations/face-pull.png"},
	"shrugs": {"display": "Shrugs", "muscles": normalize_muscles(["Shoulders", "-", "-"]), "video": "https://www.youtube.com/embed/_t3lrPI6Ns4", "image": "/images/shrugs.jpg"},
	"cable_lateral_raise": {"display": "Cable Lateral Raise", "muscles": normalize_muscles(["Shoulders", "-", "-"]), "video": "https://www.youtube.com/embed/lq7eLC30b9w", "image": "/images/cablelateralraise.jpg"},

	# Biceps
	"barbell_curl": {"display": "Barbell Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/N5x5M1x1Gd0", "image": "https://strengthlevel.com/images/illustrations/barbell-curl.png"},
	"dumbbell_curl": {"display": "Dumbbell Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/6DeLZ6cbgWQ", "image": "https://strengthlevel.com/images/illustrations/dumbbell-curl.png"},
	"alternating_dumbbell_curl": {"display": "Alternating Dumbbell Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/o2Tma5Cek48", "image": "https://strengthlevel.com/images/illustrations/alternating-dumbbell-curl.png"},
	"hammer_curl": {"display": "Hammer Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/fM0TQLoesLs", "image": "https://strengthlevel.com/images/illustrations/hammer-curl.png"},
	"preacher_curl": {"display": "Preacher Curl Machine", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/Ja6ZlIDONac", "image": "/images/preachercurl.jpg"},
	"single_arm_preacher_curl": {"display": "Single Arm Preacher Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/fuK3nFvwgXk", "image": "/images/singlearmpreachercurl.jpg"},
	"cable_curl": {"display": "Cable Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/F3Y03RnVY8Y", "image": "https://strengthlevel.com/images/illustrations/cable-curl.png"},
	"cable_hammer_curl": {"display": "Cable Hammer Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/vsarApmqJmo", "image": "/images/cablehammercurl.jpg"},
	"bayesian_curl": {"display": "Bayesian Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/CUM5GGvc6DM", "image": "/images/bayesiancurl.jpg"},
	"incline_dumbbell_curl": {"display": "Incline Dumbbell Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/aG7CXiKxepw", "image": "https://strengthlevel.com/images/illustrations/incline-dumbbell-curl.png"},
	"ez_bar_curl": {"display": "EZ Bar Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/-gSM-kqNlUw", "image": "https://strengthlevel.com/images/illustrations/ez-bar-curl.png"},
	"reverse_curl": {"display": "Reverse Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/hUA-fIpM7nA", "image": "https://strengthlevel.com/images/illustrations/reverse-curl.png"},
	"spider_curl": {"display": "Spider Curl", "muscles": normalize_muscles(["Biceps", "-", "-"]), "video": "https://www.youtube.com/embed/ke2shAeQ0O8", "image": "https://strengthlevel.com/images/illustrations/spider-curl.png"},

	# Forearms
	"forearm_curl": {"display": "Forearm Curl", "muscles": normalize_muscles(["Forearms", "-", "-"]), "video": "https://www.youtube.com/embed/3VLTzIrnb5g", "image": "/images/forearmcurl.jpg"},
	"reverse_forearm_curl": {"display": "Reverse Forearm Curl", "muscles": normalize_muscles(["Forearms", "-", "-"]), "video": "https://www.youtube.com/embed/osYPwlBiCRM", "image": "/images/reverseforearmcurl.jpg"},

	# Triceps
	"tricep_pushdown": {"display": "Tricep Pushdown (Bar)", "muscles": normalize_muscles(["Triceps", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/6Fzep104f0s", "image": "/images/triceppushdown.jpg"},
	"tricep_pushdown_rope": {"display": "Tricep Pushdown (Rope)", "muscles": normalize_muscles(["Triceps", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/-xa-6cQaZKY", "image": "/images/triceppushdownrope.jpg"},
	"overhead_tricep_extension": {"display": "Overhead Tricep Extension", "muscles": normalize_muscles(["Triceps", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/a9oPnZReIRE", "image": "https://strengthlevel.com/images/illustrations/overhead-tricep-extension.png"},
	"cable_overhead_extension": {"display": "Cable Overhead Extension", "muscles": normalize_muscles(["Triceps", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/ns-RGsbzqok", "image": "https://strengthlevel.com/images/illustrations/cable-overhead-extension.png"},
	"close_grip_bench_press": {"display": "Close Grip Bench Press", "muscles": normalize_muscles(["Triceps", "Chest", "-"]), "video": "https://www.youtube.com/embed/FiQUzPtS90E", "image": "https://strengthlevel.com/images/illustrations/close-grip-bench-press.png"},
	"dips": {"display": "Dips", "muscles": normalize_muscles(["Triceps", "Chest", "Shoulders"]), "video": "https://www.youtube.com/embed/oA8Sxv2WeOs", "image": "https://strengthlevel.com/images/illustrations/dip.png"},
	"weighted_dip": {"display": "Weighted Dip", "muscles": normalize_muscles(["Triceps", "Chest", "Shoulders"]), "video": "https://www.youtube.com/embed/OH5iSZRzkso", "image": "/images/weighteddip.jpg"},
	"seated_dip_machine": {"display": "Seated Dip Machine", "muscles": normalize_muscles(["Triceps", "Chest", "-"]), "video": "https://www.youtube.com/embed/Zg0tT27iYuY", "image": "https://strengthlevel.com/images/illustrations/seated-dip.png"},
	"skull_crusher": {"display": "Skull Crusher", "muscles": normalize_muscles(["Triceps", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/l3rHYPtMUo8", "image": "https://strengthlevel.com/images/illustrations/skull-crusher.png"},
	"rope_pushdown": {"display": "Rope Pushdown", "muscles": normalize_muscles(["Triceps", "Shoulders", "-"]), "video": "https://www.youtube.com/embed/-xa-6cQaZKY", "image": "/images/ropepushdown.jpg"},
	"single_arm_cable_pushdown": {"display": "Single Arm Cable Pushdown", "muscles": normalize_muscles(["Triceps", "-", "-"]), "video": "https://www.youtube.com/embed/Cp_bShvMY4c", "image": "https://strengthlevel.com/images/illustrations/single-arm-cable-pushdown.png"},
	"diamond_push_up": {"display": "Diamond Push-Up", "muscles": normalize_muscles(["Triceps", "Chest", "Shoulders"]), "video": "https://www.youtube.com/embed/K8bKxVcwjrk", "image": "https://strengthlevel.com/images/illustrations/diamond-push-up.png"},

	# Quads
	"squat": {"display": "Squat", "muscles": normalize_muscles(["Quads", "Glutes", "Hamstrings"]), "video": "https://www.youtube.com/embed/rrJIyZGlK8c", "image": "https://strengthlevel.com/images/illustrations/squat.png"},
	"pendulum_squat": {"display": "Pendulum Squat", "muscles": normalize_muscles(["Quads", "Glutes", "Hamstrings"]), "video": "https://www.youtube.com/embed/lYoYwBYU3tQ", "image": "/images/pendulumsquat.jpg"},
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
	"smith_machine_step_up": {"display": "Smith Machine Step Up", "muscles": normalize_muscles(["Quads", "Glutes", "-"]), "video": "https://www.youtube.com/embed/qYFlvmFu2wE", "image": "/images/smithmachinestepup.jpg"},
	"cable_step_up": {"display": "Cable Step Up", "muscles": normalize_muscles(["Quads", "Glutes", "-"]), "video": "https://www.youtube.com/embed/IHIvl5uQzSs", "image": "/images/cablestepup.jpg"},
	"goblet_squat": {"display": "Goblet Squat", "muscles": normalize_muscles(["Quads", "Glutes", "Hamstrings"]), "video": "https://www.youtube.com/embed/pEGfGwp6IEA", "image": "https://strengthlevel.com/images/illustrations/goblet-squat.png"},
	"walking_lunges": {"display": "Walking Lunges", "muscles": normalize_muscles(["Quads", "Hamstrings", "Glutes"]), "video": "https://www.youtube.com/embed/eFWCn5iEbTU", "image": "/images/walkinglunges.jpg"},

	# Hamstrings
	"lying_leg_curl": {"display": "Lying Leg Curl", "muscles": normalize_muscles(["Hamstrings", "Glutes", "-"]), "video": "https://www.youtube.com/embed/SbSNUXPRkc8", "image": "https://strengthlevel.com/images/illustrations/lying-leg-curl.png"},
	"seated_leg_curl_machine": {"display": "Seated Leg Curl Machine", "muscles": normalize_muscles(["Hamstrings", "Glutes", "-"]), "video": "https://www.youtube.com/embed/Orxowest56U", "image": "https://strengthlevel.com/images/illustrations/seated-leg-curl.png"},
	"stiff_leg_deadlift": {"display": "Stiff Leg Deadlift", "muscles": normalize_muscles(["Hamstrings", "Glutes", "Back"]), "video": "https://www.youtube.com/embed/CN_7cz3P-1U", "image": "/images/stifflegdeadlift.jpg"},
	"good_morning": {"display": "Good Morning", "muscles": normalize_muscles(["Hamstrings", "Glutes", "Back"]), "video": "https://www.youtube.com/embed/dEJ0FTm-CEk", "image": "https://strengthlevel.com/images/illustrations/good-morning.png"},

	# Glutes
	"hip_thrust": {"display": "Hip Thrust", "muscles": normalize_muscles(["Glutes", "Hamstrings", "-"]), "video": "https://www.youtube.com/embed/pUdIL5x0fWg", "image": "https://strengthlevel.com/images/illustrations/hip-thrust.png"},
	"hip_thrust_machine": {"display": "Hip Thrust Machine", "muscles": normalize_muscles(["Glutes", "Hamstrings", "-"]), "video": "https://www.youtube.com/embed/pUdIL5x0fWg", "image": "/images/hipthrustmachine.jpg"},
	"smith_machine_hip_thrust": {"display": "Smith Machine Hip Thrust", "muscles": normalize_muscles(["Glutes", "Hamstrings", "-"]), "video": "https://www.youtube.com/embed/CXGJ36cQyWo", "image": "/images/smithmachinehipthrust.jpg"},
	"smith_machine_donkey_kick": {"display": "Smith Machine Donkey Kick", "muscles": normalize_muscles(["Glutes", "-", "-"]), "video": "https://www.youtube.com/embed/TptGEG-CcQM", "image": "/images/smithmachinedonkeykick.jpg"},
	"cable_kickback": {"display": "Cable Kickback", "muscles": normalize_muscles(["Glutes", "Hamstrings", "-"]), "video": "https://www.youtube.com/embed/zjVK1sOqFdw", "image": "https://strengthlevel.com/images/illustrations/cable-kickback.png"},
	"abductor_machine": {"display": "Abductor Machine", "muscles": normalize_muscles(["Glutes", "-", "-"]), "video": "https://www.youtube.com/embed/G_8LItOiZ0Q", "image": "https://strengthlevel.com/images/illustrations/hip-abduction.png"},
	"adductor_machine": {"display": "Adductor Machine", "muscles": normalize_muscles(["Glutes", "-", "-"]), "video": "https://www.youtube.com/embed/CjAVezAggkI", "image": "https://strengthlevel.com/images/illustrations/hip-adduction.png"},

	# Calves
	"standing_calf_raise": {"display": "Standing Calf Raise", "muscles": normalize_muscles(["Calves", "-", "-"]), "video": "https://www.youtube.com/embed/g_E7_q1z2bo", "image": "https://strengthlevel.com/images/illustrations/standing-calf-raise.png"},
	"seated_calf_raise": {"display": "Seated Calf Raise", "muscles": normalize_muscles(["Calves", "-", "-"]), "video": "https://www.youtube.com/embed/2Q-HQ3mnePg", "image": "https://strengthlevel.com/images/illustrations/seated-calf-raise.png"},
	"leg_press_calf_raise": {"display": "Leg Press Calf Raise", "muscles": normalize_muscles(["Calves", "-", "-"]), "video": "https://www.youtube.com/embed/KxEYX_cuesM", "image": "https://strengthlevel.com/images/illustrations/leg-press-calf-raise.png"},
	"calf_press_machine": {"display": "Calf Press Machine", "muscles": normalize_muscles(["Calves", "-", "-"]), "video": "https://www.youtube.com/embed/Hu8i9d_IgpM", "image": "/images/calfpressmachine.jpg"},
	"donkey_calf_raise": {"display": "Donkey Calf Raise", "muscles": normalize_muscles(["Calves", "-", "-"]), "video": "https://www.youtube.com/embed/r30EoMPSNns", "image": "https://strengthlevel.com/images/illustrations/donkey-calf-raise.png"},

	# Abs
	"crunch": {"display": "Crunch", "muscles": normalize_muscles(["Abs", "-", "-"]), "video": "https://www.youtube.com/embed/NnVhqMQRvmM", "image": "https://strengthlevel.com/images/illustrations/crunch.png"},
	"cable_crunch": {"display": "Cable Crunch", "muscles": normalize_muscles(["Abs", "-", "-"]), "video": "https://www.youtube.com/embed/b9FJ4hIK3pI", "image": "https://strengthlevel.com/images/illustrations/cable-crunch.png"},
	"decline_sit_up": {"display": "Decline Sit-Up", "muscles": normalize_muscles(["Abs", "-", "-"]), "video": "https://www.youtube.com/embed/DAnTf16NcT0", "image": "https://strengthlevel.com/images/illustrations/decline-sit-up.png"},
	"hanging_leg_raise": {"display": "Hanging Leg Raise", "muscles": normalize_muscles(["Abs", "-", "-"]), "video": "https://www.youtube.com/embed/7FwGZ8qY5OU", "image": "https://strengthlevel.com/images/illustrations/hanging-leg-raise.png"},
	"knee_raise": {"display": "Knee Raise", "muscles": normalize_muscles(["Abs", "-", "-"]), "video": "https://www.youtube.com/embed/RD_A-Z15ER4", "image": "https://strengthlevel.com/images/illustrations/knee-raise.png"},
	"russian_twist": {"display": "Russian Twist", "muscles": normalize_muscles(["Abs", "Back", "-"]), "video": "https://www.youtube.com/embed/99T1EfpMwPA", "image": "https://strengthlevel.com/images/illustrations/russian-twist.png"},
	"rotary_torso_machine": {"display": "Rotary Torso Machine", "muscles": normalize_muscles(["Abs", "Back", "-"]), "video": "https://www.youtube.com/embed/h5naeryzGjE", "image": "https://strengthlevel.com/images/illustrations/rotary-torso.png"},
	"ab_crunch_machine": {"display": "Ab Crunch Machine", "muscles": normalize_muscles(["Abs", "-", "-"]), "video": "https://www.youtube.com/embed/fuPFq2EYswE", "image": "/images/abcrunchmachine.jpg"},
	
	# Cardio
	"running": {"display": "Running", "muscles": normalize_muscles(["Cardio", "-", "-"]), "video": "https://www.youtube.com/embed/_kGESn8ArrU", "image": "/images/running.jpg"},
	"walking": {"display": "Walking", "muscles": normalize_muscles(["Cardio", "-", "-"]), "video": "https://www.youtube.com/embed/786B8jCL4lw", "image": "/images/walking.jpg"},
	"stairmaster": {"display": "Stairmaster", "muscles": normalize_muscles(["Cardio", "-", "-"]), "video": "https://www.youtube.com/embed/V2EQYdMw4Do", "image": "/images/stairmaster.jpg"},
	"rowing_machine": {"display": "Rowing Machine", "muscles": normalize_muscles(["Cardio", "-", "-"]), "video": "https://www.youtube.com/embed/6_eLpWiNijE", "image": "/images/rowingmachine.jpg"},
	"hometrainer": {"display": "Hometrainer", "muscles": normalize_muscles(["Cardio", "-", "-"]), "video": "https://www.youtube.com/embed/UbwHzt9U9vM", "image": "/images/hometrainer.jpg"},
	"elliptical_machine": {"display": "Elliptical Machine", "muscles": normalize_muscles(["Cardio", "-", "-"]), "video": "https://www.youtube.com/embed/j38LNpTLwzY", "image": "/images/ellipticalmachine.jpg"},
	"skierg": {"display": "Skierg", "muscles": normalize_muscles(["Cardio", "-", "-"]), "video": "https://www.youtube.com/embed/44YUR_dln0k", "image": "/images/skierg.jpg"},
	
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
	"lying_chest_press_machine": "lying_chest_press_machine",
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
	"seated_machine_row": "seated_machine_row",
	"t_bar_row": "t_bar_row",
	"bent_over_row": "bent_over_row",
	"one_arm_dumbbell_row": "one_arm_dumbbell_row",
	"chest_supported_row": "chest_supported_row",
	"lat_pullover_machine": "lat_pullover_machine",
	"deadlift": "deadlift",
	"romanian_deadlift": "romanian_deadlift",
	"sumo_deadlift": "sumo_deadlift",
	"stiff_leg_deadlift": "stiff_leg_deadlift",
	"stiff_legged_deadlift": "stiff_leg_deadlift",

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
	"rear_delt_cable_fly": "rear_delt_cable_fly",
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
	"single_arm_preacher_curl": "single_arm_preacher_curl",
	"cable_curl": "cable_curl",
	"incline_dumbbell_curl": "incline_dumbbell_curl",
	"ez_bar_curl": "ez_bar_curl",
	"reverse_curl": "reverse_curl",
	"spider_curl": "spider_curl",

	# Triceps
	"tricep_pushdown": "tricep_pushdown",
	"tricep_pushdown_bar": "tricep_pushdown",
	"tricep_pushdown_rope": "tricep_pushdown_rope",
	"overhead_tricep_extension": "overhead_tricep_extension",
	"cable_overhead_extension": "cable_overhead_extension",
	"close_grip_bench_press": "close_grip_bench_press",
	"dips": "dips",
	"dip": "dips",
	"seated_dip_machine": "seated_dip_machine",
	"skull_crusher": "skull_crusher",
	"rope_pushdown": "tricep_pushdown_rope",
	"single_arm_cable_pushdown": "single_arm_cable_pushdown",
	"diamond_push_up": "diamond_push_up",

	# Quads
	"leg_press": "leg_press",
	"leg_press_machine": "leg_press",
	"squat": "squat",
	"pendulum_squat": "pendulum_squat",
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
	"smith_machine_step_up": "smith_machine_step_up",
	"cable_step_up": "cable_step_up",
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
	"hip_thrust_machine": "hip_thrust_machine",
	"smith_machine_donkey_kick": "smith_machine_donkey_kick",
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
	
	# Forearms
	"forearm_curl": "forearm_curl",
	"reverse_forearm_curl": "reverse_forearm_curl",
	"wrist_curl": "forearm_curl",
	"reverse_wrist_curl": "reverse_forearm_curl",
	
	# Back
	"back_extension": "back_extension",
	"hyperextension": "back_extension",
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
	
	# verification_codes table removed - using Supabase for email verification
	conn.commit()
	conn.close()
	print("[INFO] Database initialized")


def get_db_connection():
	"""Get database connection."""
	conn = sqlite3.connect(str(DATABASE_PATH))
	conn.row_factory = sqlite3.Row
	return conn


# Email verification functions removed - using Supabase for email verification


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
# Memory-efficient model loading: only load models when needed, unload when not in use
# Max 2 models in memory at once to prevent memory issues on Render



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
			"SELECT id, email, username, password_hash FROM users WHERE email = ?", (email,)
		).fetchone()
		conn.close()
		
		if user and check_password_hash(user["password_hash"], password):
			# Email verification now handled by Supabase
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


@app.route("/register", methods=["GET"])
def register():
	"""Registration page - registration now handled by Supabase in frontend."""
	if current_user.is_authenticated:
		return redirect(url_for("index"))
	# Load Supabase config from environment variables (safe to expose - these are public anon keys)
	# Ensure we always pass strings, never None
	supabase_url = os.getenv("SUPABASE_URL") or ""
	supabase_anon_key = os.getenv("SUPABASE_ANON_KEY") or ""
	return render_template("register.html", SUPABASE_URL=supabase_url, SUPABASE_ANON_KEY=supabase_anon_key)


@app.route("/gym-login", methods=["GET"])
def gym_login():
	"""Gym login page."""
	return render_template("gym-login.html")


@app.route("/gym-register", methods=["GET"])
def gym_register():
	"""Gym registration page."""
	return render_template("gym-register.html")


@app.route("/reset-password", methods=["GET"])
def reset_password():
	"""Password reset page - user arrives here from email link."""
	return render_template("reset-password.html")


@app.route("/gym-dashboard", methods=["GET"])
def gym_dashboard():
	"""Gym dashboard page."""
	return render_template("gym-dashboard.html")


@app.route("/admin-dashboard", methods=["GET"])
def admin_dashboard():
	"""
	Admin dashboard page for managing gym accounts. 
	REQUIRES LOGIN - Frontend will show login form if not authenticated.
	We don't check auth server-side because Supabase sessions are client-side only.
	The frontend JavaScript will handle authentication and show/hide the login form.
	"""
	# Use simple version for now
	return render_template("admin-simple.html")

@app.route("/admin", methods=["GET"])
def admin_simple():
	"""Simple admin page - no auth, just show gym accounts"""
	return render_template("admin-simple.html")


def is_admin_user(user_id: str, user_email: str = None) -> bool:
	"""
	Check if a user is an admin.
	Admins are defined by ADMIN_USER_IDS or ADMIN_USER_EMAILS environment variable.
	ADMIN_USER_IDS: comma-separated list of user IDs
	ADMIN_USER_EMAILS: comma-separated list of email addresses
	"""
	if not SUPABASE_AVAILABLE:
		return False
	
	# Check by user ID
	admin_user_ids = os.getenv("ADMIN_USER_IDS", "").strip()
	if admin_user_ids:
		admin_list = [uid.strip() for uid in admin_user_ids.split(",") if uid.strip()]
		if user_id in admin_list:
			return True
	
	# Check by email (easier to set up)
	if user_email:
		admin_user_emails = os.getenv("ADMIN_USER_EMAILS", "").strip()
		if admin_user_emails:
			admin_email_list = [email.strip().lower() for email in admin_user_emails.split(",") if email.strip()]
			if user_email.lower() in admin_email_list:
				return True
	
	return False


@app.route("/api/admin/gym-accounts", methods=["GET", "OPTIONS"])
def list_gym_accounts():
	"""
	List all gym accounts for admin panel.
	Only accessible by admin users.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500
	
	# TEMPORARILY DISABLED AUTH FOR TESTING
	skip_auth = True  # TEMPORARY
	
	if not skip_auth:
		# Get Authorization header
		auth_header = request.headers.get("Authorization")
		if not auth_header or not auth_header.startswith("Bearer "):
			return jsonify({"error": "Authentication required"}), 401
		
		access_token = auth_header.replace("Bearer ", "").strip()
		
		try:
			SUPABASE_URL = os.getenv("SUPABASE_URL")
			SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
			SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
			
			if not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_SERVICE_ROLE_KEY:
				return jsonify({"error": "Supabase configuration missing"}), 500
			
			# Verify user
			supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
			user_response = supabase_client.auth.get_user(access_token)
			
			if not user_response.user:
				return jsonify({"error": "Invalid token"}), 401
			
			# Check if user is admin (by ID or email)
			if not is_admin_user(user_response.user.id, user_response.user.email):
				return jsonify({"error": "Admin access required"}), 403
		except Exception as e:
			return jsonify({"error": "Authentication error: " + str(e)}), 401
	
	# Get all gym accounts (always execute, even when skip_auth is True)
	# SIMPLIFIED: Just return empty list if there's any issue - don't hang
	try:
		SUPABASE_URL = os.getenv("SUPABASE_URL")
		SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
		
		if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
			print("[ADMIN] Supabase config missing - returning empty list")
			return jsonify({"accounts": []}), 200
		
		print("[ADMIN] Fetching gym accounts from Supabase...")
		
		# Use direct REST API call instead of Python client (more reliable)
		users_list = []
		
		try:
			# Direct REST API call to Supabase Admin API
			auth_url = f"{SUPABASE_URL}/auth/v1/admin/users"
			headers = {
				"apikey": SUPABASE_SERVICE_ROLE_KEY,
				"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
				"Content-Type": "application/json"
			}
			
			print(f"[ADMIN] Calling Supabase REST API: {auth_url}")
			response = requests.get(auth_url, headers=headers, timeout=10)
			
			if response.status_code == 200:
				data = response.json()
				# Supabase returns users in a 'users' array
				users_list = data.get('users', [])
				print(f"[ADMIN] REST API returned {len(users_list)} users")
			else:
				print(f"[ADMIN] REST API error: {response.status_code} - {response.text}")
				# Fallback to Python client
				print("[ADMIN] Falling back to Python client...")
				admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
				all_users = admin_client.auth.admin.list_users()
				
				# Try to extract users from response
				if hasattr(all_users, 'users'):
					users_list = all_users.users
				elif hasattr(all_users, 'data'):
					users_list = all_users.data
				elif isinstance(all_users, dict):
					users_list = all_users.get('users', []) or all_users.get('data', [])
				
		except requests.exceptions.RequestException as e:
			print(f"[ADMIN] REST API request failed: {e}")
			# Fallback to Python client
			try:
				admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
				all_users = admin_client.auth.admin.list_users()
				if hasattr(all_users, 'users'):
					users_list = all_users.users
				elif hasattr(all_users, 'data'):
					users_list = all_users.data
			except Exception as client_error:
				print(f"[ADMIN] Python client also failed: {client_error}")
				return jsonify({"accounts": []}), 200
		except Exception as e:
			print(f"[ADMIN] Error fetching users: {e}")
			import traceback
			traceback.print_exc()
			return jsonify({"accounts": []}), 200
		
		print(f"[ADMIN] Found {len(users_list)} total users")
		
		# Debug: print first few users to see their metadata
		if users_list:
			try:
				first_user = users_list[0]
				print(f"[ADMIN] First user sample: id={getattr(first_user, 'id', 'N/A')}, email={getattr(first_user, 'email', 'N/A')}")
				print(f"[ADMIN] First user metadata type: {type(getattr(first_user, 'user_metadata', None))}")
				print(f"[ADMIN] First user metadata: {getattr(first_user, 'user_metadata', None)}")
			except Exception as e:
				print(f"[ADMIN] Error inspecting first user: {e}")
		
		gym_accounts = []
		for idx, user in enumerate(users_list):
			try:
				# Get user ID and email first
				user_id = getattr(user, 'id', None) or (user.get('id') if isinstance(user, dict) else None)
				user_email = getattr(user, 'email', None) or (user.get('email') if isinstance(user, dict) else 'unknown')
				
				# IMPORTANT: list_users() may not return full metadata, so we fetch each user individually
				# This ensures we get the complete user_metadata
				user_meta = {}
				if user_id:
					try:
						user_detail = admin_client.auth.admin.get_user_by_id(user_id)
						if user_detail and hasattr(user_detail, 'user') and user_detail.user:
							# Try all possible metadata locations
							user_obj = user_detail.user
							if hasattr(user_obj, 'user_metadata') and user_obj.user_metadata:
								user_meta = user_obj.user_metadata
							elif hasattr(user_obj, 'raw_user_meta_data') and user_obj.raw_user_meta_data:
								user_meta = user_obj.raw_user_meta_data
							elif isinstance(user_obj, dict):
								user_meta = user_obj.get('user_metadata', {}) or user_obj.get('raw_user_meta_data', {})
					except Exception as fetch_error:
						# If get_user_by_id fails, try to get metadata from list_users result
						if hasattr(user, 'user_metadata') and user.user_metadata:
							user_meta = user.user_metadata
						elif hasattr(user, 'raw_user_meta_data') and user.raw_user_meta_data:
							user_meta = user.raw_user_meta_data
						elif isinstance(user, dict):
							user_meta = user.get('user_metadata', {}) or user.get('raw_user_meta_data', {})
				
				# Check if user is a gym account - handle both boolean True and string "true"
				is_gym_value = user_meta.get("is_gym_account")
				is_gym = is_gym_value == True or is_gym_value == "true" or str(is_gym_value).lower() == "true"
				
				# Log all users to see what's happening (not just first 5)
				if is_gym or idx < 10:  # Log gym accounts and first 10 regular users
					print(f"[ADMIN] User {user_email} (id={user_id}): is_gym_account={is_gym}, has_metadata={bool(user_meta)}, metadata_keys={list(user_meta.keys()) if user_meta else []}")
					if user_meta:
						print(f"[ADMIN]   Full metadata: {user_meta}")
					if not is_gym and user_meta:
						# Check if metadata has gym-related fields but is_gym_account is missing/wrong
						if user_meta.get("gym_name") or user_meta.get("contact_name"):
							print(f"[ADMIN]   WARNING: User has gym fields but is_gym_account is not set correctly!")
							print(f"[ADMIN]   is_gym_account value: {user_meta.get('is_gym_account')} (type: {type(user_meta.get('is_gym_account'))})")
				
				if is_gym:
					# Only show gym accounts that are not rejected
					# Rejected accounts should not appear in the admin list
					is_rejected = user_meta.get("is_rejected", False) == True
					if is_rejected:
						# Skip rejected accounts - they should not appear in the list
						continue
					
					created_at = getattr(user, 'created_at', None) or (user.get('created_at') if isinstance(user, dict) else None)
					
					gym_accounts.append({
						"user_id": user_id,
						"email": user_email,
						"gym_name": user_meta.get("gym_name", "Unknown"),
						"contact_name": user_meta.get("contact_name", ""),
						"contact_phone": user_meta.get("contact_phone", ""),
						"is_verified": user_meta.get("is_verified", False) == True,
						"is_premium": user_meta.get("is_premium", False) == True,
						"created_at": created_at
					})
			except Exception as e:
				user_id = getattr(user, 'id', 'unknown') if hasattr(user, 'id') else (user.get('id') if isinstance(user, dict) else 'unknown')
				print(f"[ADMIN] Error processing user {user_id}: {e}")
				import traceback
				traceback.print_exc()
				continue
		
		print(f"[ADMIN] Found {len(gym_accounts)} gym accounts")
		
		# Sort by created_at (newest first)
		gym_accounts.sort(key=lambda x: x.get("created_at", ""), reverse=True)
		
		return jsonify({"accounts": gym_accounts}), 200
		
	except Exception as e:
		print(f"[ADMIN] Error listing gym accounts: {e}")
		# Don't crash - just return empty list so dashboard loads
		return jsonify({"accounts": []}), 200


@app.route("/api/admin/gym-accounts/<user_id>/approve", methods=["POST", "OPTIONS"])
def approve_gym_account(user_id: str):
	"""
	Approve a gym account (set is_verified = true).
	Only accessible by admin users.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500
	
	# TEMPORARILY DISABLED AUTH FOR TESTING
	skip_auth = True  # TEMPORARY
	
	# Get Authorization header
	auth_header = request.headers.get("Authorization")
	
	if not skip_auth:
		if not auth_header or not auth_header.startswith("Bearer "):
			return jsonify({"error": "Authentication required"}), 401
		
		access_token = auth_header.replace("Bearer ", "").strip()
		
		try:
			SUPABASE_URL = os.getenv("SUPABASE_URL")
			SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
			SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
			
			if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
				return jsonify({"error": "Supabase configuration missing"}), 500
			
			# Verify user
			supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
			user_response = supabase_client.auth.get_user(access_token)
			
			if not user_response.user:
				return jsonify({"error": "Invalid token"}), 401
			
			# Check if user is admin (by ID or email)
			if not is_admin_user(user_response.user.id, user_response.user.email):
				return jsonify({"error": "Admin access required"}), 403
		except Exception as e:
			return jsonify({"error": "Authentication error: " + str(e)}), 401
	
	# Update gym account (always execute, even when skip_auth is True)
	try:
		SUPABASE_URL = os.getenv("SUPABASE_URL")
		SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
		
		if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
			return jsonify({"error": "Supabase configuration missing"}), 500
		
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
		user_to_update = admin_client.auth.admin.get_user_by_id(user_id)
		
		if not user_to_update.user:
			return jsonify({"error": "Gym account not found"}), 404
		
		user_meta = user_to_update.user.user_metadata or {}
		if user_meta.get("is_gym_account") != True:
			return jsonify({"error": "User is not a gym account"}), 400
		
		# Update metadata - set is_verified to True
		updated_metadata = {**user_meta, "is_verified": True}
		
		print(f"[ADMIN APPROVE] Updating user {user_id} metadata: is_verified=True")
		
		# Use direct REST API call for more reliable updates
		try:
			auth_url = f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}"
			headers = {
				"apikey": SUPABASE_SERVICE_ROLE_KEY,
				"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
				"Content-Type": "application/json"
			}
			
			update_data = {"user_metadata": updated_metadata}
			response = requests.put(auth_url, headers=headers, json=update_data, timeout=10)
			
			if response.status_code == 200:
				print(f"[ADMIN APPROVE] REST API update successful for user {user_id}")
			else:
				print(f"[ADMIN APPROVE] REST API error: {response.status_code} - {response.text}")
				# Fallback to Python client
				update_response = admin_client.auth.admin.update_user_by_id(user_id, {"user_metadata": updated_metadata})
				if hasattr(update_response, 'error') and update_response.error:
					print(f"[ADMIN APPROVE] Python client also failed: {update_response.error}")
					return jsonify({"error": f"Failed to update metadata: {update_response.error}"}), 500
		except requests.exceptions.RequestException as e:
			print(f"[ADMIN APPROVE] REST API request failed: {e}")
			# Fallback to Python client
			update_response = admin_client.auth.admin.update_user_by_id(user_id, {"user_metadata": updated_metadata})
			if hasattr(update_response, 'error') and update_response.error:
				print(f"[ADMIN APPROVE] Python client also failed: {update_response.error}")
				return jsonify({"error": f"Failed to update metadata: {update_response.error}"}), 500
		
		# Verify the update worked
		try:
			verify_user = admin_client.auth.admin.get_user_by_id(user_id)
			if verify_user and verify_user.user:
				verify_meta = verify_user.user.user_metadata or {}
				if verify_meta.get("is_verified") != True:
					print(f"[ADMIN APPROVE] WARNING: Metadata update may have failed. is_verified is still: {verify_meta.get('is_verified')}")
				else:
					print(f"[ADMIN APPROVE] Successfully approved gym account {user_id}")
		except Exception as verify_error:
			print(f"[ADMIN APPROVE] Error verifying update: {verify_error}")
		
		return jsonify({"success": True, "message": "Gym account approved"}), 200
		
	except Exception as e:
		print(f"[ADMIN] Error approving gym account: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": f"Failed to approve gym account: {str(e)}"}), 500


@app.route("/api/admin/gym-accounts/<user_id>/reject", methods=["POST", "OPTIONS"])
def reject_gym_account(user_id: str):
	"""
	Reject a gym account (set is_verified = false).
	Only accessible by admin users.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500
	
	# TEMPORARILY DISABLED AUTH FOR TESTING
	skip_auth = True  # TEMPORARY
	
	# Get Authorization header
	auth_header = request.headers.get("Authorization")
	
	if not skip_auth:
		if not auth_header or not auth_header.startswith("Bearer "):
			return jsonify({"error": "Authentication required"}), 401
		
		access_token = auth_header.replace("Bearer ", "").strip()
		
		try:
			SUPABASE_URL = os.getenv("SUPABASE_URL")
			SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
			SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
			
			if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
				return jsonify({"error": "Supabase configuration missing"}), 500
			
			# Verify user
			supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
			user_response = supabase_client.auth.get_user(access_token)
			
			if not user_response.user:
				return jsonify({"error": "Invalid token"}), 401
			
			# Check if user is admin (by ID or email)
			if not is_admin_user(user_response.user.id, user_response.user.email):
				return jsonify({"error": "Admin access required"}), 403
		except Exception as e:
			return jsonify({"error": "Authentication error: " + str(e)}), 401
	
	# Update gym account (always execute, even when skip_auth is True)
	try:
		SUPABASE_URL = os.getenv("SUPABASE_URL")
		SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
		
		if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
			return jsonify({"error": "Supabase configuration missing"}), 500
		
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
		user_to_update = admin_client.auth.admin.get_user_by_id(user_id)
		
		if not user_to_update.user:
			return jsonify({"error": "Gym account not found"}), 404
		
		user_meta = user_to_update.user.user_metadata or {}
		if user_meta.get("is_gym_account") != True:
			return jsonify({"error": "User is not a gym account"}), 400
		
		# Update metadata - mark as rejected (this will remove it from the admin list)
		updated_metadata = {**user_meta, "is_verified": False, "is_rejected": True}
		
		print(f"[ADMIN REJECT] Updating user {user_id} metadata: is_verified=False, is_rejected=True")
		
		# Use direct REST API call for more reliable updates
		try:
			auth_url = f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}"
			headers = {
				"apikey": SUPABASE_SERVICE_ROLE_KEY,
				"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
				"Content-Type": "application/json"
			}
			
			update_data = {"user_metadata": updated_metadata}
			response = requests.put(auth_url, headers=headers, json=update_data, timeout=10)
			
			if response.status_code == 200:
				print(f"[ADMIN REJECT] REST API update successful for user {user_id}")
			else:
				print(f"[ADMIN REJECT] REST API error: {response.status_code} - {response.text}")
				# Fallback to Python client
				update_response = admin_client.auth.admin.update_user_by_id(user_id, {"user_metadata": updated_metadata})
				if hasattr(update_response, 'error') and update_response.error:
					print(f"[ADMIN REJECT] Python client also failed: {update_response.error}")
					return jsonify({"error": f"Failed to update metadata: {update_response.error}"}), 500
		except requests.exceptions.RequestException as e:
			print(f"[ADMIN REJECT] REST API request failed: {e}")
			# Fallback to Python client
			update_response = admin_client.auth.admin.update_user_by_id(user_id, {"user_metadata": updated_metadata})
			if hasattr(update_response, 'error') and update_response.error:
				print(f"[ADMIN REJECT] Python client also failed: {update_response.error}")
				return jsonify({"error": f"Failed to update metadata: {update_response.error}"}), 500
		
		# Verify the update worked
		try:
			verify_user = admin_client.auth.admin.get_user_by_id(user_id)
			if verify_user and verify_user.user:
				verify_meta = verify_user.user.user_metadata or {}
				if verify_meta.get("is_verified") != False:
					print(f"[ADMIN REJECT] WARNING: Metadata update may have failed. is_verified is still: {verify_meta.get('is_verified')}")
				else:
					print(f"[ADMIN REJECT] Successfully rejected gym account {user_id}")
		except Exception as verify_error:
			print(f"[ADMIN REJECT] Error verifying update: {verify_error}")
		
		return jsonify({"success": True, "message": "Gym account rejected"}), 200
		
	except Exception as e:
		print(f"[ADMIN] Error rejecting gym account: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": f"Failed to reject gym account: {str(e)}"}), 500


@app.route("/api/admin/gym-accounts/<user_id>/premium", methods=["POST", "OPTIONS"])
def toggle_premium_gym_account(user_id: str):
	"""
	Toggle premium status for a gym account.
	Only accessible by admin users.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500
	
	# TEMPORARILY DISABLED AUTH FOR TESTING
	skip_auth = True  # TEMPORARY
	
	# Get Authorization header
	auth_header = request.headers.get("Authorization")
	
	if not skip_auth:
		if not auth_header or not auth_header.startswith("Bearer "):
			return jsonify({"error": "Authentication required"}), 401
		
		access_token = auth_header.replace("Bearer ", "").strip()
		
		try:
			SUPABASE_URL = os.getenv("SUPABASE_URL")
			SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
			SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
			
			if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
				return jsonify({"error": "Supabase configuration missing"}), 500
			
			# Verify user
			supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
			user_response = supabase_client.auth.get_user(access_token)
			
			if not user_response.user:
				return jsonify({"error": "Invalid token"}), 401
			
			# Check if user is admin (by ID or email)
			if not is_admin_user(user_response.user.id, user_response.user.email):
				return jsonify({"error": "Admin access required"}), 403
		except Exception as e:
			return jsonify({"error": "Authentication error: " + str(e)}), 401
	
	# Get request data and update gym account (always execute, even when skip_auth is True)
	try:
		SUPABASE_URL = os.getenv("SUPABASE_URL")
		SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
		
		if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
			return jsonify({"error": "Supabase configuration missing"}), 500
		
		data = request.get_json() or {}
		is_premium = data.get("is_premium", False) == True
		
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
		user_to_update = admin_client.auth.admin.get_user_by_id(user_id)
		
		if not user_to_update.user:
			return jsonify({"error": "Gym account not found"}), 404
		
		user_meta = user_to_update.user.user_metadata or {}
		if user_meta.get("is_gym_account") != True:
			return jsonify({"error": "User is not a gym account"}), 400
		
		# Update metadata
		updated_metadata = {**user_meta, "is_premium": is_premium}
		admin_client.auth.admin.update_user_by_id(user_id, {"user_metadata": updated_metadata})
		
		return jsonify({"success": True, "message": f"Premium status {'enabled' if is_premium else 'disabled'}"}), 200
		
	except Exception as e:
		print(f"[ADMIN] Error toggling premium: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": f"Failed to update premium status: {str(e)}"}), 500


# /verify and /resend-code endpoints removed - using Supabase for email verification


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


@app.route("/delete-account", methods=["POST"])
def delete_account():
	"""Delete user account from Supabase. Requires authentication."""
	access_token = request.headers.get("Authorization", "").replace("Bearer ", "")
	if not access_token:
		return jsonify({"error": "Authentication required"}), 401
	
	SUPABASE_URL = os.getenv("SUPABASE_URL")
	# Use service role key for admin operations (deleting users)
	SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
	
	if not SUPABASE_URL:
		return jsonify({"error": "Supabase configuration missing"}), 500
	
	# If service role key is not available, use anon key (less secure but works for self-deletion)
	SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY or os.getenv("SUPABASE_ANON_KEY")
	
	if not SUPABASE_KEY:
		return jsonify({"error": "Supabase key missing"}), 500
	
	try:
		# First verify the user
		supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
		user_response = supabase_client.auth.get_user(access_token)
		
		if not user_response.user:
			return jsonify({"error": "Invalid token"}), 401
		
		user_id = user_response.user.id
		
		# Delete user using admin API (requires service role key)
		if SUPABASE_SERVICE_ROLE_KEY:
			print(f"[DELETE ACCOUNT] Attempting to delete user {user_id} using service role key")
			admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
			
			try:
				# Delete user from auth.users (this will cascade delete from other tables due to ON DELETE CASCADE)
				delete_response = admin_client.auth.admin.delete_user(user_id)
				
				print(f"[DELETE ACCOUNT] Delete response type: {type(delete_response)}")
				print(f"[DELETE ACCOUNT] Delete response: {delete_response}")
				
				# Supabase Python client returns a response object
				# Check if it's a successful response (no error attribute or error is None)
				if hasattr(delete_response, 'error'):
					if delete_response.error is not None:
						error_msg = str(delete_response.error)
						print(f"[DELETE ACCOUNT] Error: {error_msg}")
						return jsonify({"error": f"Failed to delete account: {error_msg}"}), 500
					else:
						# No error, success
						print(f"[DELETE ACCOUNT] Successfully deleted user {user_id}")
						return jsonify({"success": True, "message": "Account deleted successfully"}), 200
				else:
					# Response doesn't have error attribute, assume success
					print(f"[DELETE ACCOUNT] Successfully deleted user {user_id} (no error attribute)")
					return jsonify({"success": True, "message": "Account deleted successfully"}), 200
					
			except Exception as delete_error:
				print(f"[DELETE ACCOUNT] Exception during delete: {delete_error}")
				import traceback
				traceback.print_exc()
				return jsonify({"error": f"Failed to delete account: {str(delete_error)}"}), 500
		else:
			# Fallback: Return instructions if service role key is not configured
			return jsonify({
				"error": "Account deletion requires server configuration. Please contact support at info.gymvisionai@gmail.com to delete your account.",
				"contact_email": "info.gymvisionai@gmail.com"
			}), 501
			
	except Exception as e:
		print(f"Error deleting account: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": f"Failed to delete account: {str(e)}"}), 500


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


# _try_openai_vision function removed - no longer used


def _serialize_prediction_choice(pred: Dict[str, Any]) -> Dict[str, Any]:
	key = pred["key"]
	label = pred.get("label")
	meta = MACHINE_METADATA.get(key, {"display": label or "Unknown", "muscles": [], "video": ""})
	display_name = meta.get("display") or (label.replace("_", " ").title() if label else "Unknown")
	return {
		"key": key, "label": label, "display": display_name,
		"muscles": normalize_muscles(meta.get("muscles", [])),
		"video": meta.get("video", ""),
		"image": image_url_for_key(key, meta) or meta.get("image"),
		"confidence": pred.get("conf", 0.0),
	}

@app.route("/predict", methods=["POST"])
def predict():
	"""YOLO prediction endpoint - DISABLED: Models no longer used."""
	return jsonify({"error": "This endpoint is disabled. Models are no longer used."}), 503


def _deduct_credit_for_user(user_id: str) -> dict:
	"""
	Helper function to deduct 1 credit from user's account. 
	Returns updated credits info.
	Raises ValueError if user has no credits remaining.
	"""
	if not SUPABASE_AVAILABLE:
		raise ValueError("Credits system not available")
	
	try:
		SUPABASE_URL = os.getenv("SUPABASE_URL")
		SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
		
		if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
			raise ValueError("Credits system not configured")
		
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
		now = datetime.now()
		current_month = now.strftime("%Y-%m")
		
		# Get existing credits record
		credits_response = admin_client.table("user_credits").select("*").eq("user_id", user_id).execute()
		
		current_credits = 10  # Default if no record
		last_reset_month = None
		
		if credits_response.data and len(credits_response.data) > 0:
			credits_record = credits_response.data[0]
			last_reset_month = credits_record.get("last_reset_month")
			current_credits = credits_record.get("credits_remaining", 10)
			
			# Reset if new month
			if last_reset_month != current_month:
				current_credits = 10
		
		# Check if user has credits before deducting
		if current_credits <= 0:
			raise ValueError("No credits remaining")
		
		# Deduct 1 credit
		credits_remaining = current_credits - 1
		
		# Update or create credits record
		if credits_response.data and len(credits_response.data) > 0:
			# Update existing record
			admin_client.table("user_credits").update({
				"credits_remaining": credits_remaining,
				"last_reset_month": current_month,
				"updated_at": now.isoformat()
			}).eq("user_id", user_id).execute()
		else:
			# Create new record
			admin_client.table("user_credits").insert({
				"user_id": user_id,
				"credits_remaining": credits_remaining,
				"last_reset_month": current_month
			}).execute()
		
		return {"credits_remaining": credits_remaining, "last_reset_month": current_month}
	except ValueError:
		# Re-raise ValueError (no credits)
		raise
	except Exception as e:
		print(f"[ERROR] Error deducting credit: {e}")
		import traceback
		traceback.print_exc()
		raise ValueError(f"Failed to deduct credit: {str(e)}")


@app.route("/api/vision-detect", methods=["POST"])
def vision_detect():
	"""Chat endpoint: photo + question → AI chat response."""
	import base64
	
	try:
		if not OPENAI_AVAILABLE:
			return jsonify({"success": False, "error": "OpenAI not available"}), 500
		
		# Get image file
		file = request.files.get("image")
		if not file:
			return jsonify({"success": False, "error": "No image provided"}), 400
		
		# Get OpenAI API key
		api_key = os.getenv("OPENAI_API_KEY")
		if not api_key:
			return jsonify({"success": False, "error": "OpenAI API key not configured"}), 500
		
		# Read image and encode
		image_bytes = file.read()
		if not image_bytes:
			return jsonify({"success": False, "error": "Image is empty"}), 400
		
		image_base64 = base64.b64encode(image_bytes).decode('utf-8')
		
		# Determine format
		image_format = "jpeg"
		if file.content_type and "png" in file.content_type:
			image_format = "png"
		elif file.content_type and "webp" in file.content_type:
			image_format = "webp"
		
		# Get user message (optional, defaults to "welke oefening is dit?")
		user_message = request.form.get("message", "Welke oefening is dit?")
		
		# Get user ID and check credits BEFORE making OpenAI API call
		user_id = None
		auth_header = request.headers.get("Authorization")
		if auth_header and auth_header.startswith("Bearer "):
			access_token = auth_header.replace("Bearer ", "").strip()
			if access_token and SUPABASE_AVAILABLE:
				try:
					SUPABASE_URL = os.getenv("SUPABASE_URL")
					SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
					if SUPABASE_URL and SUPABASE_ANON_KEY:
						supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
						user_response = supabase_client.auth.get_user(access_token)
						if user_response.user:
							user_id = user_response.user.id
							
							# Check credits BEFORE making OpenAI API call
							if user_id:
								try:
									# Check if user has credits (but don't deduct yet)
									SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
									if SUPABASE_SERVICE_ROLE_KEY:
										admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
										now = datetime.now()
										current_month = now.strftime("%Y-%m")
										credits_response = admin_client.table("user_credits").select("*").eq("user_id", user_id).execute()
										
										current_credits = 10  # Default if no record
										if credits_response.data and len(credits_response.data) > 0:
											credits_record = credits_response.data[0]
											last_reset_month = credits_record.get("last_reset_month")
											current_credits = credits_record.get("credits_remaining", 10)
											# Reset if new month
											if last_reset_month != current_month:
												current_credits = 10
										
										# Check if user has credits BEFORE API call
										if current_credits <= 0:
											return jsonify({"success": False, "error": "no_credits", "message": "You are out of your monthly credits"}), 403
								except Exception as e:
									print(f"[WARNING] Could not check credits: {e}")
									# Continue if credit check fails (fallback behavior)
				except Exception as e:
					print(f"[WARNING] Could not get user ID for credit deduction: {e}")
		
		# Call OpenAI Vision for chat response (only if user has credits)
		client = OpenAI(api_key=api_key)
		response = client.chat.completions.create(
			model="gpt-4o-mini",
			messages=[
				{
					"role": "system",
					"content": "Je bent een fitness expert. Beantwoord vragen over oefeningen in het Nederlands. Wees vriendelijk en behulpzaam."
				},
				{
					"role": "user",
					"content": [
						{"type": "text", "text": user_message},
						{"type": "image_url", "image_url": {"url": f"data:image/{image_format};base64,{image_base64}"}}
					]
				}
			],
			max_tokens=200
		)
		
		# Extract response
		if response.choices and len(response.choices) > 0:
			response_content = response.choices[0].message.content
			if response_content:
				chat_response = response_content.strip()
				print(f"[SUCCESS] AI chat response: {chat_response}")
				
				# Deduct credit if user is authenticated (only on successful recognition)
				# Credits were already checked before the API call, so this should always succeed
				result = {
					"success": True,
					"message": chat_response
				}
				if user_id:
					try:
						credits_info = _deduct_credit_for_user(user_id)
						result["credits_remaining"] = credits_info["credits_remaining"]
					except ValueError as e:
						# This should not happen since we checked before, but handle it anyway
						if "No credits remaining" in str(e):
							return jsonify({"success": False, "error": "no_credits", "message": "You are out of your monthly credits"}), 403
						raise
				
				return jsonify(result), 200
		
		# Fallback if OpenAI response is empty
		print("[ERROR] OpenAI returned empty response")
		# Return a friendly message instead of error
		return jsonify({
			"success": True,
			"message": "Sorry, ik kon de oefening niet goed identificeren. Kun je een duidelijkere foto maken?"
		}), 200
	except Exception as e:
		print(f"[ERROR] Vision detect error: {e}")
		import traceback
		traceback.print_exc()
		# Return a friendly message instead of technical error
		return jsonify({
			"success": True,
			"message": "Sorry, er ging iets mis. Kun je het opnieuw proberen met een andere foto?"
		}), 200


# /predict endpoint removed - now using /api/vision-detect with OpenAI Vision


@app.route("/api/recognize-exercise", methods=["POST", "OPTIONS"])
def recognize_exercise():
	"""
	Exercise recognition endpoint: image → exercise name.
	Same pattern as vision-detect - just call OpenAI Vision directly.
	Also deducts 1 credit from user's account on successful recognition.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	import base64
	
	# Get user ID and check credits BEFORE making OpenAI API call
	user_id = None
	auth_header = request.headers.get("Authorization")
	if auth_header and auth_header.startswith("Bearer "):
		access_token = auth_header.replace("Bearer ", "").strip()
		if access_token and SUPABASE_AVAILABLE:
			try:
				SUPABASE_URL = os.getenv("SUPABASE_URL")
				SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
				if SUPABASE_URL and SUPABASE_ANON_KEY:
					supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
					user_response = supabase_client.auth.get_user(access_token)
					if user_response.user:
						user_id = user_response.user.id
						
						# Check credits BEFORE making OpenAI API call
						if user_id:
							try:
								# Check if user has credits (but don't deduct yet)
								SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
								if SUPABASE_SERVICE_ROLE_KEY:
									admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
									now = datetime.now()
									current_month = now.strftime("%Y-%m")
									credits_response = admin_client.table("user_credits").select("*").eq("user_id", user_id).execute()
									
									current_credits = 10  # Default if no record
									if credits_response.data and len(credits_response.data) > 0:
										credits_record = credits_response.data[0]
										last_reset_month = credits_record.get("last_reset_month")
										current_credits = credits_record.get("credits_remaining", 10)
										# Reset if new month
										if last_reset_month != current_month:
											current_credits = 10
									
									# Check if user has credits BEFORE API call
									if current_credits <= 0:
										return jsonify({"error": "no_credits", "message": "You are out of your monthly credits"}), 403
							except Exception as e:
								print(f"[WARNING] Could not check credits: {e}")
								# Continue if credit check fails (fallback behavior)
			except Exception as e:
				print(f"[WARNING] Could not get user ID for credit deduction: {e}")
	
	try:
		if not OPENAI_AVAILABLE:
			return jsonify({"exercise": "unknown exercise"}), 200
		
		# Get image file (same as vision-detect)
		file = request.files.get("image")
		if not file:
			print("[ERROR] No file in request")
			return jsonify({"exercise": "unknown exercise"}), 200
		
		print(f"[DEBUG] File received: {file.filename}, content_type: {file.content_type}")
		
		# Get OpenAI API key
		api_key = os.getenv("OPENAI_API_KEY")
		if not api_key:
			print("[ERROR] OPENAI_API_KEY not set")
			return jsonify({"exercise": "unknown exercise"}), 200
		
		# Read image and encode (same as vision-detect)
		image_bytes = file.read()
		if not image_bytes:
			print("[ERROR] Image bytes is empty")
			return jsonify({"exercise": "unknown exercise"}), 200
		
		print(f"[DEBUG] Image size: {len(image_bytes)} bytes")
		
		image_base64 = base64.b64encode(image_bytes).decode('utf-8')
		
		# Determine format (same as vision-detect)
		image_format = "jpeg"
		if file.content_type and "png" in file.content_type:
			image_format = "png"
		elif file.content_type and "webp" in file.content_type:
			image_format = "webp"
		
		# Call OpenAI Vision - FORCE it to always give an exercise
		client = OpenAI(api_key=api_key)
		response = client.chat.completions.create(
			model="gpt-4o-mini",
			messages=[
				{
					"role": "user",
					"content": [
						{
							"type": "text",
							"text": "What exercise is being performed in this image? Respond with ONLY the exercise name in English (e.g. 'bench press', 'squat', 'deadlift', 'bicep curl'). Always make your best guess - even if you're not 100% sure, give the most likely exercise name. Only respond with 'unknown exercise' if the image is completely blank, shows no person, or shows something that is clearly not a fitness exercise at all."
						},
						{
							"type": "image_url",
							"image_url": {"url": f"data:image/{image_format};base64,{image_base64}"}
						}
					]
				}
			],
			max_tokens=50,
			temperature=0.3  # Lower temperature for more consistent responses
		)
		
		# Extract response
		if response.choices and len(response.choices) > 0:
			response_content = response.choices[0].message.content
			if response_content:
				raw_response = response_content.strip()
				print(f"[DEBUG] OpenAI raw response: '{raw_response}'")
				
				exercise_name = raw_response.lower()
				
				# Clean up - remove common prefixes and phrases
				exercise_name = exercise_name.strip('"\'.,;:!?')
				exercise_name = exercise_name.replace("dit is een ", "").replace("dit is ", "")
				exercise_name = exercise_name.replace("this is a ", "").replace("this is ", "")
				exercise_name = exercise_name.replace("looks like ", "").replace("appears to be ", "")
				exercise_name = exercise_name.replace("i see a ", "").replace("i see ", "")
				exercise_name = exercise_name.replace("it's a ", "").replace("it is a ", "")
				exercise_name = exercise_name.replace("probably a ", "").replace("likely a ", "")
				exercise_name = " ".join(exercise_name.split())  # Normalize whitespace
				
				# ONLY mark as unknown if EXPLICITLY stated
				# Accept everything else, even if weird
				if exercise_name == "unknown exercise" or exercise_name == "unknown":
					# Try one more time with a different prompt if we get unknown
					print("[DEBUG] Got 'unknown', trying again with different prompt...")
					# For now, just return unknown - but we could retry here
					exercise_name = "unknown exercise"
				elif len(exercise_name.strip()) < 2:
					# Too short, but still try to use it
					exercise_name = "unknown exercise"
				else:
					# We have something - use it!
					# Don't mark as unknown even if it's weird
					pass
				
				print(f"[DEBUG] Final exercise: '{exercise_name}'")
				
				# Deduct credit if user is authenticated (only on successful recognition)
				result = {"exercise": exercise_name}
				if user_id:
					try:
						credits_info = _deduct_credit_for_user(user_id)
						result["credits_remaining"] = credits_info["credits_remaining"]
					except ValueError as e:
						# No credits remaining - return error
						if "No credits remaining" in str(e):
							return jsonify({"error": "no_credits", "message": "You are out of your monthly credits"}), 403
						raise
				
				return jsonify(result), 200
		
		print("[DEBUG] No response from OpenAI")
		return jsonify({"exercise": "unknown exercise"}), 200
		
	except Exception as e:
		print(f"[ERROR] Exercise recognition error: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"exercise": "unknown exercise"}), 200


@app.route("/api/user-credits", methods=["GET", "OPTIONS"])
def user_credits():
	"""
	Get user credits from Supabase.
	Handles monthly reset automatically.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
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
	
	# Initialize Supabase clients
	SUPABASE_URL = os.getenv("SUPABASE_URL")
	SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
	SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
	
	if not SUPABASE_URL or not SUPABASE_ANON_KEY:
		return jsonify({"error": "Supabase configuration missing"}), 500
	
	try:
		# Get user from token
		supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
		user_response = supabase_client.auth.get_user(access_token)
		
		if not user_response.user:
			return jsonify({"error": "Invalid token"}), 401
		
		user_id = user_response.user.id
		
		# Use service role key for database operations
		if SUPABASE_SERVICE_ROLE_KEY:
			admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
		else:
			# Fallback to anon key if service role not available
			admin_client = supabase_client
		
		# Get current month
		now = datetime.now()
		current_month = now.strftime("%Y-%m")
		
		# Try to get existing credits record
		credits_response = admin_client.table("user_credits").select("*").eq("user_id", user_id).execute()
		
		if credits_response.data and len(credits_response.data) > 0:
			credits_record = credits_response.data[0]
			last_reset_month = credits_record.get("last_reset_month")
			
			# Reset credits if it's a new month
			if last_reset_month != current_month:
				# Reset to 10 credits for new month
				update_response = admin_client.table("user_credits").update({
					"credits_remaining": 10,
					"last_reset_month": current_month,
					"updated_at": now.isoformat()
				}).eq("user_id", user_id).execute()
				
				credits_remaining = 10
			else:
				credits_remaining = credits_record.get("credits_remaining", 10)
		else:
			# Create new record with 10 credits
			insert_response = admin_client.table("user_credits").insert({
				"user_id": user_id,
				"credits_remaining": 10,
				"last_reset_month": current_month
			}).execute()
			
			credits_remaining = 10
		
		return jsonify({
			"credits_remaining": credits_remaining,
			"last_reset_month": current_month
		}), 200
		
	except Exception as e:
		print(f"[ERROR] Error getting user credits: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": "Failed to get credits", "details": str(e)}), 500


@app.route("/api/user-credits/deduct", methods=["POST", "OPTIONS"])
def deduct_user_credits():
	"""
	Deduct 1 credit from user's account.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
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
	
	# Initialize Supabase clients
	SUPABASE_URL = os.getenv("SUPABASE_URL")
	SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
	SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
	
	if not SUPABASE_URL or not SUPABASE_ANON_KEY:
		return jsonify({"error": "Supabase configuration missing"}), 500
	
	try:
		# Get user from token
		supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
		user_response = supabase_client.auth.get_user(access_token)
		
		if not user_response.user:
			return jsonify({"error": "Invalid token"}), 401
		
		user_id = user_response.user.id
		
		# Use service role key for database operations
		if SUPABASE_SERVICE_ROLE_KEY:
			admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
		else:
			admin_client = supabase_client
		
		# Get current month
		now = datetime.now()
		current_month = now.strftime("%Y-%m")
		
		# Get existing credits record
		credits_response = admin_client.table("user_credits").select("*").eq("user_id", user_id).execute()
		
		if credits_response.data and len(credits_response.data) > 0:
			credits_record = credits_response.data[0]
			last_reset_month = credits_record.get("last_reset_month")
			current_credits = credits_record.get("credits_remaining", 10)
			
			# Reset if new month
			if last_reset_month != current_month:
				credits_remaining = 10
			else:
				credits_remaining = max(0, current_credits - 1)
			
			# Update credits
			update_response = admin_client.table("user_credits").update({
				"credits_remaining": credits_remaining,
				"last_reset_month": current_month,
				"updated_at": now.isoformat()
			}).eq("user_id", user_id).execute()
		else:
			# Create new record with 9 credits (10 - 1)
			insert_response = admin_client.table("user_credits").insert({
				"user_id": user_id,
				"credits_remaining": 9,
				"last_reset_month": current_month
			}).execute()
			credits_remaining = 9
		
		return jsonify({
			"credits_remaining": credits_remaining,
			"last_reset_month": current_month
		}), 200
		
	except Exception as e:
		print(f"[ERROR] Error deducting credits: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": "Failed to deduct credits", "details": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
	"""Health check endpoint to test if backend is working."""
	return jsonify({
		"status": "ok",
		"openai_available": OPENAI_AVAILABLE,
		"groq_available": GROQ_AVAILABLE
	}), 200

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
		# Remove duplicates from muscles array (safety check)
		muscles = meta.get("muscles", [])
		unique_muscles = list(dict.fromkeys(muscles))  # Preserves order while removing duplicates
		exercises.append({
			"key": key,
			"display": meta.get("display", key.replace("_", " ").title()),
			"muscles": unique_muscles,
			"image": image_url_for_key(key, meta) or meta.get("image"),
		})
	return jsonify({"exercises": exercises})


# /model-classes endpoint removed - no longer using YOLO models


def sync_gym_data_to_analytics_table(
	user_id: str,
	gym_name: Optional[str] = None,
	has_consent: Optional[bool] = None,
	user_metadata: Optional[Dict[str, Any]] = None
):
	"""
	Sync gym data from user_metadata to gym_analytics table.
	This function should be called whenever a user updates their gym name or consent.
	"""
	if not SUPABASE_AVAILABLE:
		return False

	SUPABASE_URL = os.getenv("SUPABASE_URL")
	SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

	if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
		print("[GYM SYNC] Supabase configuration missing")
		return False

	try:
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

		# Reuse provided metadata when available to avoid extra auth.users fetches.
		if user_metadata is None:
			user_response = admin_client.auth.admin.get_user_by_id(user_id)
			if not user_response.user:
				print(f"[GYM SYNC] User {user_id} not found")
				return False
			user_metadata = user_response.user.user_metadata or {}
		else:
			user_metadata = user_metadata or {}

		gym_place_id = user_metadata.get("gym_place_id")

		# Use provided values or get from metadata
		if gym_name is None:
			gym_name = user_metadata.get("gym_name")
		if has_consent is None:
			has_consent = user_metadata.get("data_collection_consent", False)

		# Find matching gym account only when user has consent and selected a gym.
		gym_id = None
		if has_consent and gym_name:
			all_users = admin_client.auth.admin.list_users()
			# supabase-py v2 returns `.data`; older variants may return `.users`
			users_list = getattr(all_users, "data", None)
			if users_list is None:
				users_list = getattr(all_users, "users", None)
			if users_list is None and isinstance(all_users, dict):
				users_list = all_users.get("data") or all_users.get("users")
			if users_list is None and isinstance(all_users, list):
				users_list = all_users
			if users_list is None:
				users_list = []

			for user in users_list:
				user_meta = user.user_metadata or {}
				if (
					user_meta.get("is_gym_account") == True
					and user_meta.get("gym_name")
					and user_meta.get("gym_name").lower().strip() == gym_name.lower().strip()
				):
					gym_id = user.id
					break

		# Parse timestamps
		consent_given_at = None
		consent_revoked_at = None
		if has_consent:
			consent_given_at_str = user_metadata.get("consent_updated_at")
			if consent_given_at_str:
				try:
					consent_given_at = datetime.fromisoformat(consent_given_at_str.replace("Z", "+00:00"))
				except Exception:
					consent_given_at = datetime.now()
		else:
			consent_revoked_at_str = user_metadata.get("consent_updated_at")
			if consent_revoked_at_str:
				try:
					consent_revoked_at = datetime.fromisoformat(consent_revoked_at_str.replace("Z", "+00:00"))
				except Exception:
					consent_revoked_at = datetime.now()

		gym_name_updated_at = None
		gym_name_updated_at_str = user_metadata.get("gym_name_updated_at")
		if gym_name_updated_at_str:
			try:
				gym_name_updated_at = datetime.fromisoformat(gym_name_updated_at_str.replace("Z", "+00:00"))
			except Exception:
				pass

		# Check if record exists (only fields we need)
		existing = admin_client.table("gym_analytics").select("user_id,gym_id").eq("user_id", user_id).execute()

		data_to_upsert = {
			"user_id": user_id,
			"gym_name": gym_name,
			"data_collection_consent": has_consent,
			"updated_at": datetime.now().isoformat(),
		}

		# Store place_id if the table has the column (backwards compatible)
		if gym_place_id:
			data_to_upsert["gym_place_id"] = gym_place_id

		# If consent is revoked, remove gym_id to unlink user from gym dashboard
		if has_consent and gym_id:
			data_to_upsert["gym_id"] = gym_id
		elif not has_consent:
			data_to_upsert["gym_id"] = None

		if consent_given_at:
			data_to_upsert["consent_given_at"] = consent_given_at.isoformat()
		if consent_revoked_at:
			data_to_upsert["consent_revoked_at"] = consent_revoked_at.isoformat()
		if gym_name_updated_at:
			data_to_upsert["gym_name_updated_at"] = gym_name_updated_at.isoformat()

		def _execute_upsert(payload: dict, exists: bool):
			if exists:
				return admin_client.table("gym_analytics").update(payload).eq("user_id", user_id).execute()
			payload2 = {**payload, "created_at": datetime.now().isoformat()}
			return admin_client.table("gym_analytics").insert(payload2).execute()

		exists = bool(existing.data and len(existing.data) > 0)
		try:
			_execute_upsert(data_to_upsert, exists)
		except Exception as e:
			# If schema doesn't include gym_place_id yet, retry without it.
			msg = str(e)
			if "gym_place_id" in msg and ("PGRST204" in msg or "schema cache" in msg):
				payload = {k: v for k, v in data_to_upsert.items() if k != "gym_place_id"}
				_execute_upsert(payload, exists)
				print("[GYM SYNC] gym_place_id column missing; synced without gym_place_id (run migration to add column).")
			else:
				raise

		# Only log if there's a change or first sync
		if existing.data and len(existing.data) > 0:
			existing_row = existing.data[0]
			if not exists or (gym_id is not None and existing_row.get("gym_id") != gym_id):
				print(f"[GYM SYNC] Synced gym analytics for user {user_id}, linked to gym_id: {gym_id}")
		elif not exists:
			print(f"[GYM SYNC] Synced gym analytics for user {user_id}, linked to gym_id: {gym_id}")

		return True
	except Exception as e:
		print(f"[GYM SYNC] Error syncing gym data: {e}")
		if "permission denied for table users" in str(e).lower():
			print("[GYM SYNC] Likely cause: the gym_analytics trigger reads auth.users without SECURITY DEFINER. "
			      "Re-run gym_accounts_schema.sql with SECURITY DEFINER (see repo) to fix.")
		import traceback
		traceback.print_exc()
		return False


def _extract_users_list(all_users_response: Any) -> List[Any]:
	users_list = getattr(all_users_response, "data", None)
	if users_list is None:
		users_list = getattr(all_users_response, "users", None)
	if users_list is None and isinstance(all_users_response, dict):
		users_list = all_users_response.get("data") or all_users_response.get("users")
	if users_list is None and isinstance(all_users_response, list):
		users_list = all_users_response
	return users_list or []


def _find_gym_account_id_by_name(admin_client: Any, gym_name: Optional[str]) -> Optional[str]:
	target = (gym_name or "").strip().lower()
	if not target:
		return None
	try:
		all_users = admin_client.auth.admin.list_users()
		for user in _extract_users_list(all_users):
			user_id = getattr(user, "id", None) or (user.get("id") if isinstance(user, dict) else None)
			user_meta = getattr(user, "user_metadata", None)
			if user_meta is None and isinstance(user, dict):
				user_meta = user.get("user_metadata") or user.get("raw_user_meta_data")
			user_meta = user_meta or {}
			if user_meta.get("is_gym_account") != True:
				continue
			candidate = (user_meta.get("gym_name") or "").strip().lower()
			if candidate and candidate == target:
				return user_id
	except Exception as e:
		print(f"[GYM REPORTS] Failed to resolve gym account by name: {e}")
	return None


@app.route("/api/gym-data", methods=["GET", "OPTIONS"])
def get_gym_data():
	"""
	Get gym/sportschool data from users who have given consent.
	This endpoint can be used for analytics and data collection.
	Only returns data for users who have data_collection_consent = true.
	
	Query parameters:
	- gym_name: Filter by specific gym name
	- format: 'json' (default) or 'csv' for export
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500
	
	# Get Authorization header (admin/service role key required for this endpoint)
	auth_header = request.headers.get("Authorization")
	if not auth_header or not auth_header.startswith("Bearer "):
		return jsonify({"error": "Authentication required"}), 401
	
	# Extract token
	token = auth_header.replace("Bearer ", "").strip()
	
	# Check if it's a service role key (for admin access)
	SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
	if not SUPABASE_SERVICE_ROLE_KEY or token != SUPABASE_SERVICE_ROLE_KEY:
		return jsonify({"error": "Unauthorized - service role key required"}), 403
	
	try:
		SUPABASE_URL = os.getenv("SUPABASE_URL")
		if not SUPABASE_URL:
			return jsonify({"error": "Supabase configuration missing"}), 500
		
		# Create admin client
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
		
		# Get query parameters
		gym_name_filter = request.args.get("gym_name")
		format_type = request.args.get("format", "json")
		
		# Query gym_analytics table - only users with consent
		query = admin_client.table("gym_analytics").select("*").eq("data_collection_consent", True)
		
		if gym_name_filter:
			query = query.eq("gym_name", gym_name_filter)
		
		result = query.execute()
		
		if format_type == "csv":
			# Return CSV format
			import csv
			import io
			output = io.StringIO()
			writer = csv.writer(output)
			
			# Write header
			writer.writerow(["user_id", "gym_name", "consent_given_at", "gym_name_updated_at", "created_at"])
			
			# Write data
			for row in result.data:
				writer.writerow([
					row.get("user_id", ""),
					row.get("gym_name", ""),
					row.get("consent_given_at", ""),
					row.get("gym_name_updated_at", ""),
					row.get("created_at", "")
				])
			
			from flask import Response
			return Response(
				output.getvalue(),
				mimetype="text/csv",
				headers={"Content-Disposition": "attachment; filename=gym_analytics.csv"}
			)
		else:
			# Return JSON format
			# Group by gym name for analytics
			gym_stats = {}
			for row in result.data:
				gym_name = row.get("gym_name") or "Unknown"
				if gym_name not in gym_stats:
					gym_stats[gym_name] = {
						"gym_name": gym_name,
						"user_count": 0,
						"users": []
					}
				gym_stats[gym_name]["user_count"] += 1
				gym_stats[gym_name]["users"].append({
					"user_id": row.get("user_id"),
					"consent_given_at": row.get("consent_given_at"),
					"gym_name_updated_at": row.get("gym_name_updated_at")
				})
			
			return jsonify({
				"total_users": len(result.data),
				"total_gyms": len(gym_stats),
				"gym_statistics": list(gym_stats.values()),
				"raw_data": result.data if request.args.get("include_raw") == "true" else None
			}), 200
		
	except Exception as e:
		print(f"[GYM DATA] Error: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": f"Failed to get gym data: {str(e)}"}), 500


@app.route("/api/collect-gym-data", methods=["POST", "OPTIONS"])
def collect_gym_data():
	"""
	Endpoint to collect gym name and data consent from the frontend.
	Updates user_metadata in Supabase and syncs to gym_analytics table.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	access_token = request.headers.get("Authorization", "").replace("Bearer ", "")
	if not access_token:
		return jsonify({"error": "Authentication required"}), 401

	SUPABASE_URL = os.getenv("SUPABASE_URL")
	SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
	SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

	if not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_SERVICE_ROLE_KEY:
		return jsonify({"error": "Supabase configuration missing"}), 500

	try:
		supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
		user_response = supabase_client.auth.get_user(access_token)

		if not user_response.user:
			return jsonify({"error": "Invalid token"}), 401

		user_id = user_response.user.id
		data = request.get_json() or {}
		# We must distinguish between "field not provided" and "explicitly clear (null)".
		has_gym_name = "gym_name" in data
		has_gym_place_id = "gym_place_id" in data
		has_data_consent = "data_consent" in data

		gym_name = data.get("gym_name")
		gym_place_id = data.get("gym_place_id")
		data_consent = data.get("data_consent")

		# Update user metadata
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
		
		# Use metadata from verified access token (avoids extra auth.users call per save).
		current_metadata = getattr(user_response.user, "user_metadata", None) or {}
		if not isinstance(current_metadata, dict):
			current_metadata = {}
		
		updated_metadata = {**current_metadata}
		now_iso = datetime.now().isoformat()
		
		if has_gym_name:
			# Allow clearing gym by sending null/empty string
			if gym_name is None or (isinstance(gym_name, str) and gym_name.strip() == ""):
				updated_metadata.pop("gym_name", None)
				updated_metadata.pop("gym_place_id", None)
			else:
				updated_metadata["gym_name"] = gym_name
			updated_metadata["gym_name_updated_at"] = now_iso

		if has_gym_place_id:
			if gym_place_id is None or (isinstance(gym_place_id, str) and gym_place_id.strip() == ""):
				updated_metadata.pop("gym_place_id", None)
			else:
				updated_metadata["gym_place_id"] = gym_place_id
		
		if has_data_consent and data_consent is not None:
			updated_metadata["data_collection_consent"] = data_consent
			updated_metadata["consent_updated_at"] = now_iso

		# supabase-py v2: update_user_by_id (not update_user)
		admin_client.auth.admin.update_user_by_id(user_id, {"user_metadata": updated_metadata})

		# Automatically sync to gym_analytics table
		ok = sync_gym_data_to_analytics_table(
			user_id,
			gym_name,
			data_consent,
			user_metadata=updated_metadata
		)
		if not ok:
			return jsonify({"error": "Failed to sync gym data to analytics table"}), 500

		return jsonify({"success": True, "message": "Gym data updated successfully"}), 200

	except Exception as e:
		print(f"Error collecting gym data: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": f"Failed to update gym data: {str(e)}"}), 500


@app.route("/api/gym-data/sync", methods=["POST", "OPTIONS"])
def sync_gym_data():
	"""
	Sync gym data from user_metadata to gym_analytics table.
	This endpoint is called automatically when a user updates their gym name or consent.
	Can also be called manually to sync existing data.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500
	
	# Get Authorization header (user access token)
	auth_header = request.headers.get("Authorization")
	if not auth_header or not auth_header.startswith("Bearer "):
		return jsonify({"error": "Authentication required"}), 401
	
	access_token = auth_header.replace("Bearer ", "").strip()
	
	try:
		SUPABASE_URL = os.getenv("SUPABASE_URL")
		SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
		
		if not SUPABASE_URL or not SUPABASE_ANON_KEY:
			return jsonify({"error": "Supabase configuration missing"}), 500
		
		# Verify user
		supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
		user_response = supabase_client.auth.get_user(access_token)
		
		if not user_response.user:
			return jsonify({"error": "Invalid token"}), 401
		
		user_id = user_response.user.id
		
		# Get data from request body (optional - if not provided, will fetch from user_metadata)
		data = request.get_json() or {}
		gym_name = data.get("gym_name")
		has_consent = data.get("data_collection_consent")
		
		# Sync to analytics table
		success = sync_gym_data_to_analytics_table(user_id, gym_name, has_consent)
		
		if success:
			return jsonify({"success": True, "message": "Gym data synced successfully"}), 200
		else:
			return jsonify({"error": "Failed to sync gym data"}), 500
		
	except Exception as e:
		print(f"[GYM SYNC] Error: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": f"Failed to sync gym data: {str(e)}"}), 500


@app.route("/api/gym/problem-reports", methods=["GET", "POST", "OPTIONS"])
def gym_problem_reports():
	"""
	POST: user submits a problem report for their selected gym.
	GET: gym account fetches open problem reports for its gym.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200

	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500

	auth_header = request.headers.get("Authorization")
	if not auth_header or not auth_header.startswith("Bearer "):
		return jsonify({"error": "Authentication required"}), 401

	access_token = auth_header.replace("Bearer ", "").strip()
	if not access_token:
		return jsonify({"error": "Missing access token"}), 401

	SUPABASE_URL = os.getenv("SUPABASE_URL")
	SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
	SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
	if not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_SERVICE_ROLE_KEY:
		return jsonify({"error": "Supabase configuration missing"}), 500

	try:
		supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
		user_response = supabase_client.auth.get_user(access_token)
		if not user_response.user:
			return jsonify({"error": "Invalid token"}), 401

		user = user_response.user
		user_id = user.id
		user_meta = user.user_metadata or {}
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

		if request.method == "POST":
			data = request.get_json() or {}
			exercise_key = (data.get("exercise_key") or "").strip()
			exercise_display = (data.get("exercise_display") or "").strip()
			issue_type = normalize_problem_report_type(data.get("issue_type"))
			note = (data.get("note") or "").strip()
			gym_name = (data.get("gym_name") or user_meta.get("gym_name") or "").strip()
			gym_place_id = (data.get("gym_place_id") or user_meta.get("gym_place_id") or "").strip()

			if not exercise_display:
				return jsonify({"error": "Exercise is required"}), 400
			if not issue_type:
				return jsonify({"error": "Invalid issue type"}), 400
			if len(note) > 120:
				return jsonify({"error": "Note max length is 120 characters"}), 400
			if not gym_name:
				return jsonify({"error": "No gym selected. Set your gym first in Settings."}), 400

			gym_id = None
			try:
				analytics_result = admin_client.table("gym_analytics").select("gym_id,gym_name").eq("user_id", user_id).limit(1).execute()
				if analytics_result.data and len(analytics_result.data) > 0:
					gym_id = analytics_result.data[0].get("gym_id")
					if not gym_name:
						gym_name = (analytics_result.data[0].get("gym_name") or "").strip()
			except Exception:
				pass

			if not gym_id:
				gym_id = _find_gym_account_id_by_name(admin_client, gym_name)

			payload = {
				"user_id": user_id,
				"gym_id": gym_id,
				"gym_name": gym_name,
				"gym_place_id": gym_place_id or None,
				"exercise_key": exercise_key or None,
				"exercise_display": exercise_display,
				"issue_type": issue_type,
				"note": note or None,
				"status": "open",
				"is_read": False,
			}

			admin_client.table("gym_problem_reports").insert(payload).execute()
			return jsonify({"success": True, "message": "Problem report sent"}), 200

		# GET for gym accounts
		if user_meta.get("is_gym_account") != True:
			return jsonify({"error": "Only gym accounts can view reports"}), 403
		if user_meta.get("is_verified") != True:
			return jsonify({"error": "Gym account not verified"}), 403

		limit_raw = request.args.get("limit", "50")
		try:
			limit = max(1, min(200, int(limit_raw)))
		except Exception:
			limit = 50

		gym_id = user_id
		gym_name = (user_meta.get("gym_name") or "").strip()
		result = admin_client.table("gym_problem_reports") \
			.select("*") \
			.eq("status", "open") \
			.eq("gym_id", gym_id) \
			.order("created_at", desc=True) \
			.limit(limit) \
			.execute()

		reports = result.data or []
		if not reports and gym_name:
			fallback = admin_client.table("gym_problem_reports") \
				.select("*") \
				.eq("status", "open") \
				.eq("gym_name", gym_name) \
				.order("created_at", desc=True) \
				.limit(limit) \
				.execute()
			reports = fallback.data or []

		serialized = []
		unread_count = 0
		for row in reports:
			is_read = row.get("is_read") == True
			if not is_read:
				unread_count += 1
			serialized.append({
				"id": row.get("id"),
				"exercise_key": row.get("exercise_key"),
				"exercise_display": row.get("exercise_display"),
				"issue_type": row.get("issue_type"),
				"note": row.get("note"),
				"status": row.get("status"),
				"is_read": is_read,
				"created_at": row.get("created_at"),
			})

		return jsonify({
			"success": True,
			"open_count": len(serialized),
			"unread_count": unread_count,
			"reports": serialized
		}), 200

	except Exception as e:
		msg = str(e)
		print(f"[GYM REPORTS] Error: {msg}")
		import traceback
		traceback.print_exc()
		if "gym_problem_reports" in msg:
			return jsonify({"error": "Problem reports table missing. Run create_gym_problem_reports_table.sql"}), 500
		return jsonify({"error": f"Failed to process problem reports: {msg}"}), 500


@app.route("/api/gym/problem-reports/mark-read", methods=["POST", "OPTIONS"])
def mark_gym_problem_reports_read():
	"""Mark one or all open problem reports as read for the current gym account."""
	if request.method == "OPTIONS":
		return jsonify({}), 200

	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500

	auth_header = request.headers.get("Authorization")
	if not auth_header or not auth_header.startswith("Bearer "):
		return jsonify({"error": "Authentication required"}), 401

	access_token = auth_header.replace("Bearer ", "").strip()
	if not access_token:
		return jsonify({"error": "Missing access token"}), 401

	SUPABASE_URL = os.getenv("SUPABASE_URL")
	SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
	SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
	if not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_SERVICE_ROLE_KEY:
		return jsonify({"error": "Supabase configuration missing"}), 500

	try:
		supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
		user_response = supabase_client.auth.get_user(access_token)
		if not user_response.user:
			return jsonify({"error": "Invalid token"}), 401

		user = user_response.user
		user_id = user.id
		user_meta = user.user_metadata or {}
		if user_meta.get("is_gym_account") != True or user_meta.get("is_verified") != True:
			return jsonify({"error": "Only verified gym accounts can perform this action"}), 403

		data = request.get_json() or {}
		report_id = (data.get("report_id") or "").strip()
		gym_name = (user_meta.get("gym_name") or "").strip()
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
		update_payload = {"is_read": True, "updated_at": datetime.now().isoformat()}

		query = admin_client.table("gym_problem_reports").update(update_payload).eq("status", "open").eq("gym_id", user_id)
		if report_id:
			query = query.eq("id", report_id)
		query.execute()

		# Backwards compatible fallback when older records don't have gym_id populated
		if gym_name:
			fallback_query = admin_client.table("gym_problem_reports").update(update_payload).eq("status", "open").eq("gym_name", gym_name)
			if report_id:
				fallback_query = fallback_query.eq("id", report_id)
			fallback_query.execute()

		return jsonify({"success": True}), 200
	except Exception as e:
		msg = str(e)
		print(f"[GYM REPORTS] Mark-read error: {msg}")
		import traceback
		traceback.print_exc()
		if "gym_problem_reports" in msg:
			return jsonify({"error": "Problem reports table missing. Run create_gym_problem_reports_table.sql"}), 500
		return jsonify({"error": f"Failed to mark reports as read: {msg}"}), 500


@app.route("/api/gym/delete-account", methods=["POST", "OPTIONS"])
def delete_gym_account():
	"""
	Delete a gym account.
	Only the account owner can delete their own account.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500
	
	# Get Authorization header
	auth_header = request.headers.get("Authorization")
	if not auth_header or not auth_header.startswith("Bearer "):
		return jsonify({"error": "Authentication required"}), 401
	
	access_token = auth_header.replace("Bearer ", "").strip()
	if not access_token:
		return jsonify({"error": "Missing access token"}), 401
	
	try:
		SUPABASE_URL = os.getenv("SUPABASE_URL")
		SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
		SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
		if not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_SERVICE_ROLE_KEY:
			return jsonify({"error": "Supabase configuration missing"}), 500

		# Verify user and get user info
		supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
		user_response = supabase_client.auth.get_user(access_token)
		
		if not user_response.user:
			return jsonify({"error": "Invalid token"}), 401
		
		user_id = user_response.user.id
		user_meta = user_response.user.user_metadata or {}
		
		# Verify this is a gym account
		if user_meta.get("is_gym_account") != True:
			return jsonify({"error": "This endpoint is only for gym accounts"}), 403
		
		# Use service role key to delete the user
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
		
		# IMPORTANT: Delete all data associated with this gym account BEFORE deleting the user
		# This ensures GDPR compliance - right to be forgotten
		
		# 1. Delete all gym_analytics data where gym_id points to this account
		try:
			delete_analytics = admin_client.table("gym_analytics").delete().eq("gym_id", user_id).execute()
			print(f"[GYM DELETE] Deleted gym_analytics data for gym_id: {user_id}")
		except Exception as e:
			print(f"[GYM DELETE] Warning: Could not delete gym_analytics data: {e}")
		
		# 2. Unlink all gym_analytics data where user_id points to this account (set gym_id to NULL)
		# This handles cases where users had this gym linked but the gym account is being deleted
		try:
			unlink_analytics = admin_client.table("gym_analytics").update({"gym_id": None}).eq("gym_id", user_id).execute()
			print(f"[GYM DELETE] Unlinked gym_analytics data for gym_id: {user_id}")
		except Exception as e:
			print(f"[GYM DELETE] Warning: Could not unlink gym_analytics data: {e}")
		
		# 3. Delete user from Supabase auth (this will cascade delete from other tables with ON DELETE CASCADE)
		delete_response = admin_client.auth.admin.delete_user(user_id)
		
		print(f"[GYM DELETE] Account and all associated data deleted: {user_id}")
		
		return jsonify({"success": True, "message": "Gym account and all associated data deleted successfully"}), 200
		
	except Exception as e:
		print(f"[GYM DELETE] Error deleting gym account: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": f"Failed to delete account: {str(e)}"}), 500


@app.route("/api/gym/update-metadata", methods=["POST", "OPTIONS"])
def update_gym_metadata():
	"""
	Update user metadata to mark account as gym account.
	User must already be created via Supabase signUp (frontend).
	This endpoint only updates metadata, doesn't create users.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500
	
	try:
		data = request.get_json()
		user_id = data.get("user_id")  # User ID from signUp response
		gym_name = data.get("gym_name")
		contact_name = data.get("contact_name", "")
		contact_phone = data.get("contact_phone", "")
		
		if not user_id or not gym_name:
			return jsonify({"error": "User ID and gym name are required"}), 400
		
		SUPABASE_URL = os.getenv("SUPABASE_URL")
		SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
		
		if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
			return jsonify({"error": "Supabase configuration missing"}), 500
		
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
		
		# Get current metadata
		try:
			user_detail = admin_client.auth.admin.get_user_by_id(user_id)
			current_meta = {}
			if user_detail and hasattr(user_detail, 'user') and user_detail.user:
				current_meta = getattr(user_detail.user, 'user_metadata', {}) or getattr(user_detail.user, 'raw_user_meta_data', {}) or {}
		except Exception as e:
			print(f"[GYM UPDATE] Error getting user: {e}")
			return jsonify({"error": "User not found"}), 404
		
		# Update metadata
		updated_meta = current_meta.copy() if current_meta else {}
		updated_meta.update({
			"is_gym_account": True,
			"gym_name": gym_name.strip(),
			"contact_name": contact_name.strip(),
			"contact_phone": contact_phone.strip(),
			"is_verified": False
		})
		
		try:
			admin_client.auth.admin.update_user_by_id(user_id, {
				"user_metadata": updated_meta
			})
			print(f"[GYM UPDATE] Successfully updated metadata for user {user_id}")
			return jsonify({
				"success": True,
				"message": "Gym account metadata updated successfully"
			}), 200
		except Exception as update_error:
			print(f"[GYM UPDATE] Error updating metadata: {update_error}")
			import traceback
			traceback.print_exc()
			return jsonify({"error": f"Failed to update metadata: {str(update_error)}"}), 500
		
	except Exception as e:
		print(f"[GYM UPDATE] Error: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": f"Failed to update gym metadata: {str(e)}"}), 500


@app.route("/api/gym/register", methods=["POST", "OPTIONS"])
def register_gym_account():
	"""
	DEPRECATED: This endpoint is no longer used.
	Gym accounts are now created via Supabase signUp (frontend) and metadata is updated via /api/gym/update-metadata
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	return jsonify({"error": "This endpoint is deprecated. Use Supabase signUp instead."}), 410


@app.route("/api/admin/debug-gym-accounts", methods=["GET", "OPTIONS"])
def debug_gym_accounts():
	"""
	Debug endpoint to check what gym accounts exist and their metadata.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500
	
	try:
		SUPABASE_URL = os.getenv("SUPABASE_URL")
		SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
		
		if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
			return jsonify({"error": "Supabase configuration missing"}), 500
		
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
		
		# Try to get users with better error handling
		all_users = None
		users_list = []
		
		try:
			all_users = admin_client.auth.admin.list_users()
			print(f"[DEBUG] list_users() response type: {type(all_users)}")
			print(f"[DEBUG] list_users() response dir: {[x for x in dir(all_users) if not x.startswith('_')][:20]}")
			
			# Try multiple ways to access users
			if hasattr(all_users, 'users'):
				users_list = all_users.users
				print(f"[DEBUG] Found {len(users_list)} users via .users")
			elif hasattr(all_users, 'data'):
				users_list = all_users.data
				print(f"[DEBUG] Found {len(users_list)} users via .data")
			elif isinstance(all_users, dict):
				users_list = all_users.get('users', []) or all_users.get('data', [])
				print(f"[DEBUG] Found {len(users_list)} users via dict")
			elif hasattr(all_users, 'model_dump'):
				data = all_users.model_dump()
				users_list = data.get('users', []) or data.get('data', [])
				print(f"[DEBUG] Found {len(users_list)} users via model_dump")
			elif hasattr(all_users, '__dict__'):
				data = all_users.__dict__
				users_list = data.get('users', []) or data.get('data', [])
				print(f"[DEBUG] Found {len(users_list)} users via __dict__")
			else:
				try:
					users_list = list(all_users) if all_users else []
					print(f"[DEBUG] Found {len(users_list)} users via list()")
				except:
					print("[DEBUG] Could not convert to list")
			
			# Try with pagination if empty
			if not users_list:
				print("[DEBUG] Trying with pagination...")
				try:
					all_users_paged = admin_client.auth.admin.list_users(page=1, per_page=1000)
					if hasattr(all_users_paged, 'users'):
						users_list = all_users_paged.users
						print(f"[DEBUG] Found {len(users_list)} users via pagination .users")
					elif hasattr(all_users_paged, 'data'):
						users_list = all_users_paged.data
						print(f"[DEBUG] Found {len(users_list)} users via pagination .data")
				except Exception as page_e:
					print(f"[DEBUG] Pagination failed: {page_e}")
			
			if not users_list:
				print(f"[DEBUG] WARNING: No users found. Response: {repr(all_users)[:200]}")
		except Exception as e:
			print(f"[DEBUG] Error getting users: {e}")
			import traceback
			traceback.print_exc()
			users_list = []
		
		debug_info = {
			"total_users": len(users_list),
			"users_with_metadata": [],
			"gym_accounts_found": []
		}
		
		for user in users_list[:50]:  # Check first 50 users
			try:
				user_id = getattr(user, 'id', None) or (user.get('id') if isinstance(user, dict) else None)
				user_email = getattr(user, 'email', None) or (user.get('email') if isinstance(user, dict) else 'unknown')
				
				# Get full user details
				user_detail = admin_client.auth.admin.get_user_by_id(user_id)
				user_obj = user_detail.user if hasattr(user_detail, 'user') else None
				
				user_meta = {}
				if user_obj:
					if hasattr(user_obj, 'user_metadata') and user_obj.user_metadata:
						user_meta = user_obj.user_metadata
					elif hasattr(user_obj, 'raw_user_meta_data') and user_obj.raw_user_meta_data:
						user_meta = user_obj.raw_user_meta_data
				
				if user_meta:
					is_gym_value = user_meta.get("is_gym_account")
					is_gym = is_gym_value == True or is_gym_value == "true" or str(is_gym_value).lower() == "true"
					
					debug_info["users_with_metadata"].append({
						"email": user_email,
						"id": user_id,
						"metadata": user_meta,
						"is_gym_account_value": is_gym_value,
						"is_gym_account_type": str(type(is_gym_value)),
						"is_gym": is_gym
					})
					
					if is_gym:
						debug_info["gym_accounts_found"].append({
							"email": user_email,
							"id": user_id,
							"gym_name": user_meta.get("gym_name"),
							"is_verified": user_meta.get("is_verified"),
							"metadata": user_meta
						})
			except Exception as e:
				continue
		
		return jsonify(debug_info), 200
	except Exception as e:
		return jsonify({"error": str(e)}), 500
@app.route("/api/gym/dashboard", methods=["GET", "OPTIONS"])
def get_gym_dashboard():
	"""
	Get dashboard data for a gym account.
	Returns statistics about users linked to this gym.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500
	
	# Get Authorization header
	auth_header = request.headers.get("Authorization")
	if not auth_header or not auth_header.startswith("Bearer "):
		return jsonify({"error": "Authentication required"}), 401
	
	access_token = auth_header.replace("Bearer ", "").strip()
	
	try:
		SUPABASE_URL = os.getenv("SUPABASE_URL")
		SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
		SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
		
		if not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_SERVICE_ROLE_KEY:
			return jsonify({"error": "Supabase configuration missing"}), 500
		
		# Verify user
		supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
		user_response = supabase_client.auth.get_user(access_token)
		
		if not user_response.user:
			return jsonify({"error": "Invalid token"}), 401
		
		user_metadata = user_response.user.user_metadata or {}
		
		# Check if this is a gym account
		if user_metadata.get("is_gym_account") != True:
			return jsonify({"error": "This endpoint is only available for gym accounts"}), 403
		
		# SECURITY: Only verified gym accounts can access data
		# This prevents unauthorized access - gym accounts must be verified by admin first
		if user_metadata.get("is_verified") != True:
			return jsonify({
				"error": "Gym account not verified",
				"message": "Your gym account needs to be verified by an administrator before you can access dashboard data. Please contact support."
			}), 403
		
		gym_id = user_response.user.id
		gym_name = user_metadata.get("gym_name", "Unknown")
		is_premium = user_metadata.get("is_premium", False) == True  # Premium accounts get full data access
		period = (request.args.get("period") or "week").lower().strip()
		if period not in ("week", "month", "year", "all"):
			period = "week"
		lookback_days = 7 if period == "week" else 30 if period == "month" else 365 if period == "year" else None
		
		# Get date parameter (YYYY-MM-DD format) - if provided, show data for that specific date
		selected_date = request.args.get("date")
		selected_date_obj = None
		if selected_date:
			try:
				# Validate date format
				selected_date_obj = datetime.fromisoformat(selected_date).date()
				selected_date = selected_date_obj.isoformat()
			except:
				selected_date = None
				selected_date_obj = None
		
		# Get analytics data for this gym
		admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

		# Backfill: if users already have consent + matching gym_name but weren't linked (e.g., older sync bug),
		# link them now so the dashboard isn't empty.
		try:
			unlinked = admin_client.table("gym_analytics").select("user_id,gym_name,gym_id,data_collection_consent").eq("data_collection_consent", True).execute()
			target = (gym_name or "").lower().strip()
			if unlinked.data and target:
				for row in unlinked.data:
					if row.get("gym_id"):
						continue
					row_gym = (row.get("gym_name") or "").lower().strip()
					if row_gym and row_gym == target:
						try:
							admin_client.table("gym_analytics").update({"gym_id": gym_id}).eq("user_id", row.get("user_id")).execute()
						except Exception:
							pass
		except Exception:
			pass
		
		# Get users linked to this gym (all), and the subset with consent
		analytics_all = admin_client.table("gym_analytics").select("*").eq("gym_id", gym_id).execute()
		analytics_consent = admin_client.table("gym_analytics").select("*").eq("gym_id", gym_id).eq("data_collection_consent", True).execute()
		
		# Calculate statistics
		# If a specific date is selected, only count users that were linked to the gym up to and including that date
		if selected_date:
			try:
				# Make timezone-aware (UTC) to match linked_at
				selected_date_end = datetime.combine(selected_date_obj, datetime.max.time()).replace(tzinfo=timezone.utc)
				total_users = 0
				users_with_consent = 0
				if analytics_all.data:
					for u in analytics_all.data:
						if not u.get("user_id"):
							continue
						# Use gym_analytics.created_at (when user was linked to gym), not account creation date
						linked_at = None
						if u.get("created_at"):
							try:
								linked_at = datetime.fromisoformat(u.get("created_at").replace('Z', '+00:00'))
							except:
								pass
						
						# Count user if they were linked to gym on or before selected date
						if linked_at:
							if linked_at <= selected_date_end:
								total_users += 1
								# Check if user has consent
								if u.get("data_collection_consent") == True:
									users_with_consent += 1
							# If linked_at is after selected_date, don't count (user wasn't linked yet)
						else:
							# If no linked_at date, don't count (we can't determine when they were linked)
							pass
				users_linked = total_users
				print(f"[GYM DASHBOARD] Users for date {selected_date}: total={total_users}, with_consent={users_with_consent}")
			except Exception as e:
				print(f"[GYM DASHBOARD] Error calculating users for date {selected_date}: {e}")
				import traceback
				traceback.print_exc()
				# Fallback to normal calculation if date parsing fails
				total_users = len(analytics_all.data) if analytics_all.data else 0
				users_with_consent = len(analytics_consent.data) if analytics_consent.data else 0
				users_linked = total_users
		else:
			total_users = len(analytics_all.data) if analytics_all.data else 0
			users_with_consent = len(analytics_consent.data) if analytics_consent.data else 0
			users_linked = total_users  # same as total users for this gym_id
		
		# Calculate previous period comparisons (for KPI cards)
		now = datetime.now(timezone.utc)
		comparison_data = {
			"yesterday": {"users": 0, "workouts": 0, "exercises": 0},
			"last_week": {"users": 0, "workouts": 0, "exercises": 0},
			"last_month": {"users": 0, "workouts": 0, "exercises": 0}
		}
		
		# Get user creation dates from auth.users (more accurate than gym_analytics.created_at)
		user_creation_dates = {}
		if analytics_all.data:
			user_ids = [u.get("user_id") for u in analytics_all.data if u.get("user_id")]
			if user_ids:
				try:
					# Get user creation dates from auth.users
					all_users = admin_client.auth.admin.list_users()
					users_list = getattr(all_users, "data", None) or getattr(all_users, "users", None) or []
					for auth_user in users_list:
						if auth_user.id in user_ids:
							# Use created_at from auth.users (when the account was created)
							user_creation_dates[auth_user.id] = auth_user.created_at
				except Exception as e:
					print(f"[GYM DASHBOARD] Error fetching user creation dates: {e}")
		
		# Initialize comparison data - will be filled when we process workouts
		# Users: count total users up to and including the comparison period
		# For "yesterday", we want users that existed at the end of yesterday (before today)
		today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
		if analytics_all.data:
			# Yesterday: total users whose accounts were created before today started
			yesterday_users_count = 0
			for u in analytics_all.data:
				if not u.get("user_id"):
					continue
				user_id = u.get("user_id")
				# Use actual user creation date from auth.users if available
				if user_id in user_creation_dates:
					try:
						created_str = user_creation_dates[user_id].replace('Z', '+00:00')
						created = datetime.fromisoformat(created_str)
						if created < today_start:
							yesterday_users_count += 1
					except:
						pass
				else:
					# Fallback: use gym_analytics.created_at (less accurate)
					if u.get("created_at"):
						try:
							created_str = u.get("created_at").replace('Z', '+00:00')
							created = datetime.fromisoformat(created_str)
							if created < today_start:
								yesterday_users_count += 1
						except:
							pass
					else:
						# If no created_at, assume old user (count it as existing yesterday)
						yesterday_users_count += 1
			comparison_data["yesterday"]["users"] = yesterday_users_count
			print(f"[GYM DASHBOARD] Yesterday users comparison: {comparison_data['yesterday']['users']} (total users: {total_users})")
		
		# Get recent users (last 10) - only users with consent
		recent_users = []
		if analytics_consent.data:
			sorted_users = sorted(analytics_consent.data, key=lambda x: x.get("created_at", ""), reverse=True)[:10]
			recent_users = [
				{
					"user_id": user.get("user_id"),
					"gym_name": user.get("gym_name"),
					"consent_given_at": user.get("consent_given_at"),
					"created_at": user.get("created_at")
				}
				for user in sorted_users
			]
		
		# Get monthly growth (users per month) - only users with consent
		monthly_growth = {}
		if analytics_consent.data:
			for user in analytics_consent.data:
				created_at = user.get("created_at")
				if created_at:
					try:
						date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
						month_key = date.strftime("%Y-%m")
						monthly_growth[month_key] = monthly_growth.get(month_key, 0) + 1
					except:
						pass
		
		# ===== Workout analytics for charts (only users with consent) =====
		def _count_sets(ex_obj: dict) -> int:
			sets = ex_obj.get("sets")
			if not isinstance(sets, list):
				return 0
			count = 0
			for s in sets:
				if not isinstance(s, dict):
					continue
				# Strength set
				w = s.get("weight", "")
				r = s.get("reps", "")
				# Cardio set
				mins = s.get("min", "")
				secs = s.get("sec", "")
				km = s.get("km", "")
				cal = s.get("cal", "")
				if (w not in ("", None) or r not in ("", None)) or (mins not in ("", None) or secs not in ("", None) or km not in ("", None) or cal not in ("", None)):
					count += 1
			return count

		def _exercise_display(ex_obj: dict) -> str:
			key = ex_obj.get("key") or ""
			if key and key in MACHINE_METADATA:
				return str(MACHINE_METADATA[key].get("display") or key)
			return str(ex_obj.get("display") or key or "Exercise")

		def _exercise_muscles(ex_obj: dict) -> List[str]:
			# Prefer MACHINE_METADATA by key; else any muscles already present
			key = ex_obj.get("key") or ""
			if key and key in MACHINE_METADATA:
				muscles = MACHINE_METADATA[key].get("muscles") or []
				return normalize_muscles(muscles) if isinstance(muscles, list) else []
			m = ex_obj.get("muscles") or []
			return normalize_muscles(m) if isinstance(m, list) else []

		chart = {
			"top_machines_by_sets": [],
			"top_muscles_by_sets": [],
			"workouts_by_weekday": [],
			"workouts_by_day": [],
			"workouts_last_weeks": [],
			"volume_by_week": [],
			"active_users_by_week": [],
			"exercise_categories": []
		}

		try:
			consent_user_ids = []
			if analytics_consent.data:
				for row in analytics_consent.data:
					uid = row.get("user_id")
					if uid:
						consent_user_ids.append(uid)
			consent_user_ids = list(dict.fromkeys(consent_user_ids))  # de-dupe keep order

			if consent_user_ids:
				# For charts: always anchor period to selected_date when present, otherwise today (UTC)
				# For statistics: filter by selected_date if provided (cumulative up to that date)
				chart_start_date = None
				chart_end_date = None
				stats_end_date = None
				anchor_date = selected_date_obj if selected_date_obj else datetime.now(timezone.utc).date()
				
				# Charts always end at anchor_date
				chart_end_date = anchor_date.isoformat()
				# Charts use period filter (week/month/year). "all" keeps open start.
				if isinstance(lookback_days, int) and lookback_days > 0:
					chart_start_date = (anchor_date - timedelta(days=lookback_days - 1)).isoformat()
				
				# Statistics use selected_date if provided (cumulative: up to and including that date)
				if selected_date:
					stats_end_date = selected_date

				# Get all workouts for charts (use period filter for charts)
				all_workouts = []
				# Supabase has an IN limit; chunk
				for i in range(0, len(consent_user_ids), 50):
					chunk = consent_user_ids[i:i+50]
					# We want ONLY workouts saved with this gym. Prefer filtering by workouts.gym_name,
					# but keep backwards compatibility if the column doesn't exist yet.
					try:
						q = admin_client.table("workouts") \
							.select("user_id,date,inserted_at,created_at,exercises,gym_name,gym_place_id") \
							.in_("user_id", chunk)
						# Charts: use period filter
						if chart_start_date:
							q = q.gte("date", chart_start_date)
						if chart_end_date:
							q = q.lte("date", chart_end_date)
						res = q.execute()
					except Exception as e:
						# If gym_name column doesn't exist, we can't do per-workout gym analytics reliably.
						msg = str(e)
						if "gym_name" in msg or "gym_place_id" in msg:
							q = admin_client.table("workouts") \
								.select("user_id,date,inserted_at,created_at,exercises") \
								.in_("user_id", chunk)
							if chart_start_date:
								q = q.gte("date", chart_start_date)
							if chart_end_date:
								q = q.lte("date", chart_end_date)
							res = q.execute()
						else:
							raise
					if res.data:
						all_workouts.extend(res.data)
				
				# For statistics: if selected_date is provided, get ALL workouts up to that date (not just chart period)
				stats_workouts = []
				if stats_end_date:
					for i in range(0, len(consent_user_ids), 50):
						chunk = consent_user_ids[i:i+50]
						try:
							q = admin_client.table("workouts") \
								.select("user_id,date,exercises,gym_name,gym_place_id") \
								.in_("user_id", chunk) \
								.lte("date", stats_end_date)
							res = q.execute()
						except Exception as e:
							msg = str(e)
							if "gym_name" in msg or "gym_place_id" in msg:
								q = admin_client.table("workouts") \
									.select("user_id,date,exercises") \
									.in_("user_id", chunk) \
									.lte("date", stats_end_date)
								res = q.execute()
							else:
								raise
						if res.data:
							stats_workouts.extend(res.data)
				else:
					# No date filter: use all_workouts for statistics too
					stats_workouts = all_workouts

				machine_sets = {}
				muscle_sets = {}
				weekday_counts = {k: 0 for k in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
				hour_counts = {h: 0 for h in range(24)}
				week_counts = {}
				day_counts = {}
				# Per-weekday hourly data: { "Monday": { 0: count, 1: count, ... 23: count }, "Tuesday": {...}, ... }
				weekday_hour_counts = {day: {h: 0 for h in range(24)} for day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]}
				peak_times_from_sql = False
				top_machines_from_sql = False
				volume_by_week = {}  # Total kg per week (weight × reps × sets)
				active_users_by_week = {}  # Unique users per week
				cardio_sets = 0
				strength_sets = 0
				total_workouts = 0
				total_exercises = 0

				target_gym = (gym_name or "").lower().strip()

				# Step 1 optimization: compute peak times in SQL (Postgres) instead of Python loops.
				# Falls back to existing Python logic if RPC is not available yet.
				try:
					peak_res = admin_client.rpc(
						"get_gym_peak_times",
						{
							"p_user_ids": consent_user_ids,
							"p_gym_name": gym_name,
							"p_start_date": chart_start_date,
							"p_end_date": chart_end_date,
						},
					).execute()
					peak_rows = peak_res.data or []
					for row in peak_rows:
						weekday_name = str(row.get("weekday_name") or "").strip()
						hour_val = row.get("hour")
						count_val = row.get("workout_count") or 0
						try:
							hour = int(hour_val)
							count = int(count_val)
						except Exception:
							continue
						if hour < 0 or hour > 23 or count < 0:
							continue
						hour_counts[hour] = hour_counts.get(hour, 0) + count
						if weekday_name in weekday_hour_counts:
							weekday_hour_counts[weekday_name][hour] = weekday_hour_counts[weekday_name].get(hour, 0) + count
					if peak_rows:
						peak_times_from_sql = True
				except Exception as e:
					print(f"[GYM DASHBOARD] Peak times SQL RPC unavailable, falling back to Python: {e}")

				# Step 2 optimization: compute top machines in SQL (Postgres) instead of Python loops.
				# Falls back to existing Python logic if RPC is not available yet.
				try:
					machines_res = admin_client.rpc(
						"get_gym_top_machines",
						{
							"p_user_ids": consent_user_ids,
							"p_gym_name": gym_name,
							"p_start_date": chart_start_date,
							"p_end_date": chart_end_date,
						},
					).execute()
					machine_rows = machines_res.data or []
					machine_sets = {}
					for row in machine_rows:
						label = str(row.get("label") or "").strip()
						value = row.get("value") or 0
						if not label:
							continue
						try:
							sets_count = int(value)
						except Exception:
							continue
						if sets_count <= 0:
							continue
						machine_sets[label] = sets_count
					top_machines_from_sql = True
				except Exception as e:
					print(f"[GYM DASHBOARD] Top machines SQL RPC unavailable, falling back to Python: {e}")
			
				# Process workouts for charts (all_workouts)
				for w in all_workouts:
					# Filter to workouts that were actually saved with this gym (snapshot on the workout).
					w_gym = (w.get("gym_name") or "").lower().strip()
					
					# CRITICAL: Only use workouts where gym_name is actually set (not "gym -" or empty)
					# Skip workouts without a gym name or with "gym -"
					if not w_gym or w_gym == "-" or w_gym == "gym -":
						continue
					
					# If gym_name is present, it must match the target gym
					if w_gym and target_gym and w_gym != target_gym:
						continue

					# Parse workout date for charts
					date_str = w.get("date")
					dt = None
					try:
						# date is stored as YYYY-MM-DD
						dt = datetime.fromisoformat(str(date_str))
					except Exception:
						# fallback
						try:
							dt = datetime.fromisoformat(str(date_str).split("T")[0])
						except Exception:
							dt = None
					if dt:
						day_key = dt.strftime("%Y-%m-%d")
						day_counts[day_key] = day_counts.get(day_key, 0) + 1
						weekday = dt.strftime("%a")
						if weekday in weekday_counts:
							weekday_counts[weekday] += 1
						iso_year, iso_week, _ = dt.isocalendar()
						week_key = f"{iso_year}-W{iso_week:02d}"
						week_counts[week_key] = week_counts.get(week_key, 0) + 1
						# Track active users per week
						user_id = w.get("user_id")
						if user_id and week_key not in active_users_by_week:
							active_users_by_week[week_key] = set()
						if user_id:
							active_users_by_week[week_key].add(user_id)

					# Peak hours fallback path (only when SQL RPC is not available yet).
					if not peak_times_from_sql:
						inserted = w.get("inserted_at") or w.get("created_at")
						dti = None
						if inserted:
							try:
								ts = str(inserted).replace("Z", "+00:00")
								dti = datetime.fromisoformat(ts)
								try:
									from zoneinfo import ZoneInfo  # py3.9+
									dti = dti.astimezone(ZoneInfo("Europe/Amsterdam"))
								except Exception:
									pass
							except Exception:
								pass
						
						# Fallback to workout date if no timestamp available
						if not dti and dt:
							dti = dt.replace(hour=12, minute=0, second=0, microsecond=0)  # Use noon as default time
						
						if dti:
							hour = int(dti.hour)
							hour_counts[hour] = hour_counts.get(hour, 0) + 1
							# Track per weekday using workout.date (dt) to stay consistent with workouts_by_weekday
							weekday_name = dt.strftime("%A") if dt else dti.strftime("%A")
							if weekday_name in weekday_hour_counts:
								weekday_hour_counts[weekday_name][hour] = weekday_hour_counts[weekday_name].get(hour, 0) + 1

					# Process exercises for charts (all workouts)
					exercises = w.get("exercises") or []
					if not isinstance(exercises, list):
						continue
					
					# Calculate volume for this workout (for volume_by_week)
					workout_volume = 0
					workout_week_key = week_key if dt else None
					
					for ex in exercises:
						if not isinstance(ex, dict):
							continue
						sets_n = _count_sets(ex)
						if sets_n <= 0:
							continue
						if not top_machines_from_sql:
							name = _exercise_display(ex)
							machine_sets[name] = machine_sets.get(name, 0) + sets_n
						
						# Calculate volume (weight × reps) for strength exercises
						sets = ex.get("sets") or []
						if isinstance(sets, list):
							for s in sets:
								if not isinstance(s, dict):
									continue
								weight = s.get("weight")
								reps = s.get("reps")
								# Check if it's a strength exercise (has weight and reps)
								if weight not in ("", None) and reps not in ("", None):
									try:
										w_kg = float(str(weight).replace(",", "."))
										r = int(str(reps))
										if w_kg > 0 and r > 0:
											workout_volume += w_kg * r
									except (ValueError, TypeError):
										pass
						
						# Muscle focus: ONLY count the PRIMARY muscle for each exercise (not every listed muscle)
						muscles = _exercise_muscles(ex) or []
						primary = muscles[0] if muscles else ""
						if primary and primary != "-" and primary.lower() != "cardio":
							# Normalize muscle name: capitalize first letter, lowercase rest (consistent with app)
							normalized_muscle = primary.capitalize()
							muscle_sets[normalized_muscle] = muscle_sets.get(normalized_muscle, 0) + sets_n
						elif not primary or primary == "-":
							# Debug: log exercises without primary muscle
							ex_key = ex.get("key") or ex.get("display") or "unknown"
							if ex_key not in ["cardio", "-"]:
								print(f"[GYM DASHBOARD] Exercise {ex_key} has no primary muscle. Muscles: {muscles}")
						
						# Count Cardio vs Strength sets
						# First, check if the exercise itself is cardio based on metadata
						ex_key = ex.get("key") or ""
						ex_muscles = _exercise_muscles(ex) or []
						is_exercise_cardio = False
						if ex_key and ex_key in MACHINE_METADATA:
							meta_muscles = MACHINE_METADATA[ex_key].get("muscles") or []
							# Check if "Cardio" is in the muscles list
							is_exercise_cardio = any(m.lower() == "cardio" for m in meta_muscles if isinstance(m, str))
						elif ex_muscles:
							# Check if "Cardio" is in the exercise's muscles
							is_exercise_cardio = any(m.lower() == "cardio" for m in ex_muscles if isinstance(m, str))
						
						sets_list = ex.get("sets") or []
						if isinstance(sets_list, list):
							for s in sets_list:
								if not isinstance(s, dict):
									continue
								# Check if it's cardio (has min/sec/km/cal) OR exercise is marked as cardio
								has_cardio_fields = any(s.get(k) not in ("", None) for k in ["min", "sec", "km", "cal"])
								has_strength_fields = s.get("weight") not in ("", None) and s.get("reps") not in ("", None)
								
								# If exercise is marked as cardio, count as cardio
								if is_exercise_cardio:
									cardio_sets += 1
								# Otherwise, check set fields
								elif has_cardio_fields:
									cardio_sets += 1
								elif has_strength_fields:
									strength_sets += 1
					
					# Add volume to week
					if workout_week_key and workout_volume > 0:
						volume_by_week[workout_week_key] = volume_by_week.get(workout_week_key, 0) + workout_volume

				# Calculate statistics (workouts and exercises) from stats_workouts
				# This is separate from charts to ensure we count ALL workouts up to selected_date
				for w in stats_workouts:
					# Filter to workouts that were actually saved with this gym
					w_gym = (w.get("gym_name") or "").lower().strip()
					
					# CRITICAL: Only use workouts where gym_name is actually set (not "gym -" or empty)
					if not w_gym or w_gym == "-" or w_gym == "gym -":
						continue
					
					# If gym_name is present, it must match the target gym
					if w_gym and target_gym and w_gym != target_gym:
						continue
					
					# Count workout and exercises for statistics
					total_workouts += 1
					exercises = w.get("exercises") or []
					if isinstance(exercises, list):
						total_exercises += len(exercises)

				top_machines = sorted(machine_sets.items(), key=lambda kv: kv[1], reverse=True)  # Show all machines
				top_muscles = sorted(muscle_sets.items(), key=lambda kv: kv[1], reverse=True)  # Show all muscles, not just top 8
				print(f"[GYM DASHBOARD] Total unique muscles found: {len(top_muscles)}")
				if len(top_muscles) > 0:
					print(f"[GYM DASHBOARD] Top 10 muscles: {top_muscles[:10]}")

				# last 8 weeks (sorted)
				last_weeks = sorted(week_counts.items(), key=lambda kv: kv[0])[-8:]

				chart["top_machines_by_sets"] = [{"label": k, "value": v} for k, v in top_machines]
				chart["top_muscles_by_sets"] = [{"label": k, "value": v} for k, v in top_muscles]
				chart["workouts_by_weekday"] = [{"label": k, "value": weekday_counts[k]} for k in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]]
				chart["workouts_by_hour"] = [{"label": f"{h:02d}:00", "value": hour_counts.get(h, 0)} for h in range(24)]
				# Per-weekday hourly data: convert to format { "Monday": [{"label": "00:00", "value": count}, ...], "Tuesday": [...], ... }
				chart["workouts_by_day_hour"] = {
					weekday: [{"label": f"{h:02d}:00", "value": hours.get(h, 0)} for h in range(24)]
					for weekday, hours in weekday_hour_counts.items()
				}
				print(f"[GYM DASHBOARD] workouts_by_day_hour: {len(chart['workouts_by_day_hour'])} weekdays with hourly data")
				
				# Volume by week (last 8 weeks, sorted)
				sorted_weeks = sorted(volume_by_week.items(), key=lambda kv: kv[0])[-8:]
				chart["volume_by_week"] = [{"label": k, "value": round(v, 1)} for k, v in sorted_weeks]
				
				# Active users by week (last 8 weeks, sorted)
				active_users_weekly = {k: len(v) for k, v in active_users_by_week.items()}
				sorted_active_weeks = sorted(active_users_weekly.items(), key=lambda kv: kv[0])[-8:]
				chart["active_users_by_week"] = [{"label": k, "value": v} for k, v in sorted_active_weeks]
				
				# Exercise categories (Cardio vs Strength)
				total_category_sets = cardio_sets + strength_sets
				print(f"[GYM DASHBOARD] Exercise categories: cardio_sets={cardio_sets}, strength_sets={strength_sets}, total={total_category_sets}")
				if total_category_sets > 0:
					chart["exercise_categories"] = [
						{"label": "Strength", "value": strength_sets},
						{"label": "Cardio", "value": cardio_sets}
					]
					print(f"[GYM DASHBOARD] Exercise categories data: {chart['exercise_categories']}")
				else:
					chart["exercise_categories"] = []
					print(f"[GYM DASHBOARD] No exercise categories data (total_sets=0)")
				# Daily time series for line chart (X = days)
				try:
					end_d = datetime.now(timezone.utc).date()
					# Use selected period; for "all" show last 365 days (still "all days" on the x-axis)
					span_days = lookback_days if isinstance(lookback_days, int) and lookback_days > 0 else 365
					start_d = end_d - timedelta(days=span_days - 1)
					series = []
					d = start_d
					while d <= end_d:
						k = d.isoformat()
						series.append({"label": k, "value": int(day_counts.get(k, 0))})
						d += timedelta(days=1)
					chart["workouts_by_day"] = series
				except Exception:
					chart["workouts_by_day"] = []
				chart["workouts_last_weeks"] = [{"label": k, "value": v} for k, v in last_weeks]

				# expose KPIs (same period as charts)
				kpi_total_workouts = total_workouts
				kpi_total_exercises = total_exercises
				
				# Calculate previous period comparisons for workouts and exercises
				# For "yesterday" comparison, we need to compare TODAY vs YESTERDAY (not total period)
				today_date = datetime.now(timezone.utc).date().isoformat()
				yesterday_date = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
				
				# Get TODAY's workouts and exercises for comparison
				today_workouts = []
				for i in range(0, len(consent_user_ids), 50):
					chunk = consent_user_ids[i:i+50]
					try:
						q = admin_client.table("workouts") \
							.select("user_id,date,exercises,gym_name") \
							.in_("user_id", chunk) \
							.eq("date", today_date)
						res = q.execute()
						if res.data:
							today_workouts.extend(res.data)
					except Exception as e:
						print(f"[GYM DASHBOARD] Error fetching today workouts: {e}")
				
				# Filter today's workouts to matching gym
				today_workouts_filtered = [
					w for w in today_workouts
					if (w.get("gym_name") or "").lower().strip() == target_gym
					and (w.get("gym_name") or "").lower().strip() not in ("", "-", "gym -")
				]
				today_workouts_count = len(today_workouts_filtered)
				today_exercises_count = sum([len(w.get("exercises") or []) for w in today_workouts_filtered])
				
				# Get YESTERDAY's workouts and exercises for comparison
				yesterday_workouts = []
				for i in range(0, len(consent_user_ids), 50):
					chunk = consent_user_ids[i:i+50]
					try:
						q = admin_client.table("workouts") \
							.select("user_id,date,exercises,gym_name") \
							.in_("user_id", chunk) \
							.eq("date", yesterday_date)
						res = q.execute()
						if res.data:
							yesterday_workouts.extend(res.data)
					except Exception as e:
						print(f"[GYM DASHBOARD] Error fetching yesterday workouts: {e}")
				
				# Filter yesterday's workouts to matching gym
				yesterday_workouts_filtered = [
					w for w in yesterday_workouts
					if (w.get("gym_name") or "").lower().strip() == target_gym
					and (w.get("gym_name") or "").lower().strip() not in ("", "-", "gym -")
				]
				comparison_data["yesterday"]["workouts"] = len(yesterday_workouts_filtered)
				comparison_data["yesterday"]["exercises"] = sum([
					len(w.get("exercises") or [])
					for w in yesterday_workouts_filtered
				])
				
				# Store today's counts for "yesterday" comparison
				# We'll use these when the comparison is "yesterday"
				today_counts = {
					"workouts": today_workouts_count,
					"exercises": today_exercises_count
				}
				print(f"[GYM DASHBOARD] Today vs Yesterday: today={today_workouts_count} workouts ({today_exercises_count} exercises), yesterday={comparison_data['yesterday']['workouts']} workouts ({comparison_data['yesterday']['exercises']} exercises)")
				
				# Last week: same period but 7 days ago
				if lookback_days:
					last_week_start = (datetime.now(timezone.utc) - timedelta(days=lookback_days + 7)).date().isoformat()
					last_week_end = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
					last_week_workouts = [
						w for w in all_workouts
						if last_week_start <= w.get("date", "") <= last_week_end
						and (w.get("gym_name") or "").lower().strip() == target_gym
						and (w.get("gym_name") or "").lower().strip() not in ("", "-", "gym -")
					]
					comparison_data["last_week"]["workouts"] = len(last_week_workouts)
					comparison_data["last_week"]["exercises"] = sum([len(w.get("exercises") or []) for w in last_week_workouts])
				
				# Last month: same period but 30 days ago
				if lookback_days:
					last_month_start = (datetime.now(timezone.utc) - timedelta(days=lookback_days + 30)).date().isoformat()
					last_month_end = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
					last_month_workouts = [
						w for w in all_workouts
						if last_month_start <= w.get("date", "") <= last_month_end
						and (w.get("gym_name") or "").lower().strip() == target_gym
						and (w.get("gym_name") or "").lower().strip() not in ("", "-", "gym -")
					]
					comparison_data["last_month"]["workouts"] = len(last_month_workouts)
					comparison_data["last_month"]["exercises"] = sum([len(w.get("exercises") or []) for w in last_month_workouts])
				
				# Last week/month users: count total users up to and including those periods
				# Use the same user_creation_dates dict we created earlier
				if analytics_all.data and lookback_days:
					# Last week users: total users created up to and including the end of last week period
					last_week_user_end = now - timedelta(days=7)
					last_week_users_count = 0
					for u in analytics_all.data:
						if not u.get("user_id"):
							continue
						user_id = u.get("user_id")
						# Use actual user creation date from auth.users if available
						if user_id in user_creation_dates:
							try:
								created_str = user_creation_dates[user_id].replace('Z', '+00:00')
								created = datetime.fromisoformat(created_str)
								if created <= last_week_user_end:
									last_week_users_count += 1
							except:
								pass
						else:
							# Fallback: use gym_analytics.created_at
							if u.get("created_at"):
								try:
									created = datetime.fromisoformat(u.get("created_at").replace('Z', '+00:00'))
									if created <= last_week_user_end:
										last_week_users_count += 1
								except:
									pass
							else:
								# If no created_at, assume old user (count it)
								last_week_users_count += 1
					comparison_data["last_week"]["users"] = last_week_users_count
					
					# Last month users: total users created up to and including the end of last month period
					last_month_user_end = now - timedelta(days=30)
					last_month_users_count = 0
					for u in analytics_all.data:
						if not u.get("user_id"):
							continue
						user_id = u.get("user_id")
						# Use actual user creation date from auth.users if available
						if user_id in user_creation_dates:
							try:
								created_str = user_creation_dates[user_id].replace('Z', '+00:00')
								created = datetime.fromisoformat(created_str)
								if created <= last_month_user_end:
									last_month_users_count += 1
							except:
								pass
						else:
							# Fallback: use gym_analytics.created_at
							if u.get("created_at"):
								try:
									created = datetime.fromisoformat(u.get("created_at").replace('Z', '+00:00'))
									if created <= last_month_user_end:
										last_month_users_count += 1
								except:
									pass
							else:
								# If no created_at, assume old user (count it)
								last_month_users_count += 1
					comparison_data["last_month"]["users"] = last_month_users_count
			else:
				kpi_total_workouts = 0
				kpi_total_exercises = 0
		except Exception as e:
			print(f"[GYM DASHBOARD] Failed to build workout charts: {e}")
			kpi_total_workouts = 0
			kpi_total_exercises = 0

		# Build response based on premium status
		# Basic accounts: Only get basic statistics (users, workouts, exercises counts)
		# Premium accounts: Get full data including all charts and detailed analytics
		statistics = {
			"total_users": total_users,
			"total_workouts": kpi_total_workouts,
			"total_exercises": kpi_total_exercises,
			"users_with_consent": users_with_consent,
			"users_linked": users_linked,
			"period": period,
			"comparison": comparison_data
		}
		
		# Add today's counts for "yesterday" comparison (if available)
		if 'today_counts' in locals():
			statistics["today_counts"] = today_counts
			# For users, we compare TOTAL users today vs TOTAL users yesterday
			# (not just new users created today, because users are cumulative)
			# So today's users count is the total_users (all users that exist today)
			statistics["today_counts"]["users"] = total_users
		
		if is_premium:
			# Premium accounts get full access
			statistics["recent_users"] = recent_users
			statistics["monthly_growth"] = monthly_growth
			statistics["charts"] = chart
		else:
			# Basic accounts get limited data
			statistics["recent_users"] = []  # No recent users list
			statistics["monthly_growth"] = {}  # No monthly growth
			statistics["charts"] = {
				"top_machines_by_sets": chart.get("top_machines_by_sets", []),  # Show all machines
				"top_muscles_by_sets": chart.get("top_muscles_by_sets", []),  # Show all muscles
				"workouts_by_weekday": chart.get("workouts_by_weekday", []),  # Basic weekday chart
				"workouts_by_hour": chart.get("workouts_by_hour", []),  # Basic hour chart
				"workouts_by_day_hour": chart.get("workouts_by_day_hour", {}),  # Include day-specific hourly data
				"workouts_by_day": [],  # No daily time series
				"workouts_last_weeks": [],  # No weekly history
				"volume_by_week": [],  # No volume tracking
				"active_users_by_week": [],  # No active users tracking
				"exercise_categories": chart.get("exercise_categories", [])  # Include weights/cardio ratio for all accounts
			}
		
		return jsonify({
			"success": True,
			"gym_id": gym_id,
			"gym_name": gym_name,
			"is_premium": is_premium,
			"statistics": statistics
		}), 200
		
	except Exception as e:
		print(f"[GYM DASHBOARD] Error: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"error": f"Failed to get gym dashboard: {str(e)}"}), 500


@app.route("/api/gym/check", methods=["GET", "OPTIONS"])
def check_gym_account():
	"""
	Check if the current user is a gym account.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	if not SUPABASE_AVAILABLE:
		return jsonify({"error": "Supabase not available"}), 500
	
	# Get Authorization header
	auth_header = request.headers.get("Authorization")
	if not auth_header or not auth_header.startswith("Bearer "):
		return jsonify({"is_gym_account": False}), 200
	
	access_token = auth_header.replace("Bearer ", "").strip()
	
	try:
		SUPABASE_URL = os.getenv("SUPABASE_URL")
		SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
		
		if not SUPABASE_URL or not SUPABASE_ANON_KEY:
			return jsonify({"is_gym_account": False}), 200
		
		supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
		user_response = supabase_client.auth.get_user(access_token)
		
		if not user_response.user:
			return jsonify({"is_gym_account": False}), 200
		
		user_metadata = user_response.user.user_metadata or {}
		is_gym_account = user_metadata.get("is_gym_account") == True
		
		return jsonify({
			"is_gym_account": is_gym_account,
			"gym_name": user_metadata.get("gym_name") if is_gym_account else None
		}), 200
		
	except Exception as e:
		print(f"[GYM CHECK] Error: {e}")
		return jsonify({"is_gym_account": False}), 200


@app.route("/api/google-places-key", methods=["GET", "OPTIONS"])
def get_google_places_key():
	"""
	Get Google Places API key for frontend autocomplete.
	This endpoint returns the API key that should be restricted to specific domains/IPs in Google Cloud Console.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200
	
	# SECURITY: Do not expose the Google Places API key to the frontend.
	# Autocomplete is proxied through /api/gym-suggestions instead.
	return jsonify({"error": "This endpoint is disabled. Use /api/gym-suggestions."}), 410


def _google_places_get_json(base_url: str, params: dict) -> dict:
	"""Backend helper to call Google Places without exposing the API key to clients."""
	api_key = os.getenv("GOOGLE_PLACES_API_KEY")
	if not api_key:
		raise RuntimeError("Google Places API key not configured")
	params = {**params, "key": api_key}
	url = f"{base_url}?{urllib.parse.urlencode(params)}"
	req = urllib.request.Request(url, headers={"User-Agent": "GymVision-AI/1.0"})
	with urllib.request.urlopen(req, timeout=8) as resp:
		body = resp.read().decode("utf-8")
	return json.loads(body)


_gym_suggestions_requests: dict[str, list[float]] = defaultdict(list)
_gym_suggestions_cache: "OrderedDict[str, tuple[float, dict]]" = OrderedDict()
_GYM_SUGGESTIONS_CACHE_TTL_SECONDS = 300  # 5 minutes
_GYM_SUGGESTIONS_CACHE_MAX = 500
_GYM_SUGGESTIONS_RATE_WINDOW_SECONDS = 60
_GYM_SUGGESTIONS_RATE_MAX_REQUESTS = 30
_GYM_SUGGESTIONS_RATE_MAX_IPS = 2000


@app.route("/api/gym-suggestions", methods=["GET", "OPTIONS"])
def gym_suggestions():
	"""
	Backend-proxy for gym autocomplete suggestions (Google Places).
	Keeps the API key server-side and applies basic per-IP rate limiting.
	"""
	if request.method == "OPTIONS":
		return jsonify({}), 200

	q = (request.args.get("q") or "").strip()
	if len(q) < 2:
		return jsonify({"predictions": [], "status": "OK"}), 200

	# Cache (reduces Google billable calls; key is never exposed)
	cache_key = q.lower().strip()
	now_ts = time.time()
	cached = _gym_suggestions_cache.get(cache_key)
	if cached and (now_ts - cached[0] < _GYM_SUGGESTIONS_CACHE_TTL_SECONDS):
		# refresh LRU position
		_gym_suggestions_cache.move_to_end(cache_key)
		return jsonify(cached[1]), 200

	# Basic rate limit: 60 requests/minute per IP (best-effort; per-process)
	ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "unknown").split(",")[0].strip()
	now = time.time()
	window_seconds = _GYM_SUGGESTIONS_RATE_WINDOW_SECONDS
	max_requests = _GYM_SUGGESTIONS_RATE_MAX_REQUESTS

	# Cleanup stale IP buckets so this map cannot grow forever.
	# Keep this lightweight and local (per-process best effort).
	for known_ip in list(_gym_suggestions_requests.keys()):
		old_times = _gym_suggestions_requests.get(known_ip) or []
		fresh_times = [t for t in old_times if now - t < window_seconds]
		if fresh_times:
			_gym_suggestions_requests[known_ip] = fresh_times
		else:
			_gym_suggestions_requests.pop(known_ip, None)

	# Hard cap the amount of IP buckets as a safety valve.
	if len(_gym_suggestions_requests) > _GYM_SUGGESTIONS_RATE_MAX_IPS:
		# Remove oldest buckets first based on latest request timestamp.
		ordered_ips = sorted(
			_gym_suggestions_requests.items(),
			key=lambda item: item[1][-1] if item[1] else 0
		)
		for stale_ip, _ in ordered_ips[:len(_gym_suggestions_requests) - _GYM_SUGGESTIONS_RATE_MAX_IPS]:
			_gym_suggestions_requests.pop(stale_ip, None)

	times = [t for t in _gym_suggestions_requests[ip] if now - t < window_seconds]
	if len(times) >= max_requests:
		_gym_suggestions_requests[ip] = times
		return jsonify({"predictions": [], "status": "OVER_QUERY_LIMIT"}), 429
	times.append(now)
	_gym_suggestions_requests[ip] = times

	try:
		# IMPORTANT: We only want gyms/sportscholen (not McDonald's/Albert Heijn/etc).
		# Use Places Text Search with type=gym.
		# This returns "results" rather than "predictions", but is much better filtered.
		query = q
		ql = q.lower()
		if "sportschool" not in ql and "gym" not in ql:
			query = f"{q} sportschool"

		data = _google_places_get_json(
			"https://maps.googleapis.com/maps/api/place/textsearch/json",
			{
				"query": query,
				"type": "gym",
				"language": "nl",
				"region": "nl",
			},
		)

		status = data.get("status")
		if status not in ("OK", "ZERO_RESULTS"):
			return jsonify(
				{
					"predictions": [],
					"status": status or "ERROR",
					"error_message": data.get("error_message"),
				}
			), 200

		preds: list[dict] = []
		for r in (data.get("results") or [])[:6]:
			preds.append(
				{
					"place_id": r.get("place_id"),
					"main_text": (r.get("name") or "").strip(),
					"secondary_text": (r.get("formatted_address") or "").strip(),
					"description": (r.get("name") or "").strip(),
				}
			)

		payload = {"predictions": preds, "status": status}
		_gym_suggestions_cache[cache_key] = (now_ts, payload)
		_gym_suggestions_cache.move_to_end(cache_key)
		if len(_gym_suggestions_cache) > _GYM_SUGGESTIONS_CACHE_MAX:
			_gym_suggestions_cache.popitem(last=False)
		return jsonify(payload), 200
	except Exception as e:
		print(f"[GYM SUGGESTIONS] Error: {e}")
		return jsonify({"predictions": [], "status": "ERROR"}), 200


@app.route("/api/vision-workout", methods=["POST"])
def vision_workout():
	"""AI workout generation endpoint for Vision chat - uses Groq API."""
	if not GROQ_AVAILABLE:
		return jsonify({"error": "Groq API not available. Please install groq package."}), 500
	
	# Load API key from environment variable only
	GROQ_API_KEY = os.getenv("GROQ_API_KEY")
	if not GROQ_API_KEY:
		return jsonify({"error": "Groq API key not configured. Set GROQ_API_KEY environment variable."}), 500
	
	try:
		data = request.get_json()
	except Exception as e:
		return jsonify({"error": f"Invalid request data: {str(e)}"}), 400
	
	if not data:
		return jsonify({"error": "No data provided"}), 400
	
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
- ALWAYS generate a workout - never return empty exercises array
- READ THE USER'S REQUEST CAREFULLY and understand what they ACTUALLY want
- Do NOT assume what the user wants based on keywords alone - interpret the full context
- If user specifies a NUMBER of exercises, you MUST create exactly that many exercises
- If user specifies exact exercises, use ONLY those exercises
- If user asks for a workout type (push/pull/legs), understand what they mean and create appropriate exercises
- If user mentions a muscle group, ONLY include exercises for that muscle group if they explicitly ask for it
- Give ONLY what the user asks for - if they ask for "just pushups", give ONLY pushups
- If user says "no X" or "replace X with Y", adjust accordingly
- Do NOT add extra exercises if user asks for specific ones
- Do NOT automatically create workouts just because a muscle group keyword is mentioned - understand the full context

Examples:
- User: "10 exercise push workout" → Create EXACTLY 10 push exercises (chest/shoulders/triceps)
- User: "5 exercise chest workout" → Create EXACTLY 5 chest exercises
- User: "I want to train my back today" → Create a back workout with appropriate exercises
- User: "just pushups" → {{"name": "Pushup Workout", "exercises": [{{"key": "push_up", "display": "Push-Up"}}]}}
- User: "bench press and tricep pushdown" → {{"name": "Workout", "exercises": [{{"key": "bench_press", "display": "Bench Press"}}, {{"key": "tricep_pushdown", "display": "Tricep Pushdown"}}]}}
- User: "I'm doing back exercises" → This is a statement, not a request for a workout. But if they say "make me a back workout", then create one.
"""
	
	try:
		# Groq SDK handles Authorization header internally
		# API key is loaded from environment variable only
		client = Groq(api_key=GROQ_API_KEY)
		
		# Wrap API call in try-except to catch any Groq SDK errors
		try:
			response = client.chat.completions.create(
			model="llama-3.3-70b-versatile",
			messages=[
				{"role": "system", "content": "You are a fitness expert. Return ONLY valid JSON, no explanations. Start your response with { and end with }."},
				{"role": "user", "content": prompt}
			],
			temperature=0.3,
			max_tokens=800
		)
		except Exception as groq_error:
			error_str = str(groq_error)
			print(f"[ERROR] Groq API error: {error_str}")
			import traceback
			traceback.print_exc()
			# Return a generic error message - frontend will use fallback workout
			return jsonify({"error": "AI service temporarily unavailable. Please try again in a moment."}), 500
		
		if not response or not hasattr(response, 'choices') or not response.choices:
			return jsonify({"error": "No response from AI. Please try again."}), 500
		
		if not response.choices[0] or not hasattr(response.choices[0], 'message'):
			return jsonify({"error": "Invalid response from AI. Please try again."}), 500
		
		if not response.choices[0].message or not hasattr(response.choices[0].message, 'content'):
			return jsonify({"error": "Empty response from AI. Please try again."}), 500
		
		content = response.choices[0].message.content
		if not content:
			return jsonify({"error": "Empty content from AI. Please try again."}), 500
		
		content = content.strip()
		
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
		
		# Try to find JSON object in the content (in case there's extra text)
		if "{" in content and "}" in content:
			start_idx = content.find("{")
			end_idx = content.rfind("}")
			if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
				content = content[start_idx:end_idx + 1]
		
		# Parse JSON with better error handling
		try:
			workout_json = json.loads(content)
		except json.JSONDecodeError as parse_error:
			print(f"[ERROR] JSON parse error: {parse_error}")
			print(f"[DEBUG] Content was: {content[:500]}")
			# Try to fix common JSON issues
			# Remove any trailing commas before closing braces/brackets
			import re
			content = re.sub(r',\s*}', '}', content)
			content = re.sub(r',\s*]', ']', content)
			try:
				workout_json = json.loads(content)
			except:
				raise ValueError(f"Failed to parse JSON response from AI. The AI may have returned invalid JSON. Original error: {parse_error}")
		
		# Validate and clean up the workout
		if not workout_json.get("exercises"):
			return jsonify({"error": "No exercises generated in workout"}), 500
		
		exercise_list = workout_json.get("exercises", [])
		print(f"[DEBUG] Found {len(exercise_list)} exercises in workout JSON")
		
		# Validate exercises exist in metadata
		valid_exercises = []
		for ex in exercise_list:
			key = ex.get("key", "").lower().strip()
			display = ex.get("display", "").strip()
			
			# Try to find exercise by key (exact match)
			meta_key = None
			for meta_key_candidate, meta in MACHINE_METADATA.items():
				if meta_key_candidate.lower() == key:
					meta_key = meta_key_candidate
					break
			
			# If not found by key, try by display name (exact match)
			if not meta_key:
				for meta_key_candidate, meta in MACHINE_METADATA.items():
					if meta.get("display", "").lower().strip() == display.lower():
						meta_key = meta_key_candidate
						break
			
			# If still not found, try fuzzy matching on display name
			if not meta_key and display:
				display_lower = display.lower()
				for meta_key_candidate, meta in MACHINE_METADATA.items():
					meta_display = meta.get("display", "").lower()
					# Check if display name contains key parts or vice versa
					if (display_lower in meta_display or meta_display in display_lower) and len(display_lower) > 3:
						meta_key = meta_key_candidate
						break
			
			# If still not found, try matching key parts
			if not meta_key and key:
				key_parts = key.replace("_", " ").split()
				for meta_key_candidate, meta in MACHINE_METADATA.items():
					meta_key_lower = meta_key_candidate.lower().replace("_", " ")
					# Check if all key parts are in the metadata key
					if all(part in meta_key_lower for part in key_parts if len(part) > 2):
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
			# Try to provide helpful error message
			invalid_exercises = [ex.get("display", ex.get("key", "unknown")) for ex in exercise_list if ex not in [{"key": v["key"], "display": v["display"]} for v in valid_exercises]]
			error_msg = f"No valid exercises found in workout. "
			if invalid_exercises:
				error_msg += f"Could not find: {', '.join(invalid_exercises[:3])}. "
			error_msg += "Please try using exercise names from the exercise list."
			return jsonify({"error": error_msg}), 500
		
		return jsonify({
			"workout": {
				"name": workout_json.get("name", "AI Workout"),
				"exercises": valid_exercises
			}
		})
	except (json.JSONDecodeError, ValueError) as e:
		error_msg = str(e)
		print(f"[ERROR] Failed to parse workout JSON: {error_msg}")
		if 'content' in locals():
			print(f"[DEBUG] Content was: {content[:500]}")
		# Provide user-friendly error message
		return jsonify({"error": "The AI returned an invalid response. Please try rephrasing your request or try again."}), 500
	except Exception as e:
		error_msg = str(e)
		print(f"[ERROR] Workout generation failed: {error_msg}")
		import traceback
		traceback.print_exc()
		# Check if it's a pattern matching error from Groq or any other error
		if "pattern" in error_msg.lower() or "match" in error_msg.lower() or "expected" in error_msg.lower() or "string" in error_msg.lower():
			# This is likely a Groq API error - return a generic error message
			return jsonify({"error": "AI service temporarily unavailable. Please try again in a moment."}), 500
		# Generic error for any other issues
		return jsonify({"error": "Failed to generate workout. Please try again."}), 500


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
	
	# Check if message mentions muscle groups - if so, this should be handled by workout generation, not chat
	muscle_groups = ["chest", "shoulder", "back", "bicep", "tricep", "leg", "quad", "hamstring", "glute", "calf", "abs", "core", "borst"]
	workout_keywords = ["workout", "make", "create", "maak", "train", "push", "pull", "legs", "oefeningen", "exercises"]
	msg_lower = message.lower()
	mentions_muscle = any(muscle in msg_lower for muscle in muscle_groups)
	mentions_workout = any(keyword in msg_lower for keyword in workout_keywords)
	
	# If user mentions muscle groups or workout keywords, redirect to workout generation
	if mentions_muscle or mentions_workout:
		try:
			workout_data = generate_workout_from_chat(message, "", workout_context)
			if workout_data and workout_data.get("exercises"):
				return jsonify({
					"workout": workout_data
				})
		except Exception as e:
			print(f"[ERROR] Workout generation error in chat: {e}")
	
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
