import { useLocation, useParams } from "wouter";
import { useGetResult } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Loader2, RefreshCw } from "lucide-react";

const CATEGORIES: { key: string; label: string; className: string }[] = [
  { key: "ПАРАЗИТ",    label: "Слова-паразиты",  className: "border-amber-400 bg-amber-50 text-amber-900" },
  { key: "ГРУБОСТЬ",   label: "Грубость / негатив", className: "border-red-400 bg-red-50 text-red-900" },
  { key: "ВЕЖЛИВОСТЬ", label: "Вежливость",       className: "border-green-400 bg-green-50 text-green-900" },
];

function groupQuotes(quotes: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const raw of quotes) {
    for (const cat of CATEGORIES) {
      if (raw.startsWith(cat.key + ": ")) {
        if (!groups[cat.key]) groups[cat.key] = [];
        groups[cat.key].push(raw.slice(cat.key.length + 2));
        break;
      }
    }
  }
  return groups;
}

export default function ResultPage() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();

  const { data: result, isLoading, isError } = useGetResult(id, {
    query: { enabled: !!id }
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (isError || !result) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center p-4 text-center">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Результат не найден</h2>
            <Button onClick={() => setLocation("/")}>На главную</Button>
          </div>
        </div>
      </Layout>
    );
  }

  const isRecommended = result.evaluation.verdict === "Рекомендуется";
  const grouped = groupQuotes(result.evaluation.quotes);

  const counts = {
    "ПАРАЗИТ":    grouped["ПАРАЗИТ"]?.length    ?? 0,
    "ГРУБОСТЬ":   grouped["ГРУБОСТЬ"]?.length   ?? 0,
    "ВЕЖЛИВОСТЬ": grouped["ВЕЖЛИВОСТЬ"]?.length ?? 0,
  };

  const candidateLines = result.fullTranscript
    .split("\\n")
    .filter(line => line.startsWith("Кандидат:"))
    .map((line, i) => ({ idx: i + 1, text: line.replace(/^Кандидат:\s*/, "") }));

  const hasAnyQuotes = CATEGORIES.some(c => (grouped[c.key]?.length ?? 0) > 0);

  return (
    <Layout>
      <div className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 space-y-6">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Отчет: {result.candidateName}</h1>
            <p className="text-muted-foreground mt-1">
              {format(new Date(result.createdAt), "d MMMM yyyy, HH:mm", { locale: ru })}
            </p>
          </div>
          <Button onClick={() => setLocation("/")} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Новая оценка
          </Button>
        </div>

        {/* 1. Счетчики */}
        <div className="grid gap-6 md:grid-cols-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Вердикт</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={isRecommended ? "default" : "destructive"} className="text-sm px-3 py-1">
                {result.evaluation.verdict}
              </Badge>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-amber-600 uppercase tracking-wider">Слова-паразиты</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{counts["ПАРАЗИТ"]}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-red-600 uppercase tracking-wider">Грубость</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{counts["ГРУБОСТЬ"]}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-green-600 uppercase tracking-wider">Вежливость</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{counts["ВЕЖЛИВОСТЬ"]}</div>
            </CardContent>
          </Card>
        </div>

        {/* 2. Детальный анализ */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Детальный анализ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {hasAnyQuotes ? (
              CATEGORIES.map(cat =>
                grouped[cat.key]?.length ? (
                  <div key={cat.key}>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {cat.label}
                    </h3>
                    <ul className="space-y-2">
                      {grouped[cat.key].map((text, idx) => (
                        <li
                          key={idx}
                          className={`text-sm p-3 rounded-md border ${cat.className}`}
                        >
                          «{text}»
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null
              )
            ) : (
              <p className="text-sm text-muted-foreground">Нет выделенных маркеров</p>
            )}
          </CardContent>
        </Card>

        {/* 3. Ответы кандидата по репликам */}
        {candidateLines.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Ответы кандидата</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {candidateLines.map(({ idx, text }) => (
                <div key={idx} className="flex gap-3 items-start">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                    {idx}
                  </span>
                  <p className="text-sm leading-relaxed">{text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

      </div>
    </Layout>
  );
}
