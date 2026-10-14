from flask import Flask, request, jsonify
from flask_cors import CORS
from faster_whisper import WhisperModel
import os
import tempfile

app = Flask(__name__)
CORS(app)

print("Loading local Whisper model...")
model = WhisperModel("base", device="cpu", compute_type="int8")
print("Speech model ready.")


@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "audio" not in request.files:
        return jsonify({"error": "No audio received"}), 400

    audio = request.files["audio"]

    # Accept only English or Hindi
    language = request.form.get("language", "en").lower()

    if language not in ("en", "hi"):
        return jsonify({
            "error": "Language must be 'en' or 'hi'."
        }), 400

    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=suffix, delete=False
        ) as temp:
            temp_path = temp.name
            audio.save(temp_path)

        segments, _ = model.transcribe(
    temp_path,
    task="translate",
    beam_size=5,
    vad_filter=True
)

        text = " ".join(
            segment.text.strip() for segment in segments
        ).strip()

        return jsonify({
            "text": text,
            "language": language
        })

    except Exception:
        app.logger.exception("Transcription failed")
        return jsonify({
            "error": "Transcription failed. Check the server terminal."
        }), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5001,
        debug=False
    )
