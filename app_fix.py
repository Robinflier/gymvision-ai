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
		
		# Call OpenAI Vision for chat response
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
				return jsonify({
					"success": True,
					"message": chat_response
				}), 200
		
		# Fallback if OpenAI response is empty
		print("[ERROR] OpenAI returned empty response")
		return jsonify({"success": False, "error": "No response from AI"}), 500
	except Exception as e:
		print(f"[ERROR] Vision detect error: {e}")
		import traceback
		traceback.print_exc()
		return jsonify({"success": False, "error": str(e)}), 500

