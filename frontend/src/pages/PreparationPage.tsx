interface Props {
  onReady: () => void;
}

export default function PreparationPage({ onReady }: Props) {
  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-xl p-10">
        <div className="bg-gray-50 rounded-2xl p-7 mb-6 border border-gray-200">
          <p className="text-gray-800 text-base leading-relaxed mb-5">
            Сейчас Вам предстоит поговорить с виртуальным клиентом. Пожалуйста, убедитесь, что в помещении хорошая слышимость и Вас никто не отвлекает. При разговоре опирайтесь на правила из «памятки для выполнения задания».
          </p>
          <p className="text-gray-800 text-base leading-relaxed">
            Вы можете использовать любые скрипты и фразы, главное — общаться вежливо и предоставить всю необходимую информацию.
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-5 mb-5 border border-gray-200">
          <p className="font-bold text-gray-900 text-sm mb-3">Памятка для выполнения задания</p>
          <p className="text-gray-700 text-sm leading-relaxed">
            Вы работаете в компании, где предусмотрена отправка заказов курьерской службой, а также в пункты выдачи. При заказе товара через пункт выдачи по правилам организации необходимо осмотреть товар, и, в случае обнаружения дефектов, оформить возврат. После получения товара из пункта выдачи, вернуть заказ уже не получится.
          </p>
        </div>

        <button
          onClick={onReady}
          className="w-full bg-accent hover:bg-accent-hover text-gray-900 font-bold py-4 rounded-xl text-base transition active:scale-95"
        >
          Всё понятно, готов к заданию
        </button>

        <p className="mt-6 text-xs text-gray-400 leading-relaxed text-center">
          При возникновении технических проблем, пожалуйста, напишите (со снимками экрана) на почту:{" "}
          <a href="mailto:role_cases_assessor.sup@mail.ru" className="underline hover:text-gray-600">
            role_cases_assessor.sup@mail.ru
          </a>
        </p>
      </div>
    </div>
  );
}
