# Quick Test Guide - Poort 5004

## 1. Start de server (als die niet draait)

```bash
cd /Users/robinflier/Documents/GV_AI
PORT=5004 python3 app.py
```

Zorg dat `OPENAI_API_KEY` is ingesteld:
```bash
export OPENAI_API_KEY="sk-..."
```

## 2. Test met eenvoudig script

In een **nieuwe terminal**:

```bash
cd /Users/robinflier/Documents/GV_AI
./test_simple.sh 5004 ../images/benchpress.jpg
```

## 3. Of test met curl direct

```bash
curl -X POST http://localhost:5004/api/recognize-exercise \
  -F "image=@../images/benchpress.jpg"
```

## 4. Of test met Python script

```bash
python3 test_recognize_exercise.py ../images/benchpress.jpg
```

## Expected Output

```json
{"exercise": "bench press"}
```

of

```json
{"exercise": "unknown exercise"}
```

## Troubleshooting

- **Connection refused**: Server draait niet → Start server op poort 5004
- **OpenAI API key not configured**: Zet `export OPENAI_API_KEY="sk-..."`
- **Image not found**: Check of het image pad klopt

