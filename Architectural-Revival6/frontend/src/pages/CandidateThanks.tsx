interface Props {
  name: string;
}

export default function CandidateThanks({ name }: Props) {
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-6">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Спасибо!</h1>
        {name && (
          <p className="text-gray-500 text-sm mb-4">{name}</p>
        )}
        <p className="text-gray-600 text-sm leading-relaxed">
          Ваши ответы успешно записаны. Мы свяжемся с вами по результатам оценки.
        </p>

        <p className="mt-8 text-xs text-gray-400 leading-relaxed">
          При возникновении технических проблем, пожалуйста, напишите (со снимками экрана) на почту:{" "}
          <a href="mailto:role_cases_assessor.sup@mail.ru" className="underline hover:text-gray-600">
            role_cases_assessor.sup@mail.ru
          </a>
        </p>
      </div>
    </div>
  );
}
