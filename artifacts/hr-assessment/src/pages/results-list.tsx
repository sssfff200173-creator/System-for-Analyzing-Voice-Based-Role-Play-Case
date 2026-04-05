import { useLocation } from "wouter";
import { useListResults } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Loader2 } from "lucide-react";

export default function ResultsListPage() {
  const [, setLocation] = useLocation();
  const { data: results, isLoading, isError } = useListResults();

  return (
    <Layout>
      <div className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Все результаты</h1>
        
        <Card className="shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-destructive">
              Ошибка при загрузке результатов
            </div>
          ) : results && results.length > 0 ? (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[150px]">Дата</TableHead>
                  <TableHead>Кандидат</TableHead>
                  <TableHead>Вердикт</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result) => {
                  const isRecommended = result.evaluation.verdict === "Рекомендуется";
                  return (
                    <TableRow 
                      key={result.id} 
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setLocation(`/result/${result.id}`)}
                    >
                      <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                        {format(new Date(result.createdAt), "dd MMM yyyy, HH:mm", { locale: ru })}
                      </TableCell>
                      <TableCell className="font-medium text-base">
                        {result.candidateName}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isRecommended ? "default" : "destructive"}>
                          {result.evaluation.verdict}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <CardContent className="p-12 text-center text-muted-foreground">
              Нет сохраненных результатов
            </CardContent>
          )}
        </Card>
      </div>
    </Layout>
  );
}
