# GymVision AI - Project Summary for base44

## Wat is het?

Fitness app die **AI gebruikt om oefeningen te herkennen uit foto's**. Gebruikers maken een foto van gym equipment, app herkent de oefening automatisch, toont instructievideo's, en trackt workouts.

**Kernfeatures:**
- AI oefening detectie (5 YOLO modellen)
- 90+ oefeningen met YouTube video's
- Workout builder met sets/reps/gewicht
- Progress tracking & analytics
- AI fitness assistant ("Vision" chatbot)

---

## Tech Stack

- **Backend**: Flask (Python) - REST API
- **Frontend**: Vanilla JavaScript
- **AI**: 5 YOLO PyTorch modellen (~500MB-1GB)
- **Database**: SQLite
- **Chat**: Groq API

---

## Wat heb je nodig?

1. **Source code** - app.py, HTML, JS, CSS
2. **5 AI model files** (.pt) - **KRITISCH!** Zonder deze werkt AI niet
3. **91 oefening images** (JPG files)
4. **Logo's & icons** (PNG files)
5. **Environment variables**: SECRET_KEY, GROQ_API_KEY, MAIL credentials

---

## Hoe het werkt

1. Gebruiker maakt foto → upload naar `/predict`
2. 5 YOLO modellen analyseren foto → beste match geselecteerd
3. Oefening info getoond → video, spiergroepen, instructies
4. Workout builder → oefeningen toevoegen, sets/reps/gewicht
5. Progress tracking → charts, PR's, spier focus

**Data**: User accounts in SQLite, workouts in browser localStorage

---

## Belangrijk voor base44

- **Model files zijn groot** (~500MB-1GB) - zorg voor storage
- **Database maakt zichzelf aan** - SQLite file op eerste run
- **Email nodig** - voor user verificatie (SMTP)
- **Groq API key** - voor AI chat feature

**Alles staat in BASE44_BUILD_GUIDE.md voor details!**

