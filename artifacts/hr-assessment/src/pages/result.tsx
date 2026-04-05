import { useLocation, useParams } from "wouter";
import { useGetResult } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Loader2, RefreshCw } from "lucide-react";

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

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Вердикт</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge 
                variant={isRecommended ? "default" : "destructive"} 
                className="text-lg px-4 py-1"
              >
                {result.evaluation.verdict}
              </Badge>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Маркеры речи</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-3xl font-bold">{result.evaluation.markers.fillerWordCount}</div>
                <div className="text-sm text-muted-foreground mt-1">Слов-паразитов</div>
              </div>
              <div>
                <div className="text-3xl font-bold">{result.evaluation.markers.politenessMarkers}</div>
                <div className="text-sm text-muted-foreground mt-1">Маркеров вежливости</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Ключевые фразы кандидата</CardTitle>
          </CardHeader>
          <CardContent>
            {result.evaluation.quotes.length > 0 ? (
              <ul className="space-y-3">
                {result.evaluation.quotes.map((quote, idx) => (
                  <li key={idx} className="flex gap-3 text-sm bg-muted/50 p-3 rounded-md border border-border/50">
                    <span className="text-primary font-bold">"</span>
                    <span>{quote}</span>
                    <span className="text-primary font-bold">"</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Нет выделенных фраз</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Полный транскрипт</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-lg whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground border border-border">
              {result.fullTranscript}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
