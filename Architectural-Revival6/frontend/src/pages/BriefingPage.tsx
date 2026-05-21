interface Props {
  onReady: () => void;
  caseKey?: string;
}

function MariaBriefing() {
  return (
    <div className="bg-gray-50 rounded-2xl p-7 mb-5 border border-gray-200">
      <p className="font-bold text-gray-900 text-sm mb-1">
        Памятка для выполнения задания
      </p>
      <p className="text-gray-400 text-xs leading-relaxed mb-3">
        Пожалуйста, ознакомьтесь с описанием ниже, так как вернуться к данной
        информации при дальнейшем выполнении задания не получится
      </p>
      <p className="text-gray-800 text-base leading-relaxed">
        Вы работаете в компании-агрегаторе «Доставочка.Ру», где
        предусмотрена отправка заказов курьерской службой, а также в пункты
        выдачи. При заказе товара через пункт выдачи по правилам нашей
        организации необходимо осмотреть товар, и, в случае обнаружения
        дефектов, оформить возврат. После получения товара из пункта
        выдачи, вернуть заказ уже не получится, единственный вариант —
        связаться напрямую с продавцом-поставщиком товара.
      </p>
    </div>
  );
}

function FilippBriefing() {
  return (
    <div className="bg-gray-50 rounded-2xl p-7 mb-5 border border-gray-200">
      <p className="font-bold text-gray-900 text-sm mb-1">
        Памятка для выполнения задания
      </p>
      <p className="text-gray-400 text-xs leading-relaxed mb-3">
        Пожалуйста, ознакомьтесь с описанием ниже, так как вернуться к данной
        информации при дальнейшем выполнении задания не получится
      </p>
      <p className="text-gray-800 text-base leading-relaxed mb-4">
        Вы работаете в голосовой поддержке. Клиент обращается в голосовую
        поддержку с просьбой восстановить для редактирования заблокированное
        проплаченное объявление о сдаче квартиры. Голосовая поддержка не может
        решить вопрос пользователя устно и просит обратиться его самостоятельно
        в чат или на почту.
      </p>
      <div className="bg-gray-200 rounded-xl px-5 py-4 mb-4">
        <p className="text-yellow-600 text-sm font-semibold mb-1">
          Почему не можем дать ответ в голосовой линии?
        </p>
        <p className="text-gray-500 text-sm leading-relaxed">
          Голосовая линия по данным вопросам сейчас отключена — на вопрос
          смогут ответить и помочь в течение рабочего дня в письменном канале.
        </p>
      </div>
      <p className="text-gray-800 text-base leading-relaxed">
        Пользователь негативно реагирует на просьбу написать самостоятельно.
        Настаивает на том, чтобы вопрос решили в голосе, и требует компенсацию
        за простой. Также пользователь крайне негативно указывает на то, что
        причина блокировки написана непонятно, — хочет, чтобы писали подробно.
      </p>
    </div>
  );
}

export default function BriefingPage({ onReady, caseKey }: Props) {
  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-[652px] p-10">
        {caseKey === "filipp" ? <FilippBriefing /> : <MariaBriefing />}

        <p className="text-gray-700 text-sm leading-relaxed mb-6">
          Клиент задаст несколько вопросов, на каждый из которых Вы сможете
          записать ответ. Можно использовать любые скрипты и фразы, главное —
          общаться вежливо, клиентоориентированно, и предоставить клиенту
          информацию, соответствующую правилам компании.
        </p>

        <button
          onClick={onReady}
          className="w-full bg-accent hover:bg-accent-hover text-gray-900 font-bold py-4 rounded-xl text-base transition active:scale-95"
        >
          Всё понятно, приступаем
        </button>

        <p className="mt-6 text-xs text-gray-400 leading-relaxed text-center">
          При возникновении технических проблем, пожалуйста, напишите (со
          снимками экрана) на почту:{" "}
          <a href="mailto:role_cases_assessor.sup@mail.ru" className="underline hover:text-gray-600">
            role_cases_assessor.sup@mail.ru
          </a>
        </p>
      </div>
    </div>
  );
}
