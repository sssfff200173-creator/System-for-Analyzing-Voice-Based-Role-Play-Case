import os
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def create_audio(text, filename):
    response = client.audio.speech.create(
        model="tts-1",
        voice="nova",
        input=text
    )
    response.stream_to_file(f"frontend/public/{filename}")

create_audio("Здрасте, я купила телефон с доставкой, забрала из пункта выдачи заказов, а когда пришла домой, поняла, что там царапина, хотела вернуть в пункт выдачи заказов, а там не принимают, что делать?", "phrase1.mp3")
create_audio("Я уже 3 раз звоню вам, вы ничего не можете решить, для чего вы там сидите?", "phrase2.mp3")
print("Аудио готово!")