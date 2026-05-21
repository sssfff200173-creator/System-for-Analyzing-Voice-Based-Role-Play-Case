import os
from pathlib import Path
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENAI_API_KEY", "")
)

Path("audio_cache").mkdir(exist_ok=True)

def create_audio(text, filename):
    try:
        response = client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=text
        )
        response.stream_to_file(f"audio_cache/{filename}")
        print(f"Created {filename}")
    except Exception as e:
        print(f"Error (OpenRouter might not support TTS): {e}")

create_audio("Здрасте, я купила телефон с доставкой, забрала из пункта выдачи заказов, а когда пришла домой, поняла, что там царапина, хотела вернуть в пункт выдачи заказов, а там не принимают, что делать?", "phrase_0.mp3")
create_audio("Я уже 3 раз звоню вам, вы ничего не можете решить, для чего вы там сидите?", "phrase_1.mp3")
