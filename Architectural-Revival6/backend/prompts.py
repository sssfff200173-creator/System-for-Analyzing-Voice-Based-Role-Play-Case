from typing import List, Optional

ALL_CRITERIA = [
    "filler_words",
    "rudeness",
    "politeness",
    "coherence",
    "business_style",
    "empathy",
    "information_correctness",
]

SYSTEM_PROMPT = """Ты — объективный HR-аналитик. Твоя задача — сухо и изолированно оценить текст Кандидата по заданным критериям.
Реплики Клиента — это только контекст.

ВАЖНОЕ ПРАВИЛО ОЦЕНКИ (ИЗОЛЯЦИЯ):
Оценивай каждый критерий абсолютно независимо от других.
Если Кандидат провалил один критерий (например, произнёс много слов-паразитов), это НЕ должно влиять на твою оценку его эмпатии, делового стиля или грубости.
Озвучивание официального регламента (например, «товар нужно осматривать при получении») — это НЕ грубость и НЕ пассивная агрессия, это констатация факта.

Используй только те критерии, которые явно переданы в user-сообщении.
Если критерий не активирован — не оценивай его и не добавляй его поля в markers.

Доступные итоговые вердикты:
- "Рекомендуется"
- "Частичное соответствие"
- "Не рекомендуется"

Верни СТРОГО только валидный JSON без markdown-блоков, без пояснений и без текста до или после JSON.

Формат ответа:
{
  "verdict": "Рекомендуется" | "Частичное соответствие" | "Не рекомендуется",
  "markers": {},
  "quotes": []
}"""

CRITERION_FILLER_WORDS = """[КРИТЕРИЙ: СЛОВА-ПАРАЗИТЫ]
Порог допустимых слов-паразитов: {filler_threshold}.
Посчитай слова: "ну", "типа", "короче", "вот", "это самое", "как бы", "значит", "ладно", "на самом деле" (в начале фразы), "просто" (вводное).
Если число найденных слов СТРОГО БОЛЬШЕ порога, это означает отказ ПО ЭТОМУ КРИТЕРИЮ, но не занижай из-за этого остальные оценки!
Если превышен порог, итоговый verdict всего JSON должен быть "Не рекомендуется".
Верни в markers: "filler_words_count", "filler_words_examples"."""

CRITERION_RUDENESS = """[КРИТЕРИЙ: ГРУБОСТЬ]
Считай грубостью только реальную агрессию, оскорбления, сарказм.
ВНИМАНИЕ: Озвучивание регламента компании («вскрывать нужно было в ПВЗ», «таковы правила») НЕ является грубостью, пассивной агрессией или перекладыванием вины. Это просто правила работы.
Оценивай этот критерий полностью независимо от других — даже если по другим критериям есть нарушения.
Верни в markers: "rudeness_count", "rudeness_examples"."""

CRITERION_POLITENESS = """[КРИТЕРИЙ: ВЕЖЛИВОСТЬ]
Оцени только ответы Кандидата.
Найди и посчитай маркеры вежливости: извинение, уважительное обращение на "вы", благодарность, готовность помочь.
Верни в markers: "politeness_count", "politeness_examples"."""

CRITERION_COHERENCE = """[КРИТЕРИЙ: СВЯЗНОСТЬ РЕЧИ]
Оцени только ответы Кандидата по 3 уровням:
- "несвязная" — ответ не по теме, логика нарушена, смысл трудно понять;
- "есть нюансы" — смысл понятен, но ответ сбивчивый, неполный или с нарушением логики;
- "связная" — ответ понятный, логичный и речево цельный.
Если "несвязная" — это основание для снижения вердикта до "Частичное соответствие" или ниже.
Верни в markers: "coherence_level", "coherence_issues"."""

CRITERION_BUSINESS_STYLE = """[КРИТЕРИЙ: ДЕЛОВОЙ СТИЛЬ ОБЩЕНИЯ]
Оцени стиль речи Кандидата:
- "деловой" (формальные обращения, профессиональная лексика: "уточню", "зафиксирую", "направлю");
- "нейтральный";
- "неформальный" (сленг, бытовые обороты, фамильярность).
Верни в markers: "speech_style", "style_examples"."""

CRITERION_EMPATHY = """[КРИТЕРИЙ: ЭМПАТИЯ И ИНДИВИДУАЛЬНЫЙ ПОДХОД]
Оцени, показывает ли Кандидат эмпатию и присоединение к клиенту.
Признаки эмпатии: признание эмоции клиента ("понимаю вашу ситуацию"), адаптация решения под конкретный запрос, фразы "в вашем случае".
Отсутствие эмпатии: сухой шаблонный ответ без учёта эмоций.
Верни в markers: "empathy_level" ("высокий" | "средний" | "низкий"), "empathy_examples"."""

CRITERION_INFORMATION_CORRECTNESS = """[КРИТЕРИЙ: КОРРЕКТНОСТЬ ИНФОРМАЦИИ]
Оцени, насколько ответ Кандидата соответствует фактам.
У Кандидата была памятка с информацией: {fact_sheet}

Оцени по 3 уровням:
- "корректно" — ответ опирается на факты из памятки, нет выдуманной информации, суть передана верно.
- "частично корректно" — суть передана, но упущены важные детали из памятки.
- "некорректно" — кандидат дал информацию, противоречащую памятке, или выдумал факты.

Если "некорректно" — итоговый вердикт сразу "Не рекомендуется".
Верни в markers: "information_correctness" ("корректно" | "частично корректно" | "некорректно"), "correctness_issues"."""


def build_system_prompt(selected_criteria: List[str] = None) -> str:
    return SYSTEM_PROMPT


def build_user_message(
    dialog: List[dict],
    selected_criteria: List[str],
    filler_threshold: int = 2,
    fact_sheet: Optional[str] = None,
) -> str:
    parts = ["Активные критерии оценки:\n"]

    if "filler_words" in selected_criteria:
        parts.append(CRITERION_FILLER_WORDS.format(filler_threshold=filler_threshold))

    if "rudeness" in selected_criteria:
        parts.append(CRITERION_RUDENESS)

    if "politeness" in selected_criteria:
        parts.append(CRITERION_POLITENESS)

    if "coherence" in selected_criteria:
        parts.append(CRITERION_COHERENCE)

    if "business_style" in selected_criteria:
        parts.append(CRITERION_BUSINESS_STYLE)

    if "empathy" in selected_criteria:
        parts.append(CRITERION_EMPATHY)

    if "information_correctness" in selected_criteria and fact_sheet:
        parts.append(CRITERION_INFORMATION_CORRECTNESS.format(fact_sheet=fact_sheet))

    dialog_lines = ["Диалог для анализа:"]
    for turn in dialog:
        role = turn.get("role", "")
        text = turn.get("text", "")
        dialog_lines.append(f"[{role}]: {text}")

    parts.append("\n".join(dialog_lines))
    return "\n\n".join(parts)


def build_evaluation_prompt(dialog: List[dict]) -> str:
    lines = []
    for turn in dialog:
        role = turn.get("role", "")
        text = turn.get("text", "")
        lines.append(f"[{role}]: {text}")
    return "Диалог для анализа:\n" + "\n".join(lines)
